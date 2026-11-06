/**
 * Stylesheet of the HUD. It is rendered as a <style> element *inside* the shadow root (see
 * HydrationDoctorHUD.vue), which is what keeps it from leaking into the host page and keeps the
 * page's CSS out of the HUD. Plain CSS in a string, not an SFC <style> block: the latter would be
 * hoisted into document.head by the bundler.
 */
export const HUD_STYLES = `
*, *::before, *::after { box-sizing: border-box; }

:host, .nhd-root {
  --nhd-bg: #14161a;
  --nhd-bg-raised: #1d2026;
  --nhd-border: #353a44;
  --nhd-text: #e8eaed;
  --nhd-muted: #a3a9b5;
  --nhd-accent: #ff5a5f;
  --nhd-removed: rgba(255, 90, 95, 0.18);
  --nhd-removed-mark: rgba(255, 90, 95, 0.5);
  --nhd-added: rgba(52, 199, 89, 0.16);
  --nhd-added-mark: rgba(52, 199, 89, 0.45);
  --nhd-changed: rgba(255, 193, 7, 0.14);
  --nhd-changed-mark: rgba(255, 193, 7, 0.45);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--nhd-text);
}

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid #8ab4ff; outline-offset: 2px; }

.nhd-overlays { position: fixed; inset: 0; pointer-events: none; }
.nhd-box {
  position: fixed;
  border: 2px dashed var(--nhd-accent);
  background: rgba(255, 90, 95, 0.08);
  border-radius: 2px;
}
.nhd-box--selected {
  border-style: solid;
  background: rgba(255, 90, 95, 0.16);
  box-shadow: 0 0 0 2px rgba(255, 90, 95, 0.35);
}
.nhd-chip {
  position: absolute;
  left: -2px;
  top: -24px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
  padding: 2px 8px;
  border: 0;
  border-radius: 4px;
  background: var(--nhd-accent);
  color: #1a0507;
  font-weight: 600;
}
.nhd-chip--inside { top: 2px; left: 2px; }

.nhd-badge {
  position: fixed;
  right: 16px;
  bottom: 16px;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--nhd-border);
  border-radius: 999px;
  background: var(--nhd-bg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.nhd-badge--alert { border-color: var(--nhd-accent); }
.nhd-count {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--nhd-border);
  text-align: center;
  font-weight: 700;
}
.nhd-badge--alert .nhd-count { background: var(--nhd-accent); color: #1a0507; }

.nhd-panel {
  position: fixed;
  right: 16px;
  bottom: 64px;
  width: min(1000px, calc(100vw - 32px));
  max-height: min(72vh, 720px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--nhd-border);
  border-radius: 10px;
  background: var(--nhd-bg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.nhd-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--nhd-border);
}
.nhd-title { margin: 0 auto 0 0; font-size: 14px; font-weight: 700; }
.nhd-action {
  padding: 4px 10px;
  border: 1px solid var(--nhd-border);
  border-radius: 6px;
  background: var(--nhd-bg-raised);
}
.nhd-body { overflow: auto; padding: 12px 14px 16px; }
.nhd-empty { margin: 0; color: var(--nhd-muted); }

.nhd-issues { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; }
.nhd-issue-tab {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 10px;
  border: 1px solid var(--nhd-border);
  border-radius: 6px;
  background: var(--nhd-bg-raised);
}
.nhd-issue-tab[aria-current='true'] { border-color: var(--nhd-accent); background: rgba(255, 90, 95, 0.14); }

.nhd-meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; margin: 0 0 10px; }
.nhd-meta dt { color: var(--nhd-muted); }
.nhd-meta dd { margin: 0; word-break: break-word; }
.nhd-loc { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.nhd-loc code, .nhd-message {
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.nhd-message {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--nhd-accent);
  background: var(--nhd-bg-raised);
  white-space: pre-wrap;
  word-break: break-word;
}
.nhd-crumbs { margin: 0 0 12px; padding-left: 18px; color: var(--nhd-muted); }

.nhd-section-title { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
.nhd-diagnoses { margin: 0 0 14px; }
.nhd-diagnosis {
  margin: 0 0 10px;
  padding: 10px 12px;
  border: 1px solid var(--nhd-border);
  border-left: 3px solid #8ab4ff;
  border-radius: 6px;
  background: var(--nhd-bg-raised);
}
.nhd-diagnosis-title { margin: 0 0 4px; font-size: 13px; font-weight: 700; }
.nhd-confidence { margin-left: 8px; font-weight: 400; color: var(--nhd-muted); white-space: nowrap; }
.nhd-explanation { margin: 0 0 6px; }
.nhd-evidence { margin: 0 0 8px; padding-left: 18px; color: var(--nhd-muted); }
.nhd-fix-description { margin: 0 0 6px; }
.nhd-code {
  margin: 0 0 6px;
  padding: 8px 10px;
  overflow-x: auto;
  white-space: pre;
  border: 1px solid var(--nhd-border);
  border-radius: 6px;
  background: var(--nhd-bg);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.nhd-note { margin: 0 0 8px; color: var(--nhd-muted); }
.nhd-diff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid var(--nhd-border);
  border-radius: 6px;
  overflow: hidden;
}
.nhd-diff-head {
  margin: 0;
  padding: 6px 10px;
  border-bottom: 1px solid var(--nhd-border);
  background: var(--nhd-bg-raised);
  font-size: 12px;
  font-weight: 700;
}
.nhd-diff-head + .nhd-diff-head { border-left: 1px solid var(--nhd-border); }
.nhd-cell {
  margin: 0;
  padding: 1px 10px 1px 4px;
  overflow-x: auto;
  white-space: pre;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.nhd-cell--client { border-left: 1px solid var(--nhd-border); }
.nhd-gutter { display: inline-block; width: 1.4em; color: var(--nhd-muted); user-select: none; }
.nhd-cell--changed { background: var(--nhd-changed); }
.nhd-cell--removed { background: var(--nhd-removed); }
.nhd-cell--added { background: var(--nhd-added); }
.nhd-cell--empty { background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.03) 6px 12px); }
.nhd-cell--changed mark { background: var(--nhd-changed-mark); color: inherit; }
.nhd-cell--removed mark { background: var(--nhd-removed-mark); color: inherit; }
.nhd-cell--added mark { background: var(--nhd-added-mark); color: inherit; }
.nhd-single {
  margin: 0;
  padding: 8px 10px;
  overflow-x: auto;
  white-space: pre;
  border: 1px solid var(--nhd-border);
  border-radius: 6px;
  background: var(--nhd-bg-raised);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (max-width: 640px) {
  .nhd-panel { right: 8px; left: 8px; width: auto; bottom: 60px; }
  .nhd-meta { grid-template-columns: 1fr; }
}
`;
