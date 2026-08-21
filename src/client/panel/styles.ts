/**
 * dsh-tanqi panel styles, embedded as a TS string.
 *
 * The dsh client module loader loads plugin bundles as classic scripts and
 * serves only `/plugins/<id>/client.js` (+ .map), so a separate CSS asset is
 * unsupported — the family-bucket precedent (dsh-ssh) embeds the stylesheet
 * text and injects a <style> tag at boot. Class names carry the `tq-` prefix
 * to avoid colliding with the shell's own styles.
 */

export const TANQI_CSS_TAG_ID = '@lastplayer82/dsh-tanqi/panel.css'

export const CSS = `
/* --- center-column takeover (global rules, attribute-scoped) ----------------- */

[data-pane='conversation'] {
  position: relative;
}

[data-dsh-tanqi-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  background: var(--dsw-alias-bg-base);
}

html[data-dsh-tanqi-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-tanqi-view] {
  display: block;
}

html[data-dsh-tanqi-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane='conversation'] > :not([data-dsh-tanqi-view]),
html[data-dsh-tanqi-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*='centerCol'] > :not([data-dsh-tanqi-view]) {
  display: none !important;
}

/* --- sidebar entry row ------------------------------------------------------- */

.tq-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.tq-entry:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}

.tq-entry[data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.tq-entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.tq-entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- panel frame ------------------------------------------------------------- */

.tq-panelRoot {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
}

.tq-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px 0;
}

.tq-headerTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tq-headerTitleIcon {
  display: inline-flex;
  color: var(--dsw-alias-state-info-primary, var(--dsw-alias-label-secondary));
}

.tq-tabs {
  display: inline-flex;
  gap: 4px;
  margin-left: 8px;
  padding: 3px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-subtle, var(--dsw-alias-border-l1));
}

.tq-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.tq-tab:hover {
  color: var(--dsw-alias-label-primary);
}

.tq-tabActive {
  background: var(--dsw-alias-bg-float, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.tq-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* --- channel strip ----------------------------------------------------------- */

.tq-channelStrip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  flex-wrap: wrap;
}

.tq-channelOk {
  background: var(--dsw-alias-state-success-subtle, rgba(34, 160, 96, 0.1));
  color: var(--dsw-alias-state-success-primary, #22a060);
}

.tq-channelWarn {
  background: var(--dsw-alias-state-warn-subtle, rgba(220, 150, 40, 0.12));
  color: var(--dsw-alias-state-warn-label, #b07a1f);
}

.tq-channelKey {
  background: var(--dsw-alias-state-info-subtle, rgba(46, 118, 220, 0.12));
  color: var(--dsw-alias-state-info-primary, #2e76dc);
}

.tq-keyRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  width: 100%;
}

.tq-keyInput {
  flex: 1;
  min-width: 200px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-input-fill, var(--dsw-alias-bg-float));
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.tq-keyInput:focus {
  outline: none;
  border-color: var(--dsw-alias-state-info-primary, #2e76dc);
}

.tq-keySave {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 15px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 13px;
  cursor: pointer;
}

.tq-keySave:hover:not(:disabled) {
  filter: brightness(1.06);
}

.tq-keySave:disabled {
  opacity: 0.6;
  cursor: default;
}

.tq-keyHint {
  width: 100%;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.tq-savedFlash {
  color: var(--dsw-alias-state-success-primary, #22a060);
  font-size: 12px;
}

/* --- hero (empty state) ------------------------------------------------------ */

.tq-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 14px;
  text-align: center;
}

.tq-heroIcon {
  font-size: 30px;
  line-height: 1;
}

.tq-emptyHint {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  max-width: 420px;
  margin: 0;
}

/* --- buttons ---------------------------------------------------------------- */

.tq-primaryBtn {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 17px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tq-primaryBtn:hover:not(:disabled) {
  filter: brightness(1.06);
}

.tq-primaryBtn:disabled {
  opacity: 0.6;
  cursor: default;
}

.tq-secondaryBtn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 15px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tq-secondaryBtn:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-subtle, transparent);
}

.tq-secondaryBtn:disabled {
  opacity: 0.6;
  cursor: default;
}

.tq-dangerBtn {
  border-color: var(--dsw-alias-state-error-border, rgba(220, 60, 60, 0.5));
  color: var(--dsw-alias-state-error-label, #c0362c);
}

.tq-dangerBtn:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-error-primary, #d63a30);
  background: var(--dsw-alias-state-error-subtle, rgba(214, 58, 48, 0.08));
  color: var(--dsw-alias-state-error-primary, #d63a30);
}

.tq-generating {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tq-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--dsw-alias-border-l3);
  border-top-color: var(--dsw-alias-state-info-primary, #2e76dc);
  border-radius: 50%;
  animation: tqSpin 0.8s linear infinite;
}

@keyframes tqSpin {
  to {
    transform: rotate(360deg);
  }
}

/* --- error banner ------------------------------------------------------------ */

.tq-errorBanner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-state-error-subtle, rgba(214, 58, 48, 0.08));
  border: 1px solid var(--dsw-alias-state-error-border, rgba(214, 58, 48, 0.35));
  color: var(--dsw-alias-state-error-label, #c0362c);
  font-size: 12px;
  line-height: 18px;
}

.tq-errorClose {
  margin-left: auto;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  flex: none;
}

/* --- item cards -------------------------------------------------------------- */

.tq-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tq-itemCard {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-float, var(--dsw-alias-bg-base));
}

.tq-itemHead {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.tq-itemCategory {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
  margin-top: 2px;
}

.tq-itemTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.tq-itemSummary {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.tq-itemActions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* --- content layers ---------------------------------------------------------- */

.tq-contentSection {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.tq-contentTitle {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.tq-contentParagraph {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 22px;
  white-space: pre-wrap;
}

.tq-similarList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tq-similarEntry {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-subtle, var(--dsw-alias-border-l1));
}

.tq-similarTitle {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  margin: 0 0 2px;
}

.tq-similarText {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 19px;
}

/* --- history ----------------------------------------------------------------- */

.tq-historyHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tq-batchHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 4px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.tq-batchHeader:hover {
  color: var(--dsw-alias-label-primary);
}

.tq-batchCaret {
  display: inline-block;
  transition: transform 0.12s ease;
  font-size: 10px;
}

.tq-batchCaretOpen {
  transform: rotate(90deg);
}

.tq-batchBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 14px;
  border-left: 2px solid var(--dsw-alias-border-l1);
}

.tq-batchEmpty {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 0;
}

/* --- footer ----------------------------------------------------------------- */

.tq-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0 2px;
}
`
