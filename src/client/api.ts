/**
 * Browser-side API client for the /api/dsh-tanqi route family. Plain fetch,
 * same origin — the only data access path the panel uses.
 */

import {
  TANQI_API,
  type TanqiGenerateData,
  type TanqiGenerateRequest,
  type TanqiStatePayload,
  type TanqiStatusResponse,
} from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class TanqiApiError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'TanqiApiError'
    this.code = code
  }
}

/**
 * Output language for generated content, derived from the DSH UI language
 * (the same `document.documentElement.lang` the panel's own copy uses).
 */
function currentUiLang(): 'zh' | 'en' {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return lang.startsWith('zh') ? 'zh' : 'en'
}

/** Parse a JSON response or throw a TanqiApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TanqiApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  const failed = body as { ok?: unknown; error?: unknown; code?: unknown }
  if (!response.ok || failed.ok === false) {
    const message = typeof failed.error === 'string' ? failed.error : `HTTP ${response.status}`
    throw new TanqiApiError(message, typeof failed.code === 'string' ? failed.code : undefined)
  }
  return body as T
}

/** The browser half's only data entry point. */
export class TanqiApi {
  /** Probe the host LLM channel (also its route, when usable). */
  async status(): Promise<TanqiStatusResponse> {
    const response = await fetch(TANQI_API.status)
    return readJson<TanqiStatusResponse>(response)
  }

  /** Run one generation (discover / deep / similar); output follows the DSH UI language. */
  async generate(request: TanqiGenerateRequest, signal?: AbortSignal): Promise<TanqiGenerateData> {
    const lang = currentUiLang()
    const response = await fetch(TANQI_API.generate, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, lang }),
      signal,
    })
    const body = await readJson<{ ok: true; data: TanqiGenerateData }>(response)
    return body.data
  }

  /** Pull the host-side persisted state (undefined when none was saved yet). */
  async getState(): Promise<TanqiStatePayload | null> {
    const response = await fetch(TANQI_API.state)
    const body = await readJson<{ ok: true; state: TanqiStatePayload | null }>(response)
    return body.state
  }

  /** Persist the panel state on the host (survives browser origin changes). */
  async saveState(state: TanqiStatePayload): Promise<void> {
    const response = await fetch(TANQI_API.state, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    })
    await readJson<{ ok: true }>(response)
  }
}
