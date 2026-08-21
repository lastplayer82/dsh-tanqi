/**
 * Client-bundle smoke test: loads the built lib/client.js the way the dsh web
 * GUI does (window.__ModuleLoader__.load with a require-shaped factory) inside
 * jsdom, then invokes the plugin's apply() against a fake client context and
 * asserts the DOM surfaces mount without throwing.
 *
 * Run: node scripts/smoke-client.mjs  (needs `pnpm build` first)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bundlePath = join(root, 'lib', 'client.js')

const dom = new JSDOM(
  '<!doctype html><html><head></head><body>'
  + '<div data-pane="sidebar"><div class="logoRow"><button class="newSession">New</button></div></div>'
  + '<div data-pane="conversation"></div>'
  + '</body></html>',
  { url: 'http://127.0.0.1:62137/', pretendToBeVisual: true },
)
const { window } = dom
const installGlobal = (name, value) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installGlobal('window', window)
installGlobal('document', window.document)
installGlobal('navigator', window.navigator)
installGlobal('MutationObserver', window.MutationObserver)
installGlobal('HTMLElement', window.HTMLElement)
installGlobal('Event', window.Event)
installGlobal('CustomEvent', window.CustomEvent)
installGlobal('Node', window.Node)

// The module loader contract: capture the registration the bundle makes.
let registered = null
window.__ModuleLoader__ = {
  load(entry) {
    registered = entry
  },
}

// Evaluate the bundle as a classic script inside the jsdom realm.
const source = readFileSync(bundlePath, 'utf8')
window.eval(source)

if (registered === null) {
  console.error('FAIL: bundle never called window.__ModuleLoader__.load')
  process.exit(1)
}
if (registered.id !== '@lastplayer82/dsh-tanqi') {
  console.error(`FAIL: unexpected plugin id ${registered.id}`)
  process.exit(1)
}

// Provide the three external modules the bundle requires (real packages).
const requireShim = (spec) => {
  if (spec === 'react') return require('react')
  if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
  if (spec === 'react-dom/client') return require('react-dom/client')
  throw new Error(`smoke: unexpected require "${spec}"`)
}
const exports = registered.factory(requireShim)

if (typeof exports.apply !== 'function') {
  console.error('FAIL: factory did not export apply()')
  process.exit(1)
}

// Seed a persisted state that exercises the「类似知识点」paths: one layerless
// item with ROOT-level similars (the zero-layer fix) and one layered item with
// per-layer similars. The panel must render both sets.
const seededState = {
  batches: [
    {
      id: 'seed-1',
      createdAt: Date.now(),
      items: [
        {
          id: 'seed-root',
          category: '测试',
          title: '零层条目',
          summary: '根级类似知识点应渲染在摘要下方',
          layers: [],
          similars: [
            { title: '根级类似A', text: '根级类似内容A' },
            { title: '根级类似B', text: '根级类似内容B' },
          ],
          createdAt: Date.now(),
        },
        {
          id: 'seed-layer',
          category: '测试',
          title: '深入过的条目',
          summary: '层内类似知识点应渲染在深入内容下方',
          layers: [
            { content: '第一层内容', similars: [{ title: '层内类似X', text: '层内类似内容X' }] },
          ],
          createdAt: Date.now(),
        },
      ],
    },
  ],
  apiKey: '',
}
window.localStorage.setItem('dsh.tanqi.v1', JSON.stringify(seededState))

// Fake client context (the plugin only needs ctx for nothing at apply time).
const ctx = {
  effect() { return () => {} },
}
exports.apply(ctx)

// MutationObserver callbacks run on a later tick — let the mounts settle.
await new Promise((resolve) => setTimeout(resolve, 50))

const entry = window.document.querySelector('[data-dsh-tanqi-entry]')
if (entry === null) {
  console.error('FAIL: sidebar entry row not mounted')
  process.exit(1)
}
const view = window.document.querySelector('[data-dsh-tanqi-view]')
if (view === null) {
  console.error('FAIL: panel view container not mounted')
  process.exit(1)
}
const style = window.document.querySelector('style[data-plugin-css="@lastplayer82/dsh-tanqi/panel.css"]')
if (style === null || style.textContent.length < 1000) {
  console.error('FAIL: embedded stylesheet not injected')
  process.exit(1)
}

// Click the sidebar entry: the panel must activate (html attribute + eviction
// of sibling panel attributes).
entry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
if (!window.document.documentElement.hasAttribute('data-dsh-tanqi-active')) {
  console.error('FAIL: panel did not activate on entry click')
  process.exit(1)
}

// The seeded explore view must render both「类似知识点」sets: root-level on the
// layerless item and per-layer on the layered item (3 entries total).
await new Promise((resolve) => setTimeout(resolve, 50))
const similarEntries = window.document.querySelectorAll('.tq-similarEntry')
if (similarEntries.length !== 3) {
  console.error(`FAIL: expected 3 similar entries rendered, got ${similarEntries.length}`)
  process.exit(1)
}
const similarTexts = [...similarEntries].map((node) => node.textContent)
for (const expect of ['根级类似A', '根级类似B', '层内类似X']) {
  if (!similarTexts.some((text) => text.includes(expect))) {
    console.error(`FAIL: similar entry "${expect}" not rendered`)
    process.exit(1)
  }
}

window.document.documentElement.setAttribute('data-dsh-taskboard-active', '')
window.document.dispatchEvent(new window.CustomEvent('dsh-panel-activate', { detail: 'taskboard' }))
if (window.document.documentElement.hasAttribute('data-dsh-tanqi-active')) {
  console.error('FAIL: sibling activation did not close the panel')
  process.exit(1)
}

console.log('PASS: client bundle loads, mounts sidebar+panel, injects styles, activation protocol works')
