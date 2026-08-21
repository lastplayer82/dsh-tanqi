/**
 * The /api/dsh-tanqi route family: a status probe (is the host LLM channel
 * usable) and the generation endpoint (discover / deep / similar). Every route
 * carries the same loopback-only trust fence as the other dsh plugins
 * — these endpoints spend the user's model tokens, so LAN-exposed dsh web
 * deployments must not serve them to strangers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { TanqiLlmError, TruncatedOutputError, extractJson, generateViaDsh, generateViaKey, resolveRoute, type LlmRoute } from './llm.ts'
import { deepLayer1User, deepLayer2User, discoverSystem, deepSystem, discoverUser, normalizeLang, similarSystem, similarUser } from './prompts.ts'
import {
  TANQI_API,
  type SimilarPointPayload,
  type TanqiGenerateData,
  type TanqiGenerateRequest,
  type TanqiItemPayload,
  type TanqiStatePayload,
} from './protocol.ts'

/** Cap on JSON request bodies (generate payloads are small). */
const MAX_JSON_BODY_BYTES = 64 * 1024

/**
 * State file: the panel's batches + fallback key, persisted on the HOST side.
 * localStorage is origin-scoped and the dsh web port changes on every restart,
 * which silently orphans browser storage; a file under $DSH_HOME/.dsh survives
 * port changes and is the single source of truth for restore.
 */
const STATE_FILE = join(process.env.DSH_HOME ?? homedir(), '.dsh', 'dsh-tanqi.json')

/** Read the persisted state file; undefined when absent or corrupt. */
async function readState(): Promise<TanqiStatePayload | undefined> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const state = parsed as Partial<TanqiStatePayload>
    return Array.isArray(state.batches) && typeof state.apiKey === 'string'
      ? { batches: state.batches, apiKey: state.apiKey }
      : undefined
  } catch {
    return undefined
  }
}

/** Write the persisted state file (best-effort, never throws). */
async function writeState(state: TanqiStatePayload): Promise<boolean> {
  try {
    await mkdir(dirname(STATE_FILE), { recursive: true })
    await writeFile(STATE_FILE, JSON.stringify(state), 'utf8')
    return true
  } catch {
    return false
  }
}

/** Hard watchdog for one generation call (the model can be slow). */
const GENERATION_TIMEOUT_MS = 180_000

/** Default / bounds for the batch size. */
const DEFAULT_COUNT = 6
const MIN_COUNT = 3
const MAX_COUNT = 12

/** Longest exclusion list sent to the model (keeps the prompt small). */
const MAX_EXCLUDE = 80
/** Per-title length cap for the exclusion list. */
const MAX_EXCLUDE_TITLE = 60

/** Loopback literal check plus browser same-origin markers (dsh-ssh fence). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** State snapshots can be large (every batch + deep layers); allow up to 4 MiB. */
const MAX_STATE_BODY_BYTES = 4 * 1024 * 1024

/** Guard helper: fence + method check. */
function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
    return false
  }
  if (req.method !== method) {
    writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

/** Shared model-call options for one action. */
interface CallOptions {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  /**
   * Thinking mode eats into the max-tokens budget and slows every batch down;
   * these short JSON generation tasks don't need it, so pin it off.
   */
  reasoningEffort?: string
}

/** Route override the plugin config may pin (provider+model together). */
export interface TanqiRouteOverride {
  provider?: string
  model?: string
}

/** Dependencies of the route family. */
export interface TanqiRoutesDeps {
  ctx: Context
  /** Optional pinned route from plugin config. */
  override?: TanqiRouteOverride
}

/** Non-empty-string helper. */
function str(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Clamp the requested batch size into bounds. */
function batchCount(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, raw))
}

/** Run one generation through whichever channel is available (key > host route). */
async function channelGenerate(
  ctx: Context,
  override: TanqiRouteOverride | undefined,
  apiKey: string,
  call: CallOptions,
  signal: AbortSignal,
): Promise<string> {
  if (apiKey !== '') return generateViaKey(apiKey, call.system, call.user, { maxTokens: call.maxTokens, temperature: call.temperature, signal })
  const route: LlmRoute | undefined = resolveRoute(ctx, override)
  if (route === undefined) {
    throw new TanqiLlmError('本机没有可用的模型通道：请在 DSH「设置 → 模型」中配置模型，或在探奇面板中填写 DeepSeek API Key', 'NO_CHANNEL')
  }
  return generateViaDsh(ctx, route, call.system, call.user, { maxTokens: call.maxTokens, temperature: call.temperature, reasoningEffort: call.reasoningEffort, signal })
}

/** Validate the parsed discover payload; returns clean items or undefined. */
function parseDiscover(data: unknown, fallbackCategory: string): TanqiItemPayload[] | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const items = (data as { items?: unknown }).items
  if (!Array.isArray(items) || items.length === 0) return undefined
  const clean: TanqiItemPayload[] = []
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue
    const category = str((raw as { category?: unknown }).category, 24)
    const title = str((raw as { title?: unknown }).title, 80)
    const summary = str((raw as { summary?: unknown }).summary, 300)
    if (title === '') continue
    clean.push({ category: category === '' ? fallbackCategory : category, title, summary })
  }
  return clean.length > 0 ? clean : undefined
}

/** Validate the parsed deep payload; returns {title, content} or undefined. */
function parseDeep(data: unknown, fallbackTitle: string): { title: string; content: string } | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const title = str((data as { title?: unknown }).title, 80)
  const content = str((data as { content?: unknown }).content, 20_000)
  if (content === '') return undefined
  return { title: title === '' ? fallbackTitle : title, content }
}

/** Validate the parsed similar payload. */
function parseSimilar(data: unknown): SimilarPointPayload[] | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const points = (data as { points?: unknown }).points
  if (!Array.isArray(points) || points.length === 0) return undefined
  const clean: SimilarPointPayload[] = []
  for (const raw of points) {
    if (typeof raw !== 'object' || raw === null) continue
    const title = str((raw as { title?: unknown }).title, 80)
    const text = str((raw as { text?: unknown }).text, 400)
    if (title === '' || text === '') continue
    clean.push({ title, text })
  }
  return clean.length > 0 ? clean : undefined
}

/** Parse + validate a generation result; undefined when unusable. */
function finalizeResult(
  action: 'discover' | 'deep' | 'similar',
  data: unknown,
  topicForResult: string,
  fallbackCategory: string,
): TanqiGenerateData | undefined {
  if (action === 'discover') {
    const items = parseDiscover(data, fallbackCategory)
    return items === undefined ? undefined : { action: 'discover', items }
  }
  if (action === 'deep') {
    const parsed = parseDeep(data, topicForResult)
    return parsed === undefined ? undefined : { action: 'deep', title: parsed.title, content: parsed.content }
  }
  const points = parseSimilar(data)
  return points === undefined ? undefined : { action: 'similar', points }
}

/** Build every /api/dsh-tanqi route. */
export function makeRoutes(deps: TanqiRoutesDeps): WebRoute[] {
  const { ctx, override } = deps

  return [
    {
      kind: 'exact',
      path: TANQI_API.status,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const route = resolveRoute(ctx, override)
        if (route === undefined) {
          writeJson(res, 200, { ok: true, channel: 'none' })
          return
        }
        writeJson(res, 200, { ok: true, channel: 'dsh', provider: route.provider, model: route.model })
      },
    },
    {
      kind: 'exact',
      path: TANQI_API.state,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          const state = await readState()
          writeJson(res, 200, { ok: true, state: state ?? null })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req, MAX_STATE_BODY_BYTES)
          const raw = body === undefined ? undefined : body.state
          const shape = raw as Partial<TanqiStatePayload> | undefined
          if (shape === undefined || typeof shape !== 'object' || !Array.isArray(shape.batches) || typeof shape.apiKey !== 'string') {
            writeJson(res, 400, { ok: false, error: 'invalid state body' })
            return
          }
          const saved = await writeState(shape as TanqiStatePayload)
          writeJson(res, saved ? 200 : 500, { ok: saved })
          return
        }
        writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
      },
    },
    {
      kind: 'exact',
      path: TANQI_API.generate,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined || typeof body !== 'object') {
          writeJson(res, 400, { ok: false, error: 'invalid JSON body' })
          return
        }
        const action = body.action
        if (action !== 'discover' && action !== 'deep' && action !== 'similar') {
          writeJson(res, 400, { ok: false, error: `unknown action '${String(action)}'` })
          return
        }
        const apiKey = typeof body.key === 'string' ? body.key.trim() : ''
        const lang = normalizeLang(typeof body.lang === 'string' ? body.lang : undefined)
        const fallbackCategory = lang === 'en' ? 'Misc' : '杂谈'

        // One call = one generation; wire the client-abort + watchdog signal.
        const controller = new AbortController()
        const watchdog = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS)
        const onAborted = (): void => controller.abort()
        req.on('aborted', onAborted)

        let topicForResult = ''
        try {
          let call: CallOptions
          if (action === 'discover') {
            const request = body as Extract<TanqiGenerateRequest, { action: 'discover' }>
            const exclude = Array.isArray(request.exclude)
              ? request.exclude
                  .filter((title): title is string => typeof title === 'string')
                  .map((title) => title.trim().slice(0, MAX_EXCLUDE_TITLE))
                  .filter((title) => title !== '')
                  .slice(-MAX_EXCLUDE)
              : []
            const count = batchCount(request.count)
            call = {
              system: discoverSystem(lang),
              user: discoverUser(exclude, count, lang),
              maxTokens: 2048,
              temperature: 0.8,
              reasoningEffort: 'off',
            }
          } else if (action === 'deep') {
            const request = body as Extract<TanqiGenerateRequest, { action: 'deep' }>
            const topic = str(request.topic, 80)
            if (topic === '') {
              writeJson(res, 400, { ok: false, error: 'topic is required' })
              return
            }
            const layer = request.layer === 2 ? 2 : 1
            const summary = str(request.summary, 300)
            const context = str(request.context, 20_000)
            topicForResult = topic
            call = layer === 2
              ? { system: deepSystem(lang), user: deepLayer2User(topic, context, lang), maxTokens: 32000, temperature: 0.6, reasoningEffort: 'off' }
              : { system: deepSystem(lang), user: deepLayer1User(topic, summary, lang), maxTokens: 32000, temperature: 0.6, reasoningEffort: 'off' }
          } else {
            const request = body as Extract<TanqiGenerateRequest, { action: 'similar' }>
            const topic = str(request.topic, 80)
            if (topic === '') {
              writeJson(res, 400, { ok: false, error: 'topic is required' })
              return
            }
            topicForResult = topic
            call = { system: similarSystem(lang), user: similarUser(topic, lang), maxTokens: 16000, temperature: 0.7, reasoningEffort: 'off' }
          }

          const text = await channelGenerate(ctx, override, apiKey, call, controller.signal)
          const data = extractJson(text)
          if (data === undefined) {
            writeJson(res, 502, {
              ok: false,
              code: 'BAD_MODEL_OUTPUT',
              error: `模型输出无法解析为 JSON：${text.slice(0, 4000)}`,
            })
            return
          }

          const result = finalizeResult(action, data, topicForResult, fallbackCategory)
          if (result === undefined) {
            const detail = action === 'discover'
              ? '模型输出缺少有效的 items 数组'
              : action === 'deep'
                ? '模型输出缺少有效的 content 字段'
                : '模型输出缺少有效的 points 数组'
            writeJson(res, 502, { ok: false, code: 'BAD_MODEL_OUTPUT', error: detail })
            return
          }
          writeJson(res, 200, { ok: true, data: result })
        } catch (error) {
          if (error instanceof TruncatedOutputError) {
            // Output hit the token cap but may still contain a parseable
            // payload — take what is usable instead of failing the batch.
            const data = extractJson(error.partial)
            const result = data === undefined ? undefined : finalizeResult(action, data, topicForResult, fallbackCategory)
            if (result !== undefined) {
              writeJson(res, 200, { ok: true, data: result })
              return
            }
            writeJson(res, 502, {
              ok: false,
              code: error.code,
              error: `${error.message}（截断内容前500字：${error.partial.slice(0, 500)}）`,
            })
            return
          }
          if (error instanceof TanqiLlmError) {
            const status = error.code === 'NO_CHANNEL' || error.code === 'BAD_KEY' ? 400 : 502
            writeJson(res, status, { ok: false, code: error.code, error: error.message })
            return
          }
          writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        } finally {
          clearTimeout(watchdog)
          req.off('aborted', onAborted)
        }
      },
    },
  ]
}
