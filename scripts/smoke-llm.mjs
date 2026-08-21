/**
 * Host-side generation pipeline smoke test: exercises the real prompts,
 * generateViaKey (DeepSeek API), extractJson, and the route family assembly —
 * the exact code paths the /api/dsh-tanqi/generate route runs (minus the HTTP
 * layer). Uses the DSH credential DEEPSEEK_API_KEY from D:\Dsh\.credentials.yaml;
 * the key itself is never printed.
 *
 * Run: node scripts/smoke-llm.mjs   (needs `pnpm build` first; Node ≥ 24 for
 * native TS type stripping when importing from src/)
 */
import { readFileSync } from 'node:fs'
import { generateViaKey, extractJson } from '../src/llm.ts'
import { discoverSystem, discoverUser, deepSystem, deepLayer1User, similarSystem, similarUser } from '../src/prompts.ts'
import { makeRoutes } from '../src/routes.ts'

const credText = readFileSync('D:/Dsh/.credentials.yaml', 'utf8')
const key = /DEEPSEEK_API_KEY:\s*["']?([^"'\r\n]+)/.exec(credText)?.[1]?.trim()
if (!key) {
  console.error('FAIL: DEEPSEEK_API_KEY not found in .credentials.yaml')
  process.exit(1)
}

// The route family assembles two exact routes under /api/dsh-tanqi.
const routes = makeRoutes({ ctx: {}, override: {} })
const paths = routes.map((route) => `${route.kind}:${route.path}`).join(', ')
console.log('routes:', paths)
if (!paths.includes('exact:/api/dsh-tanqi/status') || !paths.includes('exact:/api/dsh-tanqi/generate')) {
  console.error('FAIL: route family shape wrong')
  process.exit(1)
}

const signal = AbortSignal.timeout(120_000)
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}
/** True when the string contains any CJK ideograph (zh output check). */
const hasCjk = (s) => /[\u3400-\u9fff]/.test(s)

// 1) discover (zh, default): prompt → model → JSON → items
const discoverText = await generateViaKey(key, discoverSystem('zh'), discoverUser(['光速是宇宙速度极限', '黑洞'], 3, 'zh'), {
  maxTokens: 1600,
  temperature: 0.8,
  signal,
})
const discoverData = extractJson(discoverText)
const items = Array.isArray(discoverData?.items) ? discoverData.items : undefined
check('discover returns items', Array.isArray(items) && items.length >= 3, items ? `${items.length} items` : 'no items')
const validItems = (items ?? []).every((item) =>
  item && typeof item.title === 'string' && item.title.length > 0
  && typeof item.summary === 'string' && item.summary.length > 0
  && typeof item.category === 'string')
check('discover item shape', validItems, items ? items.map((item) => `[${item.category}] ${item.title}`).join(' | ') : '')
const zhOnly = (items ?? []).every((item) => hasCjk(item.title) && hasCjk(item.summary))
check('discover zh output is Chinese', zhOnly, items ? items.map((item) => item.title).join(' | ') : '')

// 1b) discover (en): lang directive must make every string English
const enText = await generateViaKey(key, discoverSystem('en'), discoverUser(['The speed of light is the universal speed limit', 'Black holes'], 3, 'en'), {
  maxTokens: 1600,
  temperature: 0.8,
  signal,
})
const enData = extractJson(enText)
const enItems = Array.isArray(enData?.items) ? enData.items : undefined
check('en discover returns items', Array.isArray(enItems) && enItems.length >= 3, enItems ? `${enItems.length} items` : 'no items')
const enNoCjk = (enItems ?? []).every((item) =>
  item && typeof item.title === 'string' && !hasCjk(item.title)
  && typeof item.summary === 'string' && !hasCjk(item.summary)
  && typeof item.category === 'string' && !hasCjk(item.category))
check('en discover output has no CJK', enNoCjk, enItems ? enItems.map((item) => `[${item.category}] ${item.title}`).join(' | ') : '')

if (items && items.length > 0 && validItems) {
  // 2) deep (layer 1, zh)
  const deepText = await generateViaKey(key, deepSystem('zh'), deepLayer1User(items[0].title, items[0].summary, 'zh'), {
    maxTokens: 1300,
    temperature: 0.6,
    signal,
  })
  const deepData = extractJson(deepText)
  check('deep returns content', typeof deepData?.content === 'string' && deepData.content.length > 100, `${deepData?.content?.length ?? 0} chars`)

  // 3) similar (zh)
  const similarText = await generateViaKey(key, similarSystem('zh'), similarUser(items[0].title, 'zh'), {
    maxTokens: 800,
    temperature: 0.7,
    signal,
  })
  const similarData = extractJson(similarText)
  const points = Array.isArray(similarData?.points) ? similarData.points : undefined
  check('similar returns points', Array.isArray(points) && points.length >= 1, `${points?.length ?? 0} points`)
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
