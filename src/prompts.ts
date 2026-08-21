/**
 * Generation prompts for the dsh-tanqi plugin. Output language follows the
 * DSH UI language (zh → Chinese, en → English; default zh). Output is always
 * one strict JSON object so the host can parse layers deterministically.
 */

/** Output language of generated content. */
export type TanqiLang = 'zh' | 'en'

/** The language the panel currently asks for (falls back to Chinese). */
export function normalizeLang(value: string | undefined): TanqiLang {
  return value === 'en' ? 'en' : 'zh'
}

/** Per-language instruction: every generated string must be in this language. */
function langDirective(lang: TanqiLang): string {
  return lang === 'en'
    ? 'All generated content — categories, titles, summaries, deep-dive text, and knowledge-point titles/text — must be written in English.'
    : '所有生成内容——分类、标题、简介、深入讲解正文、类似知识点标题与文字——一律使用中文。'
}

/**
 * Shared guard: only JSON, no prose, no fences. Language-neutral: forbids
 * bare double quotes and newlines inside string values (they would break the
 * JSON we serialize), asks for 「」/『』 or single quotes instead.
 */
const JSON_ONLY =
  '严格只输出一个 JSON 对象，不要输出任何其他文字、注释或 Markdown 代码块；' +
  '所有字符串值内部禁止使用英文双引号（"）和换行，引用一律用中文引号「」『』或单引号。'

/** System prompt for the「开始探奇」batch generation. */
export function discoverSystem(lang: TanqiLang): string {
  return (
    '你是一个好奇心引擎「探奇」。用户点击"开始探奇"时，你现场生成一批令人"哇"的冷知识与奇妙事实。\n' +
    '要求：\n' +
    '1. 主题广泛多样：科技、历史、生物、物理、数学、心理学、医学、语言、文化、地理、商业等随机分布；' +
    '每批中至少包含 1-2 条关于"大公司病 / 产品决策困局 / 行业潜规则"的商业洞察类条目。\n' +
    '2. 内容必须真实、准确、可查证，严禁编造；拿不准的事实不要写。\n' +
    '3. 标题要有钩子（让人想点开深入了解），一句话简介要具体、有画面感，避免空泛。\n' +
    '4. ' + langDirective(lang) + '\n' +
    '5. ' + JSON_ONLY
  )
}

/** User prompt for the batch generation. */
export function discoverUser(exclude: string[], count: number, lang: TanqiLang): string {
  const parts = [`请生成 ${count} 条探奇条目。`]
  if (exclude.length > 0) {
    parts.push('【绝对不要与以下已展示过的主题重复】')
    parts.push(exclude.map((title, index) => `${index + 1}. ${title}`).join('\n'))
  }
  parts.push(lang === 'en'
    ? 'Output only JSON: {"items":[{"category":"category","title":"title","summary":"one-line summary"}]}'
    : '只输出 JSON：{"items":[{"category":"分类","title":"标题","summary":"一句话简介"}]}')
  return parts.join('\n\n')
}

/** System prompt for the「深入」layers. */
export function deepSystem(lang: TanqiLang): string {
  return (
    '你是深度科普撰稿人，擅长把冷知识讲透。回答要：\n' +
    '1. 把机制、原理、来龙去脉讲清楚' +
    (lang === 'en' ? ', 200-300 words in English, 2-3 paragraphs, plain language explaining "why this happens"' : '，500-700 字中文，分 2-3 段，用通俗的话解释"为什么会这样"') +
    '；\n' +
    '2. 必须真实准确，不编造数据与事实；\n' +
    '3. 内容与给定主题严格相关，不要跑题。\n' +
    '4. ' + langDirective(lang) + '\n' +
    '5. ' + JSON_ONLY
  )
}

/** User prompt for layer 1 (expand the item itself). */
export function deepLayer1User(topic: string, summary: string, lang: TanqiLang): string {
  return (
    `请围绕以下探奇条目做第一层深入讲解：\n` +
    `主题：${topic}\n` +
    (summary ? `一句话简介：${summary}\n` : '') +
    (lang === 'en'
      ? 'Output only JSON: {"title":"' + topic + '","content":"the deep-dive text (may use \\n for paragraphs)"}'
      : `只输出 JSON：{"title":"${topic}","content":"深入讲解内容（可用\\n分段）"}`)
  )
}

/** User prompt for deeper layers (layer ≥ 2: one level deeper each time). */
export function deepLayer2User(topic: string, context: string, lang: TanqiLang): string {
  return (
    `请就同一主题再深入一层：不再重复上一层已讲的内容，而是深挖更底层的原理、` +
    `关键机制、历史脉络或反常识延伸，最好有具体案例或数据支撑。\n` +
    `主题：${topic}\n` +
    (context ? `上一层内容摘要（供参考，不要重复）：\n${context.slice(0, 800)}\n` : '') +
    (lang === 'en'
      ? 'Output only JSON: {"title":"' + topic + ' (advanced)","content":"the deeper content (may use \\n for paragraphs)"}'
      : `只输出 JSON：{"title":"${topic}（进阶）","content":"更深一层的内容（可用\\n分段）"}`)
  )
}

/** System prompt for the「类似知识点」layer. */
export function similarSystem(lang: TanqiLang): string {
  return (
    '你是知识联想引擎。根据给定主题，给出 2-4 条相关但不同的知识点：' +
    '每条是一个独立的冷知识或奇妙事实，与主题同属一个知识领域或有机制上的关联，但不能只是主题的复述。' +
    '必须真实准确，严禁编造。\n' +
    langDirective(lang) + '\n' +
    JSON_ONLY
  )
}

/** User prompt for the similar-points layer. */
export function similarUser(topic: string, lang: TanqiLang): string {
  return lang === 'en'
    ? `Topic: ${topic}\nOutput only JSON: {"points":[{"title":"point title","text":"explained in one or two sentences"}]}`
    : `主题：${topic}\n只输出 JSON：{"points":[{"title":"知识点标题","text":"一两句话讲清楚"}]}`
}
