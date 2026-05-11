/**
 * Styles for `<PilotSidebar>` shipped as a single CSS string and injected into
 * `<head>` on first mount. Chosen over a separate `.css` file for two reasons:
 *
 *   1. Consumers don't have to configure their bundler to pick up CSS from a
 *      dependency (no Tailwind plugin, no `import "agentickit/sidebar.css"`
 *      side-effect import to remember).
 *   2. The package stays a single JS artifact for both ESM and CJS consumers.
 *
 * Every class is prefixed with `pilot-` so we can't collide with the host app.
 * Theming is CSS-variable-driven, consumers override by setting the variables
 * on a parent scope (e.g., `:root` or `body`, or a wrapping div).
 *
 * We inject exactly once per document. StrictMode and multiple PilotSidebar
 * instances all share the same `<style>` tag, so there's no risk of duplicate
 * rules piling up.
 */

const STYLE_ELEMENT_ID = "pilot-sidebar-styles";

/** The full stylesheet, written inline so we can ship a zero-config sidebar. */
/*
 * Default tokens are wrapped in :where(:root) which has specificity 0,0,0,0.
 * Any consumer rule on :root (specificity 0,0,1,0) overrides them without
 * needing higher-specificity selectors. The `[data-pilot-theme="dark"]`
 * sibling lets host apps drive dark mode manually (a manual theme toggle)
 * alongside the OS-level @media query that auto-tracks system preference.
 */
export const PILOT_SIDEBAR_CSS = `
:where(:root) {
  --pilot-bg: #ffffff;
  --pilot-bg-elevated: #ffffff;
  --pilot-fg: #0a0a0a;
  --pilot-fg-muted: #6b7280;
  --pilot-fg-subtle: #9ca3af;
  --pilot-border: rgba(0, 0, 0, 0.08);
  --pilot-border-strong: rgba(0, 0, 0, 0.14);
  --pilot-accent: #0a0a0a;
  --pilot-accent-fg: #ffffff;
  --pilot-user-bubble-bg: #f3f4f6;
  --pilot-user-bubble-fg: #0a0a0a;
  --pilot-assistant-fg: #1f2937;
  --pilot-tool-bg: rgba(0, 0, 0, 0.03);
  --pilot-tool-border: rgba(0, 0, 0, 0.08);
  --pilot-error-bg: #fef2f2;
  --pilot-error-fg: #991b1b;
  --pilot-error-border: #fecaca;
  --pilot-radius: 10px;
  --pilot-radius-sm: 6px;
  --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
  --pilot-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
    Arial, system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :where(:root):not([data-pilot-theme="light"]) {
    --pilot-bg: #0b0b0c;
    --pilot-bg-elevated: #111113;
    --pilot-fg: #f5f5f7;
    --pilot-fg-muted: #9aa0a6;
    --pilot-fg-subtle: #6b7280;
    --pilot-border: rgba(255, 255, 255, 0.08);
    --pilot-border-strong: rgba(255, 255, 255, 0.14);
    --pilot-accent: #f5f5f7;
    --pilot-accent-fg: #0b0b0c;
    --pilot-user-bubble-bg: #1f2023;
    --pilot-user-bubble-fg: #f5f5f7;
    --pilot-assistant-fg: #e5e7eb;
    --pilot-tool-bg: rgba(255, 255, 255, 0.04);
    --pilot-tool-border: rgba(255, 255, 255, 0.08);
    --pilot-error-bg: rgba(153, 27, 27, 0.18);
    --pilot-error-fg: #fecaca;
    --pilot-error-border: rgba(254, 202, 202, 0.2);
    --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35);
  }
}

:where(:root)[data-pilot-theme="dark"] {
  --pilot-bg: #0b0b0c;
  --pilot-bg-elevated: #111113;
  --pilot-fg: #f5f5f7;
  --pilot-fg-muted: #9aa0a6;
  --pilot-fg-subtle: #6b7280;
  --pilot-border: rgba(255, 255, 255, 0.08);
  --pilot-border-strong: rgba(255, 255, 255, 0.14);
  --pilot-accent: #f5f5f7;
  --pilot-accent-fg: #0b0b0c;
  --pilot-user-bubble-bg: #1f2023;
  --pilot-user-bubble-fg: #f5f5f7;
  --pilot-assistant-fg: #e5e7eb;
  --pilot-tool-bg: rgba(255, 255, 255, 0.04);
  --pilot-tool-border: rgba(255, 255, 255, 0.08);
  --pilot-error-bg: rgba(153, 27, 27, 0.18);
  --pilot-error-fg: #fecaca;
  --pilot-error-border: rgba(254, 202, 202, 0.2);
  --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35);
}

/* Push-mode page reflow. When <PilotSidebar mode="push"> is open, it sets
 * data-pilot-sidebar-mode="push" on <html> plus data-pilot-sidebar-position
 * and a --pilot-sidebar-width-active CSS variable. We use those to apply
 * matching padding to <body> so the consumer's main content shifts. The
 * transition matches the sidebar's slide animation. Consumers can override
 * this rule to push a specific element instead of the body. */
html[data-pilot-sidebar-mode="push"][data-pilot-sidebar-state="open"] body {
  transition: padding 200ms ease-out;
}
html[data-pilot-sidebar-mode="push"][data-pilot-sidebar-state="open"][data-pilot-sidebar-position="right"] body {
  padding-right: var(--pilot-sidebar-width-active, 380px);
}
html[data-pilot-sidebar-mode="push"][data-pilot-sidebar-state="open"][data-pilot-sidebar-position="left"] body {
  padding-left: var(--pilot-sidebar-width-active, 380px);
}

.pilot-toggle {
  position: fixed;
  bottom: 20px;
  z-index: 2147483600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 13px/1 var(--pilot-font);
  color: var(--pilot-accent-fg);
  background: var(--pilot-accent);
  border: 1px solid var(--pilot-accent);
  border-radius: 999px;
  box-shadow: var(--pilot-shadow);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.pilot-toggle:hover { transform: translateY(-1px); }
.pilot-toggle:active { transform: translateY(0); }
.pilot-toggle:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 2px;
}
.pilot-toggle[data-position="right"] { right: 20px; }
.pilot-toggle[data-position="left"] { left: 20px; }
.pilot-toggle-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: currentColor;
  opacity: 0.7;
}

.pilot-sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  width: var(--pilot-sidebar-width, 380px);
  max-width: 100vw;
  z-index: 2147483600;
  display: flex;
  flex-direction: column;
  background: var(--pilot-bg);
  color: var(--pilot-fg);
  font: 400 14px/1.5 var(--pilot-font);
  border-left: 1px solid var(--pilot-border);
  box-shadow: var(--pilot-shadow);
  animation: pilot-slide-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.pilot-sidebar[data-position="right"] { right: 0; }
.pilot-sidebar[data-position="left"] {
  left: 0;
  border-left: none;
  border-right: 1px solid var(--pilot-border);
  animation-name: pilot-slide-in-left;
}

@keyframes pilot-slide-in {
  from { transform: translateX(16px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes pilot-slide-in-left {
  from { transform: translateX(-16px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.pilot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pilot-border);
  flex: 0 0 auto;
}
.pilot-header-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.pilot-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--pilot-fg-muted);
  background: transparent;
  border: none;
  border-radius: var(--pilot-radius-sm);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.pilot-icon-button:hover {
  background: var(--pilot-tool-bg);
  color: var(--pilot-fg);
}
.pilot-icon-button:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 1px;
}

.pilot-messages {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
}
.pilot-messages::-webkit-scrollbar { width: 8px; }
.pilot-messages::-webkit-scrollbar-thumb {
  background: var(--pilot-border-strong);
  border-radius: 999px;
}

.pilot-empty {
  margin: auto 0;
  padding: 24px 12px;
  text-align: center;
  color: var(--pilot-fg-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: pilot-fade-in 220ms ease;
}
.pilot-empty-title {
  color: var(--pilot-fg);
  font-size: 15px;
  font-weight: 600;
}

.pilot-message {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  animation: pilot-fade-in 160ms ease-out;
}
.pilot-message[data-role="user"] { align-items: flex-end; }
.pilot-message[data-role="assistant"] { align-items: stretch; }

.pilot-user-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: var(--pilot-radius);
  background: var(--pilot-user-bubble-bg);
  color: var(--pilot-user-bubble-fg);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}

.pilot-assistant-body {
  color: var(--pilot-assistant-fg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}

.pilot-part-text { }

/* ---------------------------------------------------------------------------
 * Markdown output. Conservative sizes so assistant prose reads as one
 * continuous beat, not an article with section breaks. Headings are only
 * moderately larger than body text; lists are tight-spaced.
 * ------------------------------------------------------------------------- */
.pilot-md-p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pilot-md-p + .pilot-md-p { margin-top: 8px; }
.pilot-md-h1,
.pilot-md-h2,
.pilot-md-h3 {
  margin: 6px 0 2px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--pilot-fg);
}
.pilot-md-h1 { font-size: 15px; }
.pilot-md-h2 { font-size: 14px; }
.pilot-md-h3 { font-size: 13px; color: var(--pilot-fg-muted); }
.pilot-md-ul,
.pilot-md-ol {
  margin: 2px 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pilot-md-ul li::marker { color: var(--pilot-fg-subtle); }
.pilot-md-ol li::marker { color: var(--pilot-fg-subtle); }
.pilot-md-link {
  color: var(--pilot-fg);
  text-decoration: underline;
  text-decoration-color: var(--pilot-border-strong);
  text-underline-offset: 2px;
  transition: text-decoration-color 120ms ease;
}
.pilot-md-link:hover { text-decoration-color: var(--pilot-accent); }
.pilot-md-inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
  padding: 1px 5px;
  background: var(--pilot-tool-bg);
  border: 1px solid var(--pilot-tool-border);
  border-radius: 4px;
}
.pilot-md-pre {
  position: relative;
  margin: 4px 0;
  padding: 10px 12px;
  background: var(--pilot-bg-elevated);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-radius-sm);
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pilot-fg);
}
.pilot-md-pre code { background: none; border: none; padding: 0; font-size: inherit; }
.pilot-md-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  font: 500 11px/1.4 var(--pilot-font);
  color: var(--pilot-fg-muted);
  background: var(--pilot-bg);
  border: 1px solid var(--pilot-border-strong);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}
.pilot-md-pre:hover .pilot-md-copy,
.pilot-md-copy:focus-visible {
  opacity: 1;
}
.pilot-md-copy:hover {
  color: var(--pilot-fg);
  border-color: var(--pilot-accent);
}
.pilot-md-hr {
  margin: 8px 0;
  border: none;
  border-top: 1px solid var(--pilot-border);
}

.pilot-reasoning {
  margin: 0;
  padding: 8px 10px;
  background: var(--pilot-tool-bg);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-radius-sm);
  font-size: 12.5px;
  color: var(--pilot-fg-muted);
}
.pilot-reasoning summary {
  cursor: pointer;
  font-weight: 500;
  user-select: none;
  list-style: none;
}
.pilot-reasoning summary::-webkit-details-marker { display: none; }
.pilot-reasoning[open] summary { margin-bottom: 6px; }
.pilot-reasoning-body { white-space: pre-wrap; }

.pilot-tool {
  margin: 0;
  padding: 6px 10px;
  background: var(--pilot-tool-bg);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-radius-sm);
  font-size: 12.5px;
  color: var(--pilot-fg-muted);
}
.pilot-tool summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.pilot-tool summary::-webkit-details-marker { display: none; }
.pilot-tool[open] summary { margin-bottom: 6px; }

/* Disclosure chevron: small CSS-only triangle on the summary. Rotates 90°
 * when the <details> is open. Hidden when the tool call has no body to
 * expand (data-has-body="no") so we don't promise an interaction that
 * won't happen. */
.pilot-tool-chevron {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  position: relative;
  display: inline-block;
  transition: transform 160ms ease;
}
.pilot-tool-chevron::before {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--pilot-fg-muted);
  border-bottom: 1.5px solid var(--pilot-fg-muted);
  transform: rotate(-45deg);
}
.pilot-tool[open] .pilot-tool-chevron {
  transform: rotate(90deg);
}
.pilot-tool[data-has-body="no"] .pilot-tool-chevron {
  visibility: hidden;
}
.pilot-tool[data-has-body="no"] summary { cursor: default; }

/* Smooth fade-in for the body when expanded. Pure CSS keyframe; reduced
 * motion settings collapse to no animation. */
@keyframes pilot-tool-body-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
.pilot-tool[open] .pilot-tool-body {
  animation: pilot-tool-body-in 160ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .pilot-tool[open] .pilot-tool-body { animation: none; }
  .pilot-tool-chevron { transition: none; }
}
.pilot-tool-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--pilot-fg);
  font-weight: 500;
}
.pilot-tool-status {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--pilot-tool-border);
  color: var(--pilot-fg-muted);
  line-height: 1.5;
}
.pilot-tool-status[data-state="running"] { color: var(--pilot-accent); }
.pilot-tool-status[data-state="error"] {
  color: var(--pilot-error-fg);
  background: var(--pilot-error-bg);
}
.pilot-tool-body {
  display: grid;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
}
.pilot-tool-section-label {
  font-family: var(--pilot-font);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pilot-fg-subtle);
}
.pilot-tool-code {
  margin: 0;
  padding: 6px 8px;
  background: var(--pilot-bg-elevated);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-radius-sm);
  color: var(--pilot-fg);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  max-height: 200px;
}

/* ---- Tool header: humanized name + small mono raw name --------------- */
.pilot-tool-raw-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--pilot-tool-border);
  color: var(--pilot-fg-subtle);
  letter-spacing: 0.02em;
}

/* ---- Section block + Pretty/Raw toggle ------------------------------- */
.pilot-tool-section {
  display: grid;
  gap: 4px;
}
.pilot-tool-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pilot-tool-raw-toggle {
  appearance: none;
  border: 1px solid var(--pilot-tool-border);
  background: transparent;
  color: var(--pilot-fg-subtle);
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 1px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.pilot-tool-raw-toggle:hover {
  color: var(--pilot-fg);
  background: var(--pilot-tool-bg);
  border-color: var(--pilot-fg-muted);
}
.pilot-tool-raw-toggle[aria-pressed="true"] {
  background: var(--pilot-accent);
  color: var(--pilot-accent-fg);
  border-color: var(--pilot-accent);
}

.pilot-tool-error {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--pilot-error-fg, #dc2626);
  border-radius: var(--pilot-radius-sm);
  background: var(--pilot-error-bg, rgba(220, 38, 38, 0.08));
  color: var(--pilot-error-fg, #dc2626);
  font-family: var(--pilot-font);
  font-size: 12.5px;
  line-height: 1.4;
}

/* ---- Pretty value renderer (objects, arrays, primitives) ------------- */
.pilot-tool-pretty {
  padding: 8px 10px;
  background: var(--pilot-bg-elevated);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-radius-sm);
  font-family: var(--pilot-font);
  font-size: 12.5px;
  line-height: 1.5;
  max-height: 280px;
  overflow: auto;
}

/* Key/value list: 2-column grid, label right-aligned + muted. */
.pv-kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 14px;
  row-gap: 4px;
  margin: 0;
}
.pv-kv dt {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pilot-fg-subtle);
  text-align: right;
  align-self: baseline;
  white-space: nowrap;
}
.pv-kv dd {
  margin: 0;
  color: var(--pilot-fg);
  word-break: break-word;
  min-width: 0;
}
/* Nested kv lists get a subtle left border + indent so the parent reads. */
.pv-kv .pv-kv {
  grid-column: 1 / -1;
  padding-left: 12px;
  border-left: 2px solid var(--pilot-tool-border);
  margin-top: 2px;
}

/* Bare-value styles. */
.pv-string {
  color: var(--pilot-fg);
}
.pv-number {
  color: var(--pilot-fg);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.pv-date {
  color: var(--pilot-fg);
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  padding: 0 4px;
  background: var(--pilot-tool-bg);
  border-radius: 4px;
}
.pv-bool {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
.pv-bool[data-value="true"] {
  background: rgba(34, 197, 94, 0.12);
  color: rgb(21, 128, 61);
}
.pv-bool[data-value="false"] {
  background: rgba(239, 68, 68, 0.12);
  color: rgb(185, 28, 28);
}
.pv-empty {
  color: var(--pilot-fg-subtle);
  font-style: italic;
}
.pv-array .pv-sep {
  color: var(--pilot-fg-subtle);
}
.pv-list {
  margin: 0;
  padding-left: 16px;
  list-style: disc;
  color: var(--pilot-fg);
}
.pv-list li { margin: 2px 0; }

/* Tables for arrays of uniform-shape objects. */
.pv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pv-table thead th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pilot-fg-subtle);
  font-weight: 500;
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--pilot-tool-border);
}
.pv-table tbody td {
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--pilot-tool-border);
  color: var(--pilot-fg);
  vertical-align: top;
}
.pv-table tbody tr:last-child td { border-bottom: none; }
/* Numeric and date cells get tabular-nums for clean column alignment. */
.pv-table td:has(.pv-number),
.pv-table td:has(.pv-date) {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .pilot-tool-raw-toggle { transition: none; }
}

/*
 * Typing indicator, a slow opacity breathe instead of the old bounce.
 * 1.5s loop, staggered by 150ms per dot, opacity-only so the baseline never
 * shifts. Lives inside the sidebar only; page-level work is surfaced through
 * ring pulses and tool-call chips, never through this indicator.
 */
.pilot-streaming-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
  padding: 0 2px;
}
.pilot-streaming-dots span {
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 999px;
  background: var(--pilot-fg-muted);
  opacity: 0.35;
  animation: pilot-breathe 1.5s infinite ease-in-out;
}
.pilot-streaming-dots span:nth-child(2) { animation-delay: 0.15s; }
.pilot-streaming-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes pilot-breathe {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.9; }
}

.pilot-error {
  margin: 0 16px 8px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--pilot-error-bg);
  color: var(--pilot-error-fg);
  border: 1px solid var(--pilot-error-border);
  border-radius: var(--pilot-radius-sm);
  font-size: 13px;
  animation: pilot-fade-in 160ms ease;
}
.pilot-error-message { flex: 1 1 auto; overflow-wrap: anywhere; }
.pilot-error-dismiss {
  all: unset;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  padding: 2px 4px;
  font-size: 14px;
  line-height: 1;
  border-radius: 4px;
}
.pilot-error-dismiss:hover { opacity: 1; }
.pilot-error-dismiss:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.pilot-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 8px;
}
.pilot-suggestion {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font: 500 12.5px/1.3 var(--pilot-font);
  color: var(--pilot-fg);
  background: var(--pilot-bg-elevated);
  border: 1px solid var(--pilot-border-strong);
  border-radius: 999px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  text-align: left;
}
.pilot-suggestion:hover {
  background: var(--pilot-tool-bg);
  border-color: var(--pilot-accent);
}
.pilot-suggestion:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 1px;
}
.pilot-suggestion:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pilot-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 14px 14px;
  flex: 0 0 auto;
  background: var(--pilot-bg);
}
/* Composer row: symmetric pill. Both ends fully rounded so the row floats
 * with breathing room on both sides; the 32px circular send button sits
 * inside the right curve. No border. */
.pilot-composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  background: var(--pilot-bg-elevated);
  border: 0;
  border-radius: 999px;
  transition: background 140ms ease;
}
.pilot-composer-row:focus-within {
  background: color-mix(in srgb, var(--pilot-bg-elevated) 88%, var(--pilot-accent) 12%);
}
.pilot-composer textarea {
  flex: 1 1 auto;
  min-height: 22px;
  max-height: 160px;
  padding: 6px 0;
  margin: 0;
  border: none;
  outline: none;
  box-shadow: none;
  resize: none;
  background: transparent;
  color: var(--pilot-fg);
  font: inherit;
  line-height: 1.45;
  overflow-y: auto;
}
.pilot-composer textarea::placeholder { color: var(--pilot-fg-subtle); }

.pilot-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--pilot-accent-fg);
  background: var(--pilot-accent);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  flex: 0 0 auto;
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease;
}
.pilot-send:hover:not(:disabled) { transform: translateY(-1px); }
.pilot-send:disabled { opacity: 0.4; cursor: not-allowed; }
.pilot-send:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 2px;
}
.pilot-send[data-variant="stop"] {
  background: var(--pilot-error-fg);
}

@keyframes pilot-fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

/*
 * Per-part enter. Runs once when a part first mounts; the stagger delay is
 * set inline by the renderer so each part slides in just after the one before
 * it. The transform is small (3px) on purpose, this is a "catch the eye"
 * hint, not a reveal animation.
 */
.pilot-part-enter {
  animation: pilot-part-in 200ms ease-out both;
}
@keyframes pilot-part-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

/*
 * Tool-call expansion: when the user opens the <details>, the body fades in.
 * Height is driven by CSS; we keep the motion to opacity so browsers that
 * refuse to animate auto-height (all of them, correctly) still feel smooth.
 */
.pilot-tool[open] .pilot-tool-body,
.pilot-reasoning[open] .pilot-reasoning-body {
  animation: pilot-details-in 180ms ease-out both;
}
@keyframes pilot-details-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

/*
 * Suggestion chips: staggered entrance on first render. The delay is set
 * inline by the parent so adding/removing chips doesn't re-run the animation
 * on existing chips.
 */
.pilot-suggestion {
  animation: pilot-part-in 220ms ease-out both;
}

/* ---------------------------------------------------------------------------
 * Skills panel, a dense, Raycast-style capability list. Closed by default,
 * opens inline between the message area and composer.
 * ------------------------------------------------------------------------- */
.pilot-skills {
  border-top: 1px solid var(--pilot-border);
  background: var(--pilot-bg);
  flex: 0 0 auto;
}
.pilot-skills-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: var(--pilot-fg-muted);
  font: 500 12px/1.4 var(--pilot-font);
  cursor: pointer;
  text-align: left;
  transition: color 120ms ease, background 120ms ease;
}
.pilot-skills-trigger:hover { color: var(--pilot-fg); background: var(--pilot-tool-bg); }
.pilot-skills-trigger:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: -2px;
}
.pilot-skills-caret {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--pilot-fg-subtle);
  font-size: 14px;
  line-height: 1;
}
.pilot-skills-list {
  list-style: none;
  margin: 0;
  padding: 0 0 6px;
  max-height: 220px;
  overflow-y: auto;
  animation: pilot-details-in 180ms ease-out both;
}
.pilot-skills-list li + li { border-top: 1px solid var(--pilot-border); }
.pilot-skills-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto;
  grid-auto-flow: row;
  gap: 2px 12px;
  width: 100%;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 100ms ease;
}
.pilot-skills-row:hover { background: var(--pilot-tool-bg); }
.pilot-skills-row:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: -2px;
}
.pilot-skills-name {
  grid-column: 1 / -1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--pilot-fg);
}
.pilot-skills-desc {
  grid-column: 1 / -1;
  font-size: 11.5px;
  color: var(--pilot-fg-muted);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------------------------------------------------------------------
 * Chat view shell, used by sidebar, popup, and modal alike. The chrome
 * around it differs per form factor; the body layout below is shared.
 * ------------------------------------------------------------------------- */
.pilot-chat-view {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow children with overflow to shrink in flex layout */
}

/* ---------------------------------------------------------------------------
 * Popup form factor, floating button anchored to a corner that toggles a
 * card-shaped chat panel. Different chrome than the sidebar (no slide-in,
 * no full-height) but the same body via PilotChatView.
 * ------------------------------------------------------------------------- */
.pilot-popup-button {
  position: fixed;
  bottom: 20px;
  z-index: 2147483600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  color: var(--pilot-accent-fg);
  background: var(--pilot-accent);
  border: 1px solid var(--pilot-accent);
  border-radius: 999px;
  box-shadow: var(--pilot-shadow);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.pilot-popup-button:hover { transform: translateY(-1px); }
.pilot-popup-button:active { transform: translateY(0); }
.pilot-popup-button:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 2px;
}
.pilot-popup-button[data-position="bottom-right"] { right: 20px; }
.pilot-popup-button[data-position="bottom-left"] { left: 20px; }
.pilot-popup-button[data-position="top-right"] { top: 20px; bottom: auto; right: 20px; }
.pilot-popup-button[data-position="top-left"] { top: 20px; bottom: auto; left: 20px; }

.pilot-popup-card {
  position: fixed;
  z-index: 2147483600;
  width: var(--pilot-popup-width, 380px);
  height: var(--pilot-popup-height, 560px);
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--pilot-bg);
  color: var(--pilot-fg);
  font: 400 14px/1.5 var(--pilot-font);
  border: 1px solid var(--pilot-border);
  border-radius: var(--pilot-radius);
  box-shadow: var(--pilot-shadow);
  overflow: hidden;
  animation: pilot-fade-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.pilot-popup-card[data-position="bottom-right"] { bottom: 84px; right: 20px; }
.pilot-popup-card[data-position="bottom-left"] { bottom: 84px; left: 20px; }
.pilot-popup-card[data-position="top-right"] { top: 84px; right: 20px; }
.pilot-popup-card[data-position="top-left"] { top: 84px; left: 20px; }

/* ---------------------------------------------------------------------------
 * Modal form factor: centered backdrop dialog. Controlled by open and
 * onOpenChange; portals to body; backdrop click and Escape close.
 * ------------------------------------------------------------------------- */
.pilot-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: pilot-fade-in 160ms ease-out;
}
.pilot-modal-card {
  width: var(--pilot-modal-width, 720px);
  height: var(--pilot-modal-height, 80vh);
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--pilot-bg);
  color: var(--pilot-fg);
  font: 400 14px/1.5 var(--pilot-font);
  border: 1px solid var(--pilot-border);
  border-radius: var(--pilot-radius);
  box-shadow: var(--pilot-shadow);
  overflow: hidden;
  animation: pilot-modal-rise 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes pilot-modal-rise {
  from { transform: translateY(8px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .pilot-sidebar,
  .pilot-popup-card,
  .pilot-modal-backdrop,
  .pilot-modal-card,
  .pilot-message,
  .pilot-empty,
  .pilot-error,
  .pilot-part-enter,
  .pilot-suggestion,
  .pilot-skills-list,
  .pilot-tool[open] .pilot-tool-body,
  .pilot-reasoning[open] .pilot-reasoning-body { animation: none; }
  .pilot-streaming-dots span { animation: none; opacity: 0.6; }
}
`;

/**
 * Inject the stylesheet once per document. Safe to call on every mount ,
 * subsequent calls find the existing `<style>` and return without touching
 * the DOM.
 *
 * Returns silently in non-browser environments (SSR, Node test runners
 * without a DOM) so the component can still import cleanly.
 */
export function injectSidebarStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  el.textContent = PILOT_SIDEBAR_CSS;
  // Prepend so consumer-authored overrides in their own stylesheet still win
  // in the cascade (later rules with equal specificity beat earlier ones).
  document.head.insertBefore(el, document.head.firstChild);
}
