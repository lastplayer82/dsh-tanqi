/**
 * LLM channel helpers for the dsh-tanqi host half.
 *
 * Channel priority (the plan's 方案B): reuse the host's own LLM service
 * (`ctx.llm.stream`, zero configuration — whatever model the user already
 * configured in DSH) ; when the host has no usable route, the browser may
 * supply a DeepSeek API key and the host calls api.deepseek.com server-side
 * (keeps the key out of third-party CORS and works from LAN deployments).
 */

import type { Context } from '@deepseek-ai/cordis'
import { writeFile } from 'node:fs/promises'
import { BlockAssembler, createUserMessage, ReasoningEffortId, type FinishReason, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** A resolved provider/model route for one call. */
export interface LlmRoute {
  provider: string
  model: string
}

/** Typed failure carrying a stable machine code (mirrors LlmError's taxonomy). */
export class TanqiLlmError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TanqiLlmError'
    this.code = code
  }
}

/**
 * Output hit the model's max-token cap but still produced usable partial text.
 * The caller may try to parse the partial (the JSON repair pass tolerates a
 * truncated tail); only when that fails should it surface the hard error.
 */
export class TruncatedOutputError extends TanqiLlmError {
  readonly partial: string
  constructor(partial: string) {
    super('探奇：模型输出达到 token 上限，请重试', 'MAX_TOKENS')
    this.name = 'TruncatedOutputError'
    this.partial = partial
  }
}

/** Settings namespace of the direct DeepSeek adapter (fallback route discovery). */
const LLM_DEEPSEEK_NS = settingsNamespace('llm-deepseek')

/**
 * Resolve the model route the host can call right now.
 *
 * Order: an explicit plugin-config override (provider+model together) → the
 * agent default model selection (settings `agent-default-model`, live) → the
 * direct DeepSeek adapter's model catalog in settings `llm-deepseek` → none.
 * @param ctx - host context (llm/settings/agentDefaultModel services).
 * @param override - optional pinned provider/model from plugin config.
 * @returns the route, or undefined when no usable channel exists.
 */
export function resolveRoute(ctx: Context, override?: { provider?: string; model?: string }): LlmRoute | undefined {
  if (override !== undefined && typeof override.provider === 'string' && override.provider !== ''
    && typeof override.model === 'string' && override.model !== '') {
    return { provider: override.provider, model: override.model }
  }
  const adm = ctx.get('agentDefaultModel') as
    | { currentSelection(): { provider?: string; model?: string } }
    | undefined
  if (adm !== undefined && typeof adm.currentSelection === 'function') {
    try {
      const selection = adm.currentSelection()
      if (selection !== undefined && typeof selection.provider === 'string' && selection.provider !== ''
        && typeof selection.model === 'string' && selection.model !== '') {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      // The service exists but misbehaved; fall through.
    }
  }
  try {
    const settings = ctx.get('settings') as { get(namespace: unknown): unknown } | undefined
    const value = settings?.get(LLM_DEEPSEEK_NS) as { models?: Array<{ id?: unknown }> } | undefined
    const models = Array.isArray(value?.models) ? value.models : []
    const first = models.find((model) => typeof model?.id === 'string' && model.id !== '')
    if (first !== undefined) return { provider: 'deepseek', model: String(first.id) }
  } catch {
    // Settings service unavailable; no fallback possible.
  }
  return undefined
}

/** Translate a terminal finish reason into a typed failure (stop returns undefined). */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const error = new TanqiLlmError(finish.failure.message, finish.failure.code)
      return error
    }
    case 'max-tokens':
      return new TanqiLlmError('探奇：模型输出达到 token 上限，请重试', 'MAX_TOKENS')
    case 'tool-calls':
      return new TanqiLlmError('探奇：模型意外请求了工具调用', 'UNEXPECTED_TOOL_CALL')
    default:
      return new TanqiLlmError('探奇：不支持的结束原因', 'BAD_FINISH')
  }
}

/** One text-only model call through the host LLM service; resolves to the full text. */
export async function generateViaDsh(
  ctx: Context,
  route: LlmRoute,
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number; reasoningEffort?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const message = createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-tanqi' },
  })
  const request: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages: [message],
    system,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    reasoningEffort: options.reasoningEffort === undefined ? undefined : ReasoningEffortId(options.reasoningEffort),
    signal: options.signal,
  }
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk)
  } catch (error) {
    throw new TanqiLlmError(
      error instanceof Error ? `探奇：模型通道调用失败（${error.message}）` : '探奇：模型通道调用失败',
      'STREAM_FAILED',
    )
  }
  const finish = assembler.finish
  const blocks = assembler.blocks()
  const text = blocks
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (finish.kind === 'max-tokens') {
    // Diagnostics: dump usage + block inventory so a repeat failure is
    // self-explanatory (was the budget eaten by reasoning? did text arrive at
    // all? how long were the blocks?). Writes are best-effort.
    try {
      await writeFile(
        'D:\\Dsh\\plugins\\dsh-tanqi\\debug-stream.json',
        JSON.stringify({
          ts: new Date().toISOString(),
          provider: route.provider,
          model: route.model,
          maxTokens: options.maxTokens,
          reasoningEffort: options.reasoningEffort,
          finish,
          usage: assembler.usage,
          blocks: blocks.map((block) => ({
            type: block.type,
            len: (block as { text?: string }).text?.length ?? 0,
          })),
        }, null, 2),
      )
    } catch {
      // Diagnostics must never break generation.
    }
    // Output was cut off at the cap, but the partial text may already be a
    // complete-enough JSON payload (the repair pass can close a truncated
    // tail). Hand it up for a parse attempt; only a parse failure is fatal.
    if (text.trim() !== '') throw new TruncatedOutputError(text)
    // No text at all: dump every block (including reasoning) so the caller's
    // diagnostics show what actually consumed the budget.
    const dump = blocks
      .map((block) => (block.type === 'tool-call' ? '' : (block as { text?: string }).text ?? ''))
      .join('')
    if (dump.trim() !== '') throw new TruncatedOutputError(dump)
    throw new TanqiLlmError('探奇：模型输出达到 token 上限，请重试', 'MAX_TOKENS')
  }
  const terminal = finishError(finish)
  if (terminal !== undefined) throw terminal
  if (blocks.some((block) => block.type === 'tool-call')) {
    throw new TanqiLlmError('探奇：模型输出包含工具调用，无法解析', 'UNEXPECTED_TOOL_CALL')
  }
  if (text.trim() === '') throw new TanqiLlmError('探奇：模型没有返回内容', 'EMPTY')
  return text
}

/** One text-only model call straight to api.deepseek.com with a user-supplied key. */
export async function generateViaKey(
  apiKey: string,
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const controller = new AbortController()
  const watchdog = setTimeout(() => controller.abort(), 150_000)
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: options.maxTokens ?? 1200,
        temperature: options.temperature ?? 0.7,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const body = await response.json() as { error?: { message?: string } }
        if (typeof body?.error?.message === 'string' && body.error.message !== '') detail = body.error.message
      } catch {
        // Keep the status-only detail.
      }
      throw new TanqiLlmError(`探奇：DeepSeek API 调用失败（${detail}）`, response.status === 401 ? 'BAD_KEY' : 'API_ERROR')
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (content.trim() === '') throw new TanqiLlmError('探奇：模型没有返回内容', 'EMPTY')
    return content
  } finally {
    clearTimeout(watchdog)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Extract the first balanced JSON object from a model reply. Tolerates stray
 * prose and Markdown fences; when plain parsing fails, repairs the common
 * model-output defects (unescaped quotes, raw newlines inside strings,
 * trailing commas, a truncated tail) before retrying. Returns undefined when
 * nothing parses.
 */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const direct = tryParseJson(cleaned)
  if (direct !== undefined) return direct
  const repaired = repairJson(cleaned)
  return tryParseJson(repaired)
}

/** JSON.parse that never throws (undefined on failure). */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Single-pass repair of the defects LLMs most often leave in JSON: unescaped
 * double quotes inside string values, raw newlines/tabs inside strings,
 * trailing commas, and a truncated tail (unclosed string / object). The scan
 * is conservative — a string terminator quote is one whose next non-whitespace
 * character is `, } ] :` or the end, which holds for every well-formed JSON
 * value the model emits; anything else inside a string is content and gets
 * escaped. Valid JSON passes through unchanged (the direct parse already won).
 */
function repairJson(text: string): string {
  const start = text.indexOf('{')
  if (start < 0) return text
  let out = ''
  let inString = false
  let escaped = false
  const stack: Array<'{' | '['> = []
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index]
    if (inString) {
      if (escaped) {
        out += ch
        escaped = false
        continue
      }
      if (ch === '\\') {
        out += ch
        escaped = true
        continue
      }
      if (ch === '"') {
        let next = index + 1
        while (next < text.length && /\s/.test(text[next])) next += 1
        const follows = next >= text.length ? '' : text[next]
        if (follows === '' || follows === ',' || follows === '}' || follows === ']' || follows === ':') {
          inString = false
          out += '"'
        } else {
          out += '\\"' // unescaped content quote — escape it
        }
        continue
      }
      if (ch === '\n' || ch === '\r' || ch === '\t') {
        out += '\\n' // raw control whitespace is invalid inside a string
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') {
      inString = true
      out += '"'
      continue
    }
    if (ch === '{') {
      stack.push('{')
      out += ch
      continue
    }
    if (ch === '[') {
      stack.push('[')
      out += ch
      continue
    }
    if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '['
      if (stack.length > 0 && stack[stack.length - 1] === expected) {
        stack.pop()
        out += ch
        if (stack.length === 0) break // balanced close — ignore any trailing prose
      }
      // Unmatched closer: a stray closing brace (e.g. a mis-closed array).
      // Drop it instead of popping an unrelated opener — that used to corrupt
      // the repaired JSON into an unparseable shape.
      continue
    }
    out += ch
  }
  if (inString) out += '"' // truncated string: close it
  while (stack.length > 0) {
    out += stack.pop() === '{' ? '}' : ']' // truncated containers: close them
  }
  return out.replace(/,\s*([}\]])/g, '$1') // drop trailing commas
}
