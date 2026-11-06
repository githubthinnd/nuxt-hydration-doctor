/**
 * Stylesheet of the HUD. It is rendered as a <style> element *inside* the shadow root (see
 * HydrationDoctorHUD.vue), which is what keeps it from leaking into the host page and keeps the
 * page's CSS out of the HUD. Plain CSS in a string, not an SFC <style> block: the latter would be
 * hoisted into document.head by the bundler.
 *
 * Design tokens are CSS variables on the root: one palette per colour scheme, chosen by the
 * visitor's `prefers-color-scheme`, so every rule below speaks in roles (surface, border, muted,
 * accent…) and never in raw colours.
 */
export const HUD_STYLES = `
*, *::before, *::after { box-sizing: border-box; }

:host, .nhd-root {
  /* Dark palette (default). */
  --nhd-bg: #0c0e12;
  --nhd-surface: #12151b;
  --nhd-raised: #1a1e26;
  --nhd-hover: #222731;
  --nhd-border: #262b35;
  --nhd-border-strong: #394050;
  --nhd-text: #eceef2;
  --nhd-muted: #9aa2b1;
  --nhd-faint: #6b7385;
  --nhd-accent: #ff5d73;
  --nhd-accent-soft: rgba(255, 93, 115, 0.14);
  --nhd-accent-text: #1c0509;
  --nhd-info: #6ea8ff;
  --nhd-info-soft: rgba(110, 168, 255, 0.14);
  --nhd-ok: #3ddc97;
  --nhd-ok-soft: rgba(61, 220, 151, 0.14);
  --nhd-warn: #ffc857;
  --nhd-warn-soft: rgba(255, 200, 87, 0.14);
  --nhd-removed: rgba(255, 93, 115, 0.13);
  --nhd-removed-mark: rgba(255, 93, 115, 0.42);
  --nhd-added: rgba(61, 220, 151, 0.12);
  --nhd-added-mark: rgba(61, 220, 151, 0.38);
  --nhd-changed: rgba(255, 200, 87, 0.11);
  --nhd-changed-mark: rgba(255, 200, 87, 0.38);
  --nhd-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 16px 48px rgba(0, 0, 0, 0.55);
  --nhd-ring: #8ab4ff;
  --nhd-radius: 10px;
  --nhd-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  color-scheme: dark;
  font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--nhd-text);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: light) {
  :host, .nhd-root {
    --nhd-bg: #ffffff;
    --nhd-surface: #fafafb;
    --nhd-raised: #f1f2f5;
    --nhd-hover: #e8eaef;
    --nhd-border: #e1e4ea;
    --nhd-border-strong: #c7ccd6;
    --nhd-text: #15171c;
    --nhd-muted: #525a6b;
    --nhd-faint: #7b8394;
    --nhd-accent: #d6204a;
    --nhd-accent-soft: rgba(214, 32, 74, 0.09);
    --nhd-accent-text: #ffffff;
    --nhd-info: #1d5fd1;
    --nhd-info-soft: rgba(29, 95, 209, 0.09);
    --nhd-ok: #107a4c;
    --nhd-ok-soft: rgba(16, 122, 76, 0.1);
    --nhd-warn: #8a5a00;
    --nhd-warn-soft: rgba(176, 116, 0, 0.12);
    --nhd-removed: rgba(214, 32, 74, 0.09);
    --nhd-removed-mark: rgba(214, 32, 74, 0.27);
    --nhd-added: rgba(16, 122, 76, 0.1);
    --nhd-added-mark: rgba(16, 122, 76, 0.28);
    --nhd-changed: rgba(176, 116, 0, 0.1);
    --nhd-changed-mark: rgba(176, 116, 0, 0.3);
    --nhd-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 16px 48px rgba(16, 24, 40, 0.18);
    --nhd-ring: #1d5fd1;
    color-scheme: light;
  }
}

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--nhd-ring); outline-offset: 2px; }
svg { display: block; flex: none; }

@media (prefers-reduced-motion: no-preference) {
  .nhd-badge, .nhd-action, .nhd-issue-tab, .nhd-chip { transition: background-color 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.12s; }
  .nhd-panel { animation: nhd-pop 0.16s ease-out; }
  .nhd-box--selected { animation: nhd-pulse 1.6s ease-in-out 2; }
}
@keyframes nhd-pop { from { opacity: 0; transform: translateY(6px) scale(0.99); } to { opacity: 1; transform: none; } }
@keyframes nhd-pulse { 50% { box-shadow: 0 0 0 6px var(--nhd-accent-soft); } }

/* ---- Overlay: where on the page the mismatch is ---------------------------------------------- */
.nhd-overlays { position: fixed; inset: 0; pointer-events: none; }
.nhd-box {
  position: fixed;
  border: 1.5px dashed var(--nhd-accent);
  background: var(--nhd-accent-soft);
  border-radius: 4px;
}
.nhd-box--selected {
  border-style: solid;
  box-shadow: 0 0 0 3px var(--nhd-accent-soft);
}
.nhd-chip {
  position: absolute;
  left: -1.5px;
  top: -26px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
  padding: 2px 8px;
  border: 0;
  border-radius: 6px 6px 6px 2px;
  background: var(--nhd-accent);
  color: var(--nhd-accent-text);
  font: 600 11px/18px var(--nhd-mono);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.nhd-chip:hover { filter: brightness(1.08); }
.nhd-chip--inside { top: 3px; left: 3px; border-radius: 6px; }

/* ---- Badge ----------------------------------------------------------------------------------- */
/* The box the badge moves in: the viewport minus a margin. Its left/top/transform come from the
   position fractions (see the component), so the badge keeps its place when the window resizes. */
.nhd-dock { position: fixed; inset: 16px; pointer-events: none; }

.nhd-badge {
  position: absolute;
  pointer-events: auto;
  /* Dragging must not scroll the page on touch screens or select text. */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 6px 0 10px;
  white-space: nowrap;
  font-weight: 600;
  border: 1px solid var(--nhd-border-strong);
  border-radius: 999px;
  background: var(--nhd-bg);
  box-shadow: var(--nhd-shadow);
}
.nhd-badge:hover { background: var(--nhd-surface); }
.nhd-badge--alert { border-color: var(--nhd-accent); }
.nhd-badge--dragging { cursor: grabbing; transform-origin: center; }
.nhd-logo { color: var(--nhd-ok); }
.nhd-badge--alert .nhd-logo { color: var(--nhd-accent); }
.nhd-count {
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--nhd-raised);
  color: var(--nhd-muted);
  font: 700 12px/24px var(--nhd-mono);
  text-align: center;
}
.nhd-badge--alert .nhd-count { background: var(--nhd-accent); color: var(--nhd-accent-text); }

/* ---- Panel ----------------------------------------------------------------------------------- */
/* The panel docks to the screen edges nearest the badge, so it opens on the badge's side of the
   screen, next to it, and cannot run off screen. */
.nhd-panel--right { right: 16px; }
.nhd-panel--left { left: 16px; }
.nhd-panel--bottom { bottom: 64px; }
.nhd-panel--top { top: 64px; }
.nhd-panel {
  position: fixed;
  width: min(1040px, calc(100vw - 32px));
  max-height: min(calc(100vh - 88px), 760px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--nhd-border-strong);
  border-radius: 14px;
  background: var(--nhd-bg);
  box-shadow: var(--nhd-shadow);
}
.nhd-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--nhd-border);
  background: var(--nhd-surface);
}
.nhd-header .nhd-logo { color: var(--nhd-accent); }
.nhd-title { margin: 0 auto 0 0; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 650; letter-spacing: -0.01em; }
.nhd-brand { color: var(--nhd-faint); font-weight: 500; font-size: 12px; }
.nhd-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--nhd-border);
  border-radius: 7px;
  background: var(--nhd-raised);
  font-size: 12px;
  font-weight: 550;
}
.nhd-action:hover { background: var(--nhd-hover); border-color: var(--nhd-border-strong); }
.nhd-action--primary { background: var(--nhd-accent); border-color: var(--nhd-accent); color: var(--nhd-accent-text); }
.nhd-action--primary:hover { background: var(--nhd-accent); filter: brightness(1.1); }
.nhd-body { overflow: auto; padding: 14px 16px 18px; scrollbar-width: thin; scrollbar-color: var(--nhd-border-strong) transparent; }
.nhd-empty { margin: 0; padding: 28px 8px; text-align: center; color: var(--nhd-muted); }

.nhd-issues { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; }
.nhd-issue-tab {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--nhd-border);
  border-radius: 999px;
  background: var(--nhd-surface);
  color: var(--nhd-muted);
  font-size: 12px;
}
.nhd-issue-tab:hover { background: var(--nhd-hover); color: var(--nhd-text); }
.nhd-issue-tab[aria-current='true'] { border-color: var(--nhd-accent); background: var(--nhd-accent-soft); color: var(--nhd-text); font-weight: 600; }

.nhd-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  align-items: center;
  gap: 6px 18px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid var(--nhd-border);
  border-radius: var(--nhd-radius);
  background: var(--nhd-surface);
}
.nhd-meta dt { color: var(--nhd-faint); font-size: 12px; }
.nhd-meta dd { margin: 0; word-break: break-word; }
.nhd-loc { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.nhd-loc code, .nhd-message { font: 12px/1.55 var(--nhd-mono); }
.nhd-loc code { padding: 2px 6px; border-radius: 5px; background: var(--nhd-raised); }
.nhd-message {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--nhd-border);
  border-left: 3px solid var(--nhd-accent);
  border-radius: var(--nhd-radius);
  background: var(--nhd-surface);
  white-space: pre-wrap;
  word-break: break-word;
}
.nhd-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 0;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  color: var(--nhd-muted);
  font: 11.5px/1.4 var(--nhd-mono);
}
.nhd-crumbs li + li::before { content: '›'; margin: 0 6px; color: var(--nhd-faint); }

.nhd-section-title { margin: 0 0 8px; color: var(--nhd-faint); font-size: 11px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
.nhd-diagnoses { margin: 0 0 18px; }
.nhd-diagnosis {
  margin: 0 0 10px;
  padding: 12px 14px;
  border: 1px solid var(--nhd-border);
  border-radius: var(--nhd-radius);
  background: var(--nhd-surface);
}
.nhd-diagnosis-title { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0 0 6px; font-size: 14px; font-weight: 650; letter-spacing: -0.01em; }
.nhd-confidence {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--nhd-info-soft);
  color: var(--nhd-info);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
}
.nhd-confidence[data-level='high'] { background: var(--nhd-ok-soft); color: var(--nhd-ok); }
.nhd-confidence[data-level='medium'] { background: var(--nhd-warn-soft); color: var(--nhd-warn); }
.nhd-explanation { margin: 0 0 8px; color: var(--nhd-text); }
.nhd-evidence { margin: 0 0 10px; padding: 0; list-style: none; color: var(--nhd-muted); font-size: 12px; }
.nhd-evidence li { position: relative; padding: 2px 0 2px 16px; }
.nhd-evidence li::before { content: ''; position: absolute; left: 3px; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: var(--nhd-info); }
.nhd-fix { padding-top: 10px; border-top: 1px dashed var(--nhd-border); }
.nhd-fix-description { margin: 0 0 8px; color: var(--nhd-muted); }
.nhd-code {
  margin: 0 0 8px;
  padding: 10px 12px;
  overflow-x: auto;
  white-space: pre;
  border: 1px solid var(--nhd-border);
  border-radius: 8px;
  background: var(--nhd-bg);
  font: 12px/1.6 var(--nhd-mono);
  scrollbar-width: thin;
}
.nhd-note { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: var(--nhd-raised); color: var(--nhd-muted); font-size: 12px; }

/* Feedback after Copy: floats at the bottom of the panel and announces itself to screen readers. */
.nhd-toast {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--nhd-text);
  color: var(--nhd-bg);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--nhd-shadow);
  pointer-events: none;
}
.nhd-toast--error { background: var(--nhd-accent); color: var(--nhd-accent-text); }

/* ---- Server/client diff ---------------------------------------------------------------------- */
.nhd-diff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid var(--nhd-border);
  border-radius: var(--nhd-radius);
  overflow: hidden;
  background: var(--nhd-bg);
}
.nhd-diff-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nhd-border);
  background: var(--nhd-surface);
  color: var(--nhd-muted);
  font-size: 12px;
  font-weight: 600;
}
.nhd-diff-head::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--nhd-accent); }
.nhd-diff-head + .nhd-diff-head { border-left: 1px solid var(--nhd-border); }
.nhd-diff-head + .nhd-diff-head::before { background: var(--nhd-ok); }
.nhd-cell {
  margin: 0;
  padding: 1px 12px 1px 4px;
  overflow-x: auto;
  white-space: pre;
  font: 12px/1.65 var(--nhd-mono);
  scrollbar-width: thin;
}
.nhd-cell--client { border-left: 1px solid var(--nhd-border); }
.nhd-gutter { display: inline-block; width: 1.6em; color: var(--nhd-faint); text-align: center; user-select: none; }
.nhd-cell--changed { background: var(--nhd-changed); }
.nhd-cell--removed { background: var(--nhd-removed); }
.nhd-cell--added { background: var(--nhd-added); }
.nhd-cell--empty { background: repeating-linear-gradient(135deg, transparent 0 6px, var(--nhd-raised) 6px 12px); }
.nhd-cell mark { border-radius: 3px; color: inherit; }
.nhd-cell--changed mark { background: var(--nhd-changed-mark); }
.nhd-cell--removed mark { background: var(--nhd-removed-mark); }
.nhd-cell--added mark { background: var(--nhd-added-mark); }
.nhd-single {
  margin: 0 0 8px;
  padding: 10px 12px;
  overflow-x: auto;
  white-space: pre;
  border: 1px solid var(--nhd-border);
  border-radius: var(--nhd-radius);
  background: var(--nhd-surface);
  font: 12px/1.6 var(--nhd-mono);
}

@media (max-width: 640px) {
  .nhd-panel { right: 8px; left: 8px; width: auto; }
  .nhd-panel--bottom { bottom: 60px; }
  .nhd-panel--top { top: 60px; }
  .nhd-meta { grid-template-columns: 1fr; gap: 0; }
  .nhd-meta dd { margin-bottom: 8px; }
  .nhd-brand { display: none; }
}
`;
