/**
 * dsh-tanqi — host half. Mounts the /api/dsh-tanqi route family (status +
 * generate), which drives the AI generation through the host's own LLM
 * channel (ctx.llm, zero config) or a user-supplied DeepSeek key, plus a
 * system-prompt announcement. The browser half (./client) renders the 探奇
 * panel. Everything rides official NPM SDK packages — no dsh source changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { makeRoutes, type TanqiRouteOverride } from './routes.ts'

/** Stable cordis plugin name. */
export const name = 'tanqi'

/** Services required before the tanqi surfaces can mount. */
export const inject = ['webServer', 'systemPrompt', 'llm']

/**
 * Settings namespace of the tanqi capability — the section the web settings
 * surface edits. Spelled here rather than imported: the browser half spells
 * the same value and must not depend on a Host package.
 */
export const TANQI_SETTINGS_NAMESPACE = settingsNamespace('dsh-tanqi')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config extends TanqiRouteOverride {
  /**
   * When true (default), a system-prompt section announces the tanqi plugin
   * to every agent. Set false to keep it silent.
   */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, prompt section). */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  provider: z.string(),
  model: z.string(),
})

/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 250

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TANQI_GUIDANCE =
  '本机已安装 dsh-tanqi 插件（探奇）：侧边栏「探奇」入口；AI 动态生成冷知识与奇妙事实（方案B，主公私人清单不收录）。能力：开始探奇每次生成一批不重复主题（含大公司病/产品决策困局/行业潜规则类）；每条可深入两层 + 类似知识点；历史全留存在浏览器 localStorage（键 dsh.tanqi.v1）。模型通道：优先复用本机 DSH 已配置的模型（免配置），无可用通道时可在面板填 DeepSeek API Key（存本浏览器，经本机服务端代调）。注意：生成消耗模型额度（走 DSH 通道即 API 余额）；内容为 AI 生成，可能存在不准确，请勿用于重要决策。用户提到「探奇 / 冷知识 / 奇妙事实」时即指本插件，请据此协作。'

/**
 * Mount the routes and the announcement.
 * @param ctx - host plugin context carrying webServer/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The live source the surfaces read: the settings section once the web
  // settings surface is served, the composition entry otherwise.
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => {
    const value = current()
    return {
      announceToAgent: value.announceToAgent ?? DEFAULT_ANNOUNCE,
      enabled: value.enabled ?? true,
      provider: value.provider,
      model: value.model,
    }
  }

  let disposeRoutes: (() => void) | undefined
  let disposeSection: (() => void) | undefined

  // Register (or drop) every surface to match the current source. Each group
  // is kept under one disposer: re-registering first tears the old one down
  // so duplicate-name registrations never throw.
  const sync = (): void => {
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (!resolve().enabled) return
    disposeSection = ctx.systemPrompt.section({
      name: 'plugin:dsh-tanqi',
      order: SECTION_ORDER,
      text: TANQI_GUIDANCE,
    })
    disposeRoutes = ctx.effect(
      () => {
        const routes = makeRoutes({ ctx, override: { provider: resolve().provider, model: resolve().model } })
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-tanqi: routes',
    )
  }

  installSettingsSection(ctx, TANQI_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose installSettingsSection never fires its hooks).
  sync()
}
