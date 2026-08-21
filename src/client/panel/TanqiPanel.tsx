/**
 * The dsh-tanqi panel: 开始探奇 (generate & unfold) and 探奇清单 (history).
 * All data lives in the localStorage store; the AI calls go through TanqiApi.
 * Class names are the tq-* literals from panel/styles.ts (embedded CSS — the
 * dsh client loader serves no separate stylesheet asset).
 */
import { useCallback, useEffect, useState } from 'react'
import type { TanqiStatusResponse } from '../../protocol.ts'
import type { TanqiApi } from '../api.ts'
import type { TanqiController } from '../controller.ts'
import { tt } from '../locales.ts'
import {
  emptyState,
  newId,
  normalizeState,
  seenTitles,
  type SimilarPoint,
  type TanqiBatch,
  type TanqiItem,
  type TanqiState,
  type TanqiStore,
} from '../store.ts'

/** Panel dependencies: controller (open state), api (calls), store (persistence). */
export interface TanqiPanelProps {
  controller: TanqiController
  api: TanqiApi
  store: TanqiStore
}

/** Human-readable error text from an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Compact local timestamp. */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Loading markers, keyed by `${item.id}:${kind}:${layer}` so several items and
 * several layers can unfold in parallel.
 */
type LoadingMap = Record<string, boolean>

/** Load key helper. */
function loadKey(itemId: string, kind: 'deep' | 'similar', layer: number): string {
  return `${itemId}:${kind}:${layer}`
}

/**
 * The unfold actions for one item, shared by explore cards and history entries.
 * Every layer has both buttons: 「深入」opens the next deep-dive layer (unlimited
 * depth), 「类似知识点」opens the related points — for a layerless item these
 * attach at the item root (anchored on the summary), otherwise on the deepest
 * layer.
 */
function ItemActions({
  item,
  deepLoading,
  similarLoading,
  onExpand,
}: {
  item: TanqiItem
  deepLoading: boolean
  similarLoading: boolean
  onExpand: (item: TanqiItem, layer: number, kind: 'deep' | 'similar') => void
}) {
  const nextLayer = item.layers.length
  const similarLayer = Math.max(0, nextLayer - 1)
  return (
    <div className="tq-itemActions">
      {deepLoading ? (
        <button className="tq-secondaryBtn" disabled>
          {nextLayer === 0 ? tt('item.deep1.loading') : tt('item.deep2.loading')}
        </button>
      ) : (
        <button className="tq-secondaryBtn" onClick={() => onExpand(item, nextLayer, 'deep')}>
          {nextLayer === 0 ? tt('item.deep1') : tt('item.deep2')}
        </button>
      )}
      {similarLoading ? (
        <button className="tq-secondaryBtn" disabled>{tt('item.similar.loading')}</button>
      ) : (
        <button className="tq-secondaryBtn" onClick={() => onExpand(item, similarLayer, 'similar')}>
          {tt('item.similar')}
        </button>
      )}
    </div>
  )
}

/** One item card: summary + every expanded layer with its related points. */
function ItemCard({
  item,
  loading,
  onExpand,
}: {
  item: TanqiItem
  loading: LoadingMap
  onExpand: (item: TanqiItem, layer: number, kind: 'deep' | 'similar') => void
}) {
  const nextLayer = item.layers.length
  const similarLayer = Math.max(0, nextLayer - 1)
  return (
    <article className="tq-itemCard">
      <div className="tq-itemHead">
        <span className="tq-itemCategory">{item.category}</span>
        <h3 className="tq-itemTitle">{item.title}</h3>
      </div>
      <p className="tq-itemSummary">{item.summary}</p>
      <ItemActions
        item={item}
        deepLoading={loading[loadKey(item.id, 'deep', nextLayer)] === true}
        similarLoading={loading[loadKey(item.id, 'similar', similarLayer)] === true}
        onExpand={onExpand}
      />
      {item.similars !== undefined && item.similars.length > 0 && (
        <div className="tq-contentSection">
          <h4 className="tq-contentTitle">{tt('item.similar')}</h4>
          <div className="tq-similarList">
            {item.similars.map((point, pointIndex) => (
              <SimilarEntry key={`${item.id}-sim-root-${pointIndex}`} point={point} />
            ))}
          </div>
        </div>
      )}
      {item.layers.map((layer, index) => (
        <div key={`${item.id}-layer-${index}`}>
          <div className="tq-contentSection">
            <h4 className="tq-contentTitle">{index === 0 ? tt('item.deep1') : tt('item.deep2')}</h4>
            <p className="tq-contentParagraph">{layer.content}</p>
          </div>
          {layer.similars !== undefined && layer.similars.length > 0 && (
            <div className="tq-contentSection">
              <h4 className="tq-contentTitle">{tt('item.similar')}</h4>
              <div className="tq-similarList">
                {layer.similars.map((point, pointIndex) => (
                  <SimilarEntry key={`${item.id}-sim-${index}-${pointIndex}`} point={point} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </article>
  )
}

/** One related knowledge point. */
function SimilarEntry({ point }: { point: SimilarPoint }) {
  return (
    <div className="tq-similarEntry">
      <p className="tq-similarTitle">{point.title}</p>
      <p className="tq-similarText">{point.text}</p>
    </div>
  )
}

/** One collapsible batch row in the history view (same unfold actions). */
function HistoryBatch({
  batch,
  number,
  defaultOpen,
  loading,
  onExpand,
}: {
  batch: TanqiBatch
  number: number
  defaultOpen: boolean
  loading: LoadingMap
  onExpand: (item: TanqiItem, layer: number, kind: 'deep' | 'similar') => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <div className="tq-batchHeader" onClick={() => setOpen((value) => !value)}>
        <span className={`tq-batchCaret ${open ? 'tq-batchCaretOpen' : ''}`}>▶</span>
        <span>{tt('history.batch', { n: number, count: batch.items.length, time: formatTime(batch.createdAt) })}</span>
      </div>
      {open && (
        <div className="tq-batchBody">
          {batch.items.map((item) => (
            <ItemCard key={item.id} item={item} loading={loading} onExpand={onExpand} />
          ))}
        </div>
      )}
    </section>
  )
}

/** The whole tanqi panel view. */
export function TanqiPanel({ api, store }: TanqiPanelProps) {
  const [tab, setTab] = useState<'explore' | 'history'>('explore')
  const [status, setStatus] = useState<TanqiStatusResponse | null>(null)
  const [state, setState] = useState<TanqiState>(() => store.load())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<LoadingMap>({})
  const [keyDraft, setKeyDraft] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  /** Persist a next state (keeps the store and React in sync). */
  const persist = useCallback((next: TanqiState): void => {
    setState(next)
    store.save(next)
    // Mirror to the host file so a browser origin change (dsh restarts pick a
    // new random port → fresh localStorage) can never orphan the history.
    api.saveState(next).catch(() => { /* host write is best-effort */ })
  }, [api, store])

  // Probe the host LLM channel once on mount.
  useEffect(() => {
    let cancelled = false
    api.status()
      .then((result) => { if (!cancelled) setStatus(result) })
      .catch(() => { if (!cancelled) setStatus({ ok: true, channel: 'none' }) })
    return () => { cancelled = true }
  }, [api])

  // Restore from the host-side state file when this origin's localStorage is
  // empty (fresh random port after a dsh restart) but the file has history.
  useEffect(() => {
    let cancelled = false
    api.getState()
      .then((remote) => {
        if (cancelled || remote === null) return
        if (!Array.isArray(remote.batches) || remote.batches.length === 0) return
        setState((current) => {
          if (current.batches.length > 0) return current // local already has data
          // Normalize like load() does — the host file may hold legacy
          // (pre-layers) data written before the layered schema landed.
          const restored = normalizeState(remote)
          if (restored.batches.length === 0) return current
          store.save(restored)
          return restored
        })
      })
      .catch(() => { /* no file / unreachable host — keep whatever we have */ })
    return () => { cancelled = true }
  }, [api, store])

  /** Effective channel: host route > stored key > none. */
  const channel: 'loading' | 'dsh' | 'key' | 'none' = status === null
    ? 'loading'
    : status.channel === 'dsh'
      ? 'dsh'
      : state.apiKey !== ''
        ? 'key'
        : 'none'

  /** Update one item (any batch) via an updater (layers depend on the current item). */
  const updateItem = useCallback((id: string, updater: (item: TanqiItem) => TanqiItem): void => {
    setState((current) => {
      const next = {
        ...current,
        batches: current.batches.map((batch) => ({
          ...batch,
          items: batch.items.map((item) => (item.id === id ? updater(item) : item)),
        })),
      }
      store.save(next)
      api.saveState(next).catch(() => { /* host write is best-effort */ })
      return next
    })
  }, [api, store])

  /**
   * Generate a fresh batch, hard-filtering anything the user has already seen.
   * The model gets an exclusion hint (last 80 titles) but is NOT the guarantee:
   * every returned item is checked against the FULL local history, duplicates
   * are dropped, and if we end up with fewer than 6 fresh items the loop
   * re-generates to top up (kept titles join the exclusion list each round).
   */
  const startDiscover = useCallback(async (): Promise<void> => {
    setGenerating(true)
    setError(null)
    const now = Date.now()
    const seen = new Set(seenTitles(state))
    const kept: TanqiItem[] = []
    try {
      for (let round = 0; round < 3 && kept.length < 6; round += 1) {
        const need = 6 - kept.length
        const exclude = [...seenTitles(state), ...kept.map((item) => item.title)].slice(-80)
        const data = await api.generate({
          action: 'discover',
          exclude,
          count: Math.min(12, need + 2),
          key: state.apiKey === '' ? undefined : state.apiKey,
        })
        if (data.action !== 'discover') break
        for (const item of data.items) {
          const title = item.title.trim()
          if (title === '' || seen.has(title) || kept.some((keep) => keep.title === title)) continue
          seen.add(title)
          kept.push({
            id: newId(),
            category: item.category,
            title: item.title,
            summary: item.summary,
            layers: [],
            createdAt: now,
          })
          if (kept.length >= 6) break
        }
      }
      if (kept.length === 0) {
        setError(tt('history.duplicateAll'))
        return
      }
      if (kept.length < 6) {
        // Rare: all top-up rounds exhausted; show what we have.
        setError(tt('history.duplicatePartial', { count: kept.length }))
      }
      const batch: TanqiBatch = { id: newId(), createdAt: now, items: kept }
      persist({ ...state, batches: [...state.batches, batch] })
      setTab('explore')
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setGenerating(false)
    }
  }, [api, state, persist])

  /**
   * Unfold one layer of an item. `layer` is the target index: for 'deep' it is
   * the NEW layer being created (layers.length on first use), for 'similar' it
   * is the layer whose related points get attached. Every layer is independent.
   */
  const expand = useCallback(async (item: TanqiItem, layer: number, kind: 'deep' | 'similar'): Promise<void> => {
    const lk = loadKey(item.id, kind, layer)
    setLoading((current) => ({ ...current, [lk]: true }))
    setError(null)
    const key = state.apiKey === '' ? undefined : state.apiKey
    try {
      if (kind === 'deep') {
        const prevLayer = item.layers[layer - 1]
        const request = layer === 0
          ? { action: 'deep' as const, topic: item.title, layer: 1 as const, summary: item.summary, key }
          : { action: 'deep' as const, topic: item.title, layer: 2 as const, context: prevLayer?.content ?? '', key }
        const data = await api.generate(request)
        if (data.action === 'deep') {
          updateItem(item.id, (current) => ({ ...current, layers: [...current.layers, { content: data.content }] }))
        }
      } else {
        const data = await api.generate({ action: 'similar', topic: item.title, key })
        if (data.action === 'similar') {
          updateItem(item.id, (current) => {
            // No deep layer yet → attach the related points at the item root
            // (they anchor on the summary). Otherwise attach to the target layer.
            if (current.layers.length === 0) {
              return { ...current, similars: data.points }
            }
            const target = Math.max(0, Math.min(layer, current.layers.length - 1))
            return {
              ...current,
              layers: current.layers.map((existing, index) => (
                index === target ? { ...existing, similars: data.points } : existing
              )),
            }
          })
        }
      }
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setLoading((current) => {
        const next = { ...current }
        delete next[lk]
        return next
      })
    }
  }, [api, state.apiKey, updateItem])

  /** Save the fallback API key locally. */
  const saveKey = (): void => {
    persist({ ...state, apiKey: keyDraft.trim() })
    setKeySaved(true)
    window.setTimeout(() => setKeySaved(false), 1600)
  }

  /** Wipe the whole history. */
  const clearHistory = (): void => {
    if (!window.confirm(tt('history.clearConfirm'))) return
    persist(emptyState())
    setTab('explore')
  }

  const latest = state.batches.length > 0 ? state.batches[state.batches.length - 1] : undefined

  return (
    <div className="tq-panelRoot">
      <header className="tq-header">
        <h2 className="tq-headerTitle">
          <span className="tq-headerTitleIcon">✦</span>
          {tt('entry.label')}
        </h2>
        <div className="tq-tabs">
          <button
            className={`tq-tab ${tab === 'explore' ? 'tq-tabActive' : ''}`}
            onClick={() => setTab('explore')}
          >
            {tt('tab.explore')}
          </button>
          <button
            className={`tq-tab ${tab === 'history' ? 'tq-tabActive' : ''}`}
            onClick={() => setTab('history')}
          >
            {tt('tab.history')}
          </button>
        </div>
      </header>

      <div className="tq-scroll">
        {/* channel strip */}
        {channel === 'loading' && (
          <div className="tq-channelStrip tq-channelOk">{tt('channel.dsh')}…</div>
        )}
        {channel === 'dsh' && status !== null && (
          <div className="tq-channelStrip tq-channelOk">
            <span>✓ {tt('channel.dsh')}</span>
            <span>({status.provider} / {status.model})</span>
          </div>
        )}
        {(channel === 'none' || channel === 'key') && (
          <div className={`tq-channelStrip ${channel === 'key' ? 'tq-channelKey' : 'tq-channelWarn'}`}>
            <span>{channel === 'key' ? `✓ ${tt('channel.key')}` : `⚠ ${tt('channel.none')}`}</span>
            <div className="tq-keyRow">
              <input
                className="tq-keyInput"
                type="password"
                placeholder={tt('key.placeholder')}
                value={keyDraft}
                onChange={(event) => { setKeyDraft(event.target.value); setKeySaved(false) }}
              />
              <button className="tq-keySave" disabled={keyDraft.trim() === ''} onClick={saveKey}>
                {tt('key.save')}
              </button>
              {keySaved && <span className="tq-savedFlash">{tt('key.saved')}</span>}
            </div>
            <div className="tq-keyHint">{tt('key.hint')}</div>
          </div>
        )}

        {/* error banner */}
        {error !== null && (
          <div className="tq-errorBanner">
            <span>{tt('common.error')}：{error}</span>
            <button className="tq-errorClose" onClick={() => setError(null)} aria-label={tt('common.close')}>✕</button>
          </div>
        )}

        {tab === 'explore' && (
          latest === undefined ? (
            <div className="tq-hero">
              <div className="tq-heroIcon">✦</div>
              <p className="tq-emptyHint">{tt('discover.empty')}</p>
              <button className="tq-primaryBtn" onClick={startDiscover} disabled={generating}>
                {tt('discover.start')}
              </button>
            </div>
          ) : (
            <>
              {generating && (
                <div className="tq-generating">
                  <span className="tq-spinner" />
                  {tt('discover.generating')}
                </div>
              )}
              <div className="tq-list">
                {latest.items.map((item) => (
                  <ItemCard key={item.id} item={item} loading={loading} onExpand={expand} />
                ))}
              </div>
              <div className="tq-footer">
                <button className="tq-primaryBtn" onClick={startDiscover} disabled={generating}>
                  {generating ? tt('discover.generating') : tt('discover.more')}
                </button>
              </div>
            </>
          )
        )}

        {tab === 'history' && (
          <>
            <div className="tq-historyHeader">
              <span className="tq-generating">{state.batches.length}</span>
              <button className="tq-secondaryBtn tq-dangerBtn" onClick={clearHistory}>
                {tt('history.clear')}
              </button>
            </div>
            {state.batches.length === 0 ? (
              <p className="tq-batchEmpty">{tt('history.empty')}</p>
            ) : (
              state.batches.map((batch, index) => (
                <HistoryBatch
                  key={batch.id}
                  batch={batch}
                  number={index + 1}
                  defaultOpen={index === state.batches.length - 1}
                  loading={loading}
                  onExpand={expand}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
