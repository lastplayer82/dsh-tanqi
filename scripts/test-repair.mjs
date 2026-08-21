/**
 * Unit test for the repaired extractJson (no network, no API cost).
 * Run: node --experimental-strip-types scripts/test-repair.mjs
 */
import { extractJson } from '../src/llm.ts'

const cases = [
  // [name, raw text, expect ok]
  ['plain valid', '{"items":[{"category":"a","title":"t","summary":"s"}]}', true],
  ['fenced json', '```json\n{"items":[{"category":"a","title":"t","summary":"s"}]}\n```', true],
  ['stray prose before', '好的，这是结果：{"items":[{"category":"a","title":"t","summary":"s"}]}', true],
  ['stray prose after', '{"items":[{"category":"a","title":"t","summary":"s"}]} 以上就是全部。', true],
  ['unescaped quote in string', '{"items":[{"category":"a","title":"他说"快跑"","summary":"s"}]}', true],
  ['quote before comma is terminator', '{"items":[{"category":"a","title":"t","summary":"s"},{"category":"b","title":"t2","summary":"s2"}]}', true],
  ['raw newline inside string', '{"items":[{"category":"a","title":"t","summary":"第一行\n第二行"}]}', true],
  ['raw tab inside string', '{"items":[{"category":"a","title":"t","summary":"a\tb"}]}', true],
  ['trailing comma', '{"items":[{"category":"a","title":"t","summary":"s"},]}', true],
  ['truncated string tail', '{"items":[{"category":"a","title":"t","summary":"abc', true],
  ['truncated object tail', '{"items":[{"category":"a","title":"t","summary":"s"}', true],
  ['escaped quote untouched', '{"items":[{"category":"a","title":"t","summary":"say \\"hi\\" ok"}]}', true],
  ['chinese quotes untouched', '{"items":[{"category":"a","title":"「第二大脑」","summary":"肠道是【第二大脑】"}]}', true],
  ['key colon after quote', '{"items":[{"category":"a","title":"t","summary":"s"}]}', true],
  ['colon inside content then quote', '{"items":[{"category":"a","title":"他喊:"快跑"","summary":"s"}]}', true],
  ['nested quotes mess', '{"items":[{"category":"a","title":"外"内"外","summary":"s"}]}', true],
  ['emoji + quotes', '{"items":[{"category":"a","title":"🎉 说"哈"","summary":"s"}]}', true],
]

let failed = 0
for (const [name, raw, expectOk] of cases) {
  const data = extractJson(raw)
  const ok = data !== undefined
  const pass = ok === expectOk
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${ok ? JSON.stringify(data).slice(0, 90) : 'undefined'}`)
  if (!pass) failed += 1
}

// Deep-nested sanity: extractJson must return the FIRST balanced object.
const multi = '{"a":1} 然后 {"b":2}'
const multiData = extractJson(multi)
const multiPass = multiData !== undefined && multiData.a === 1
console.log(`${multiPass ? 'PASS' : 'FAIL'} first-balanced-object — ${JSON.stringify(multiData)}`)
if (!multiPass) failed += 1

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
