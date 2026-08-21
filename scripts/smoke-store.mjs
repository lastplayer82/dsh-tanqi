/**
 * Store-layer smoke test: asserts the pure logic the panel depends on —
 * normalizeItem/normalizeState migration (legacy flat fields, new layered
 * shape), root-level「类似知识点」preservation, and seenTitles coverage of
 * every similar title (the dedup + exclusion base for discover).
 *
 * Run: node --experimental-strip-types scripts/smoke-store.mjs   (no build needed)
 */
import { normalizeState, seenTitles, capState } from '../src/client/store.ts'

let failed = 0
function check(name, cond) {
  if (cond) console.log(`PASS: ${name}`)
  else { failed += 1; console.error(`FAIL: ${name}`) }
}

// 1. Legacy migration: deep1/deep2 → layers, top-level similars → last layer.
const legacy = normalizeState({
  batches: [{
    id: 'b', createdAt: 1,
    items: [{ id: 'i', category: '旧', title: 'legacy', summary: 's', deep1: '层1', deep2: '层2', similars: [{ title: '旧类似', text: 'x' }] }],
  }],
  apiKey: '',
})
const legacyItem = legacy.batches[0].items[0]
check('legacy: deep1/deep2 → 2 layers', legacyItem.layers.length === 2)
check('legacy: top-level similars moved to last layer', legacyItem.layers[1]?.similars?.length === 1 && legacyItem.layers[1].similars[0].title === '旧类似')
check('legacy: no root-level similars', legacyItem.similars === undefined)

// 2. New shape: root-level similars survive on a layerless item.
const root = normalizeState({
  batches: [{
    id: 'b', createdAt: 1,
    items: [{ id: 'i', category: '新', title: 'layerless', summary: 's', layers: [], similars: [{ title: '根级A', text: 'a' }, { title: '根级B', text: 'b' }] }],
  }],
  apiKey: '',
})
const rootItem = root.batches[0].items[0]
check('new: layerless item keeps layers=[]', rootItem.layers.length === 0)
check('new: root-level similars kept (2)', Array.isArray(rootItem.similars) && rootItem.similars.length === 2)

// 3. Layer-level similars survive a round-trip.
const layered = normalizeState({
  batches: [{
    id: 'b', createdAt: 1,
    items: [{ id: 'i', category: '新', title: 'layered', summary: 's', layers: [{ content: 'c', similars: [{ title: '层内X', text: 'x' }] }] }],
  }],
  apiKey: '',
})
check('new: layer-level similars kept', layered.batches[0].items[0].layers[0]?.similars?.length === 1)

// 4. seenTitles covers item + root + layer similar titles, deduplicated.
const titles = seenTitles({
  batches: [{
    id: 'b', createdAt: 1,
    items: [
      { id: 'a', category: 'c', title: '主A', summary: 's', layers: [], similars: [{ title: '类似A', text: 'x' }], createdAt: 1 },
      { id: 'b2', category: 'c', title: '主B', summary: 's', layers: [{ content: 'c', similars: [{ title: '类似B', text: 'x' }] }], createdAt: 1 },
      { id: 'c2', category: 'c', title: '主C', summary: 's', layers: [], createdAt: 1 },
    ],
  }],
  apiKey: '',
})
check('seenTitles: 5 unique (3 items + 2 similars)', titles.length === 5)
check('seenTitles: item titles present', titles.includes('主A') && titles.includes('主B') && titles.includes('主C'))
check('seenTitles: root similar title present', titles.includes('类似A'))
check('seenTitles: layer similar title present', titles.includes('类似B'))
check('seenTitles: dedupes identical titles', seenTitles({
  batches: [{ id: 'b', createdAt: 1, items: [
    { id: 'a', category: 'c', title: '同题', summary: 's', layers: [], similars: [{ title: '同题', text: 'x' }], createdAt: 1 },
  ] }],
  apiKey: '',
}).length === 1)

// 5. capState bounds the batch history.
const capped = capState({ batches: Array.from({ length: 35 }, (_, i) => ({ id: String(i), createdAt: i, items: [] })), apiKey: '' })
check('capState: keeps at most 30 batches', capped.batches.length === 30)

if (failed > 0) {
  console.error(`${failed} check(s) failed`)
  process.exit(1)
}
console.log('ALL PASS: store logic (migration / root similars / seenTitles)')
