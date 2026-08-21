/**
 * Shared wire protocol for the dsh-tanqi plugin: API path constants and the
 * request/response shapes both halves (host routes + browser API client) use.
 * Pure types + constants — safe for the client bundle.
 */

/** The /api/dsh-tanqi route family. */
export const TANQI_API = {
  /** GET — whether the host LLM channel is usable and which route it resolves to. */
  status: '/api/dsh-tanqi/status',
  /** POST — one AI generation (discover / deep / similar). */
  generate: '/api/dsh-tanqi/generate',
  /** GET/POST — the persisted panel state (host-side file, origin-independent). */
  state: '/api/dsh-tanqi/state',
} as const

/** Generation kinds the plugin drives. */
export type TanqiAction = 'discover' | 'deep' | 'similar'

/** Output language of generated content: follows the DSH UI language. */
export type TanqiLang = 'zh' | 'en'

/** One freshly generated curiosity item. */
export interface TanqiItemPayload {
  /** Category label, e.g. 物理 / 商业. */
  category: string
  /** The hooky one-line title. */
  title: string
  /** Concrete, vivid one-line summary. */
  summary: string
}

/** One related knowledge point (the「类似知识点」layer). */
export interface SimilarPointPayload {
  title: string
  text: string
}

/** Request body of the generate route. */
export type TanqiGenerateRequest =
  | {
      action: 'discover'
      /** Titles already shown to this user; the model must not repeat them. */
      exclude: string[]
      /** How many items to generate (default 6). */
      count?: number
      /** Output language of generated content (default 'zh'). */
      lang?: TanqiLang
      /** Optional user-provided DeepSeek key (bypasses the host LLM channel). */
      key?: string
    }
  | {
      action: 'deep'
      /** The item title being expanded. */
      topic: string
      /** 1 = first deep dive, 2 = one layer deeper. */
      layer: 1 | 2
      /** Layer-1 context (the item summary). */
      summary?: string
      /** Layer-2 context (the layer-1 content). */
      context?: string
      lang?: TanqiLang
      key?: string
    }
  | {
      action: 'similar'
      topic: string
      lang?: TanqiLang
      key?: string
    }

/** Response of the status route. */
export interface TanqiStatusResponse {
  ok: true
  /** 'dsh' = host LLM channel usable; 'none' = no route resolvable on the host. */
  channel: 'dsh' | 'none'
  provider?: string
  model?: string
}

/** Parsed generation data returned by the generate route. */
export type TanqiGenerateData =
  | { action: 'discover'; items: TanqiItemPayload[] }
  | { action: 'deep'; title: string; content: string }
  | { action: 'similar'; points: SimilarPointPayload[] }

/** Response of the generate route. */
export interface TanqiGenerateResponse {
  ok: true
  data: TanqiGenerateData
}

/** Opaque persisted panel state (mirrors the client store shape, JSON-safe). */
export interface TanqiStatePayload {
  batches: Array<{
    id: string
    createdAt: number
    items: Array<{
      id: string
      category: string
      title: string
      summary: string
      /** Root-level「类似知识点」(for items with no deep layer yet). */
      similars?: Array<{ title: string; text: string }>
      layers: Array<{
        content: string
        similars?: Array<{ title: string; text: string }>
      }>
      createdAt: number
    }>
  }>
  apiKey: string
}
