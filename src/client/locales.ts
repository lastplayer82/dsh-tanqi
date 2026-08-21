/**
 * Locale dictionaries for the dsh-tanqi panel. Self-contained (no ctx.locale
 * dependency): the panel picks the active dictionary from document.lang.
 */

/** Every copy key of the tanqi surface. */
export type TanqiKey =
  | 'entry.label'
  | 'entry.tooltip'
  | 'tab.explore'
  | 'tab.history'
  | 'channel.dsh'
  | 'channel.none'
  | 'channel.key'
  | 'key.label'
  | 'key.placeholder'
  | 'key.save'
  | 'key.saved'
  | 'key.hint'
  | 'discover.start'
  | 'discover.more'
  | 'discover.generating'
  | 'discover.empty'
  | 'discover.failed'
  | 'item.deep1'
  | 'item.deep2'
  | 'item.similar'
  | 'item.deep1.loading'
  | 'item.deep2.loading'
  | 'item.similar.loading'
  | 'item.summary'
  | 'history.empty'
  | 'history.batch'
  | 'history.clear'
  | 'history.clearConfirm'
  | 'history.duplicateAll'
  | 'history.duplicatePartial'
  | 'common.retry'
  | 'common.error'
  | 'common.close'

/** Chinese dictionary (default). */
export const zh: Record<TanqiKey, string> = {
  'entry.label': '探奇',
  'entry.tooltip': '探奇：冷知识与奇妙事实',
  'tab.explore': '开始探奇',
  'tab.history': '探奇清单',
  'channel.dsh': '模型通道：DSH 本机模型（免配置）',
  'channel.none': '未检测到可用的本机模型通道',
  'channel.key': '使用 DeepSeek API Key 兜底',
  'key.label': 'DeepSeek API Key（可选）',
  'key.placeholder': 'sk-...',
  'key.save': '保存',
  'key.saved': '已保存',
  'key.hint': 'Key 仅保存在本浏览器（localStorage），请求时经本机服务端代为调用，不会上传到第三方。',
  'discover.start': '开始探奇',
  'discover.more': '再探一批',
  'discover.generating': '探奇中… 模型正在现生成一批冷知识（约 10-40 秒）',
  'discover.empty': '还没有探奇结果。点击「开始探奇」，让模型现生成一批意想不到的冷知识与奇妙事实。',
  'discover.failed': '探奇失败',
  'item.deep1': '深入',
  'item.deep2': '再深入一层',
  'item.similar': '类似知识点',
  'item.deep1.loading': '深入中…',
  'item.deep2.loading': '深入中…',
  'item.similar.loading': '联想中…',
  'item.summary': '一句话简介',
  'history.empty': '探奇清单还是空的，先去探一批吧。',
  'history.batch': '第 {n} 批 · {count} 条 · {time}',
  'history.clear': '清空历史',
  'history.clearConfirm': '确定清空全部探奇历史（含已展示主题记录）？',
  'history.duplicateAll': '本次生成的条目与已看内容全部重复（已自动重试 3 轮），请稍后再试。',
  'history.duplicatePartial': '部分条目与已看内容重复已自动过滤，本次展示 {count} 条。',
  'common.retry': '重试',
  'common.error': '出错了',
  'common.close': '关闭',
}

/** English dictionary (fallback). */
export const en: Record<TanqiKey, string> = {
  'entry.label': 'Tanqi',
  'entry.tooltip': 'Tanqi: surprising facts & wonders',
  'tab.explore': 'Explore',
  'tab.history': 'History',
  'channel.dsh': 'Model channel: local DSH model (no config)',
  'channel.none': 'No usable local model channel detected',
  'channel.key': 'Fallback: DeepSeek API key',
  'key.label': 'DeepSeek API key (optional)',
  'key.placeholder': 'sk-...',
  'key.save': 'Save',
  'key.saved': 'Saved',
  'key.hint': 'The key stays in this browser (localStorage) and is proxied through your local dsh server — never sent to third parties.',
  'discover.start': 'Start exploring',
  'discover.more': 'Another batch',
  'discover.generating': 'Exploring… the model is generating a fresh batch of wonders (about 10-40s)',
  'discover.empty': 'Nothing yet. Hit "Start exploring" and the model generates a batch of surprising facts right now.',
  'discover.failed': 'Exploration failed',
  'item.deep1': 'Dive in',
  'item.deep2': 'Dive deeper',
  'item.similar': 'Related facts',
  'item.deep1.loading': 'Diving in…',
  'item.deep2.loading': 'Diving deeper…',
  'item.similar.loading': 'Associating…',
  'item.summary': 'In one line',
  'history.empty': 'The history is empty — go explore something first.',
  'history.batch': 'Batch {n} · {count} items · {time}',
  'history.clear': 'Clear history',
  'history.clearConfirm': 'Clear the whole history (including the shown-topics record)?',
  'history.duplicateAll': 'All generated items matched what you have already seen (auto-retried 3 rounds) — try again later.',
  'history.duplicatePartial': 'Some duplicate items were filtered out automatically; showing {count} this time.',
  'common.retry': 'Retry',
  'common.error': 'Error',
  'common.close': 'Close',
}

/** Template interpolation for {name} placeholders. */
export function t(dictionary: Record<string, string>, key: string, values?: Record<string, string | number>): string {
  let text = dictionary[key] ?? key
  if (values !== undefined) {
    for (const [name, value] of Object.entries(values)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

/** Active dictionary, picked by the document language at call time. */
export function dictionary(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? { ...en } : { ...zh }
}

/** Translate a key with optional {name} template params (current language). */
export function tt(key: TanqiKey, values?: Record<string, string | number>): string {
  return t(dictionary(), key, values)
}
