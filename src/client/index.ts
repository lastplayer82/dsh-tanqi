/**
 * Browser-half entry for the dsh-tanqi plugin — runs inside the dsh web GUI.
 *
 * Mounts the two DOM surfaces: the sidebar entry row (toggles the panel) and
 * the tanqi panel in the center column, plus the embedded stylesheet (the
 * client loader serves no separate CSS asset — dsh-ssh precedent). Failure
 * policy: DOM mounting problems are logged, never thrown — the web shell
 * fails the whole boot when a plugin apply throws, and an external plugin
 * must not take the GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { TanqiApi } from './api.ts'
import { TanqiController } from './controller.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { TanqiStore } from './store.ts'
import { CSS, TANQI_CSS_TAG_ID } from './panel/styles.ts'
import { mountPanel } from './mount.tsx'

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { TanqiPanelProps } from './panel/TanqiPanel.tsx'
export type { TanqiControllerSnapshot } from './controller.ts'
export type { TanqiState, TanqiBatch, TanqiItem, SimilarPoint } from './store.ts'

/** Inject the embedded stylesheet once (deduplicated by tag id). */
function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(TANQI_CSS_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@lastplayer82/dsh-tanqi'
  tag.dataset.pluginCss = TANQI_CSS_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** Mount the tanqi panel. */
export function apply(_ctx: ClientContext): void {
  injectStyles()
  const controller = new TanqiController()
  const api = new TanqiApi()
  const store = new TanqiStore()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, api, store))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-tanqi] mount failed:', error)
  }
}
