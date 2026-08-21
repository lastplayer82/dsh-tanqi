/**
 * Browser-local persistence for the dsh-tanqi plugin (localStorage key
 * `dsh.tanqi.v1`, task-board precedent). Everything the user ever saw is kept:
 * batches, items, every deep layer, every similar point. The shown-topic
 * history is derived from the batches and drives the generation exclusion list.
 */

/** One related knowledge point (the「类似知识点」layer). */
export interface SimilarPoint {
  title: string
  text: string
}

/** One expanded layer: a deep-dive plus (optionally) its related points. */
export interface TanqiLayer {
  /** The deep-dive content (「深入」). */
  content: string
  /** The「类似知识点」for this layer, once generated. */
  similars?: SimilarPoint[]
}

/** One curiosity item, possibly with generated layers attached. */
export interface TanqiItem {
  id: string
  category: string
  title: string
  summary: string
  /**
   * Root-level「类似知识点」: generated before any deep layer exists (the
   * item's summary is the anchor). Kept separate from per-layer similars.
   */
  similars?: SimilarPoint[]
  /**
   * Every expansion layer in order. Layer 0 is the first「深入」; each layer
   * may also carry its own「类似知识点」. Unlimited depth.
   */
  layers: TanqiLayer[]
  createdAt: number
}

/** One generated batch. */
export interface TanqiBatch {
  id: string
  createdAt: number
  items: TanqiItem[]
}

/** The whole persisted state. */
export interface TanqiState {
  batches: TanqiBatch[]
  /** Optional user-supplied DeepSeek API key (fallback channel). */
  apiKey: string
}

/** localStorage key for the whole state. */
export const STORAGE_KEY = 'dsh.tanqi.v1'

/** How many batches the history keeps (oldest dropped beyond this). */
const MAX_BATCHES = 30

/** How many seen titles feed the exclusion prompt (oldest dropped beyond this). */
const MAX_EXCLUDE_TITLES = 200

/** Fresh empty state. */
export function emptyState(): TanqiState {
  return { batches: [], apiKey: '' }
}

/**
 * All titles ever shown to the user, newest first, deduplicated — including
 * every「类似知识点」title (root-level and per-layer), so discover never
 * re-serves a related point as a fresh item.
 */
export function seenTitles(state: TanqiState): string[] {
  const seen: string[] = []
  const known = new Set<string>()
  const add = (title: string): void => {
    const trimmed = title.trim()
    if (trimmed !== '' && !known.has(trimmed)) {
      known.add(trimmed)
      seen.push(trimmed)
    }
  }
  for (let index = state.batches.length - 1; index >= 0; index -= 1) {
    for (const item of state.batches[index].items) {
      add(item.title)
      if (item.similars !== undefined) {
        for (const point of item.similars) add(point.title)
      }
      for (const layer of item.layers) {
        if (layer.similars !== undefined) {
          for (const point of layer.similars) add(point.title)
        }
      }
    }
  }
  return seen
}

/** Cap the state so localStorage and the exclusion prompt stay bounded. */
export function capState(state: TanqiState): TanqiState {
  return {
    batches: state.batches.slice(-MAX_BATCHES),
    apiKey: state.apiKey,
  }
}

/** Simple client-side id generator. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `tanqi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Normalize one loaded item into the layered shape, migrating the pre-layers
 * format (flat `deep1` / `deep2` / `similars` fields) when present.
 */
function normalizeItem(raw: unknown): TanqiItem | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const item = raw as Record<string, unknown>
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const id = typeof item.id === 'string' ? item.id : newId()
  if (title === '') return undefined
  const layers: TanqiLayer[] = []
  if (Array.isArray(item.layers)) {
    for (const layer of item.layers) {
      if (typeof layer !== 'object' || layer === null) continue
      const content = (layer as { content?: unknown }).content
      if (typeof content !== 'string' || content.trim() === '') continue
      const similarsRaw = (layer as { similars?: unknown }).similars
      const similars = Array.isArray(similarsRaw)
        ? similarsRaw.filter((point): point is SimilarPoint =>
            typeof point === 'object' && point !== null
            && typeof (point as { title?: unknown }).title === 'string'
            && typeof (point as { text?: unknown }).text === 'string')
        : undefined
      layers.push({ content, ...(similars !== undefined && similars.length > 0 ? { similars } : {}) })
    }
  }
  // New shape (has a `layers` array): root-level similars stay on the item.
  let rootSimilars: SimilarPoint[] | undefined
  if (Array.isArray(item.layers)) {
    const rootRaw = item.similars
    rootSimilars = Array.isArray(rootRaw)
      ? rootRaw.filter((point): point is SimilarPoint =>
          typeof point === 'object' && point !== null
          && typeof (point as { title?: unknown }).title === 'string'
          && typeof (point as { text?: unknown }).text === 'string')
      : undefined
    if (rootSimilars !== undefined && rootSimilars.length === 0) rootSimilars = undefined
  } else {
    // Legacy flat fields: deep1 → layer 0, deep2 → layer 1; the old「类似知识点」
    // (only reachable after layer 2) attaches to the last layer.
    if (typeof item.deep1 === 'string' && item.deep1.trim() !== '') layers.push({ content: item.deep1 })
    if (typeof item.deep2 === 'string' && item.deep2.trim() !== '') layers.push({ content: item.deep2 })
    const legacySimilars = Array.isArray(item.similars)
      ? item.similars.filter((point): point is SimilarPoint =>
          typeof point === 'object' && point !== null
          && typeof (point as { title?: unknown }).title === 'string'
          && typeof (point as { text?: unknown }).text === 'string')
      : undefined
    if (legacySimilars !== undefined && legacySimilars.length > 0) {
      const last = layers[layers.length - 1]
      if (last !== undefined) last.similars = legacySimilars
    }
  }
  return {
    id,
    category: typeof item.category === 'string' ? item.category : '杂谈',
    title,
    summary: typeof item.summary === 'string' ? item.summary : '',
    ...(rootSimilars !== undefined ? { similars: rootSimilars } : {}),
    layers,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
  }
}

/**
 * Normalize a raw persisted state (localStorage or host file) into the current
 * layered shape, migrating legacy flat fields and dropping malformed entries.
 */
export function normalizeState(parsed: unknown): TanqiState {
  if (typeof parsed !== 'object' || parsed === null) return emptyState()
  const state = parsed as Partial<TanqiState>
  const batches = Array.isArray(state.batches)
    ? state.batches
        .filter((batch): batch is TanqiBatch =>
          typeof batch === 'object' && batch !== null && Array.isArray(batch.items))
        .map((batch) => ({
          id: batch.id,
          createdAt: batch.createdAt,
          items: batch.items.map(normalizeItem).filter((item): item is TanqiItem => item !== undefined),
        }))
        .filter((batch) => batch.items.length > 0)
    : []
  return capState({ batches, apiKey: typeof state.apiKey === 'string' ? state.apiKey : '' })
}

/** localStorage-backed store (best-effort; storage failures degrade to memory). */
export class TanqiStore {
  private memory: TanqiState = emptyState()

  load(): TanqiState {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw === null) return emptyState()
      return normalizeState(JSON.parse(raw))
    } catch {
      return emptyState()
    }
  }

  save(state: TanqiState): void {
    this.memory = state
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capState(state)))
    } catch {
      // Quota/private-mode failures degrade to the in-memory copy.
    }
  }
}
