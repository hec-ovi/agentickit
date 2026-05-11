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
/* ---- Theming surface ----------------------------------------------------
 * Every visual value the consumer might plausibly want to override is exposed
 * as a CSS custom property. Defaults are declared on :where(:root) so they
 * have specificity 0,0,0,0 and any rule the consumer writes on :root (or any
 * higher) wins without specificity gymnastics. Group-by-group rundown:
 *
 *   Core palette
 *     --pilot-bg                 surface background for the chat shell
 *     --pilot-bg-elevated        nested surfaces (code blocks, pretty value cards)
 *     --pilot-fg                 primary foreground text color
 *     --pilot-fg-muted           secondary text (timestamps, labels, status)
 *     --pilot-fg-subtle          tertiary text (placeholders, muted dashes)
 *     --pilot-border             default 1px hairline color
 *     --pilot-border-strong      stronger hairline (scrollbars, dividers)
 *     --pilot-accent             brand accent (send button, primary actions)
 *     --pilot-accent-fg          foreground that sits on top of accent
 *
 *   Bubble + assistant body
 *     --pilot-user-bubble-bg     user message bubble background
 *     --pilot-user-bubble-fg     user message bubble text color
 *     --pilot-assistant-fg       assistant text color
 *
 *   Error states
 *     --pilot-error-bg           error chip background
 *     --pilot-error-fg           error chip foreground
 *     --pilot-error-border       error chip border
 *
 *   Radius + shadow + typography
 *     --pilot-radius             default outer card radius
 *     --pilot-radius-sm          smaller chip radius
 *     --pilot-shadow             elevation shadow (toggle button, sidebar)
 *     --pilot-font               base font stack
 *
 *   Tool card chrome (header + body), all derived from the core palette so
 *   overriding --pilot-accent alone cascades through the running pill color.
 *     --pilot-tool-bg            tool card background
 *     --pilot-tool-border        tool card border color
 *     --pilot-tool-padding       outer card padding (default 8px 12px)
 *     --pilot-tool-gap           gap between summary row 1 and row 2
 *     --pilot-tool-radius        tool card border radius (inherits radius-sm)
 *     --pilot-tool-name-size     humanized title font-size
 *     --pilot-tool-name-color    humanized title color (defaults to --pilot-fg)
 *     --pilot-tool-name-weight   humanized title font-weight
 *     --pilot-tool-line-height   line height for the title row
 *
 *   Disclosure chevron
 *     --pilot-tool-chevron-size  chevron bounding box size (default 12px)
 *     --pilot-tool-chevron-stroke chevron stroke width (default 1.5px)
 *     --pilot-tool-chevron-color chevron color (defaults to --pilot-fg-muted)
 *
 *   Raw-name chip (small mono pill that shows the underlying tool id)
 *     --pilot-tool-raw-bg        raw-name pill background
 *     --pilot-tool-raw-fg        raw-name pill foreground
 *     --pilot-tool-raw-size      raw-name pill font-size
 *     --pilot-tool-raw-radius    raw-name pill border radius
 *     --pilot-tool-raw-padding   raw-name pill padding
 *
 *   Status pill (done / running / error)
 *     --pilot-tool-status-size      status pill font-size
 *     --pilot-tool-status-padding   status pill padding
 *     --pilot-tool-status-radius    status pill border radius
 *     --pilot-tool-status-bg        idle background (defaults to --pilot-tool-border)
 *     --pilot-tool-status-fg        idle foreground (defaults to --pilot-fg-muted)
 *     --pilot-tool-status-running-fg  running foreground (defaults to --pilot-accent)
 *     --pilot-tool-status-error-bg    error background (defaults to --pilot-error-bg)
 *     --pilot-tool-status-error-fg    error foreground (defaults to --pilot-error-fg)
 *
 *   Pretty value renderer
 *     --pilot-pretty-row-gap        gap between kv rows
 *     --pilot-pretty-label-color    kv label color
 *     --pilot-pretty-label-size     kv label font-size
 *     --pilot-pretty-label-transform   kv label text-transform (default uppercase)
 *     --pilot-pretty-label-tracking    kv label letter-spacing
 *     --pilot-pretty-table-border      table cell border color
 *
 *   Raw/Pretty toggle button
 *     --pilot-toggle-bg              default background
 *     --pilot-toggle-fg              default foreground
 *     --pilot-toggle-border          default border color
 *     --pilot-toggle-active-bg       active (pressed) background
 *     --pilot-toggle-active-fg       active (pressed) foreground
 * ------------------------------------------------------------------------- */
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

  /* Tool card chrome. Every value here is meant to be overridable by host
   * apps; defaults match the visual that was already shipping minus the
   * cramped header layout. */
  --pilot-tool-padding: 8px 12px;
  --pilot-tool-gap: 4px;
  --pilot-tool-radius: var(--pilot-radius-sm);
  --pilot-tool-name-size: 13px;
  --pilot-tool-name-color: var(--pilot-fg);
  --pilot-tool-name-weight: 500;
  --pilot-tool-line-height: 1.35;

  --pilot-tool-chevron-size: 12px;
  --pilot-tool-chevron-stroke: 1.5px;
  --pilot-tool-chevron-color: var(--pilot-fg-muted);

  --pilot-tool-raw-bg: transparent;
  --pilot-tool-raw-fg: var(--pilot-fg-subtle);
  --pilot-tool-raw-size: 11px;
  --pilot-tool-raw-radius: 4px;
  --pilot-tool-raw-padding: 0;

  --pilot-tool-status-size: 11px;
  --pilot-tool-status-padding: 1px 8px;
  --pilot-tool-status-radius: 999px;
  --pilot-tool-status-bg: var(--pilot-tool-border);
  --pilot-tool-status-fg: var(--pilot-fg-muted);
  --pilot-tool-status-running-fg: var(--pilot-accent);
  --pilot-tool-status-error-bg: var(--pilot-error-bg);
  --pilot-tool-status-error-fg: var(--pilot-error-fg);

  --pilot-pretty-row-gap: 4px;
  --pilot-pretty-label-color: var(--pilot-fg-subtle);
  --pilot-pretty-label-size: 11px;
  --pilot-pretty-label-transform: uppercase;
  --pilot-pretty-label-tracking: 0.04em;
  --pilot-pretty-table-border: var(--pilot-tool-border);

  --pilot-toggle-bg: transparent;
  --pilot-toggle-fg: var(--pilot-fg-subtle);
  --pilot-toggle-border: var(--pilot-tool-border);
  --pilot-toggle-active-bg: var(--pilot-accent);
  --pilot-toggle-active-fg: var(--pilot-accent-fg);
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
  padding: var(--pilot-tool-padding);
  background: var(--pilot-tool-bg);
  border: 1px solid var(--pilot-tool-border);
  border-radius: var(--pilot-tool-radius);
  font-size: 12.5px;
  line-height: var(--pilot-tool-line-height);
  color: var(--pilot-fg-muted);
  container-type: inline-size;
}

/*
 * Summary layout. CSS grid with a fixed first column for the chevron and a
 * flexible second column for everything else. Row 1 spans:
 *   [chevron] [humanized name . . . . . . . . .] [status pill]
 * Row 2 (the raw mono name) sits under the humanized name only — column 1
 * stays empty so the raw name visually hangs under the title, not under the
 * chevron. The humanized title wraps freely at word boundaries because it
 * lives in its own grid cell instead of competing with everything else on a
 * single flex row. On very narrow widths (< 280px) the status pill drops to
 * its own line so the title doesn't get squeezed.
 */
.pilot-tool-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  row-gap: var(--pilot-tool-gap);
  align-items: center;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.pilot-tool-summary::-webkit-details-marker { display: none; }
.pilot-tool[open] .pilot-tool-summary { margin-bottom: 6px; }

@container (max-width: 280px) {
  .pilot-tool-summary { grid-template-columns: auto minmax(0, 1fr); }
  .pilot-tool-summary .pilot-tool-status { grid-column: 2 / -1; justify-self: start; }
}

/* Disclosure chevron: small CSS-only triangle. Rotates 90° when the
 * <details> is open. Hidden when the tool call has no body to expand
 * (data-has-body="no") so we don't promise an interaction that won't
 * happen. Size + color are themeable. */
.pilot-tool-chevron {
  width: var(--pilot-tool-chevron-size);
  height: var(--pilot-tool-chevron-size);
  flex: 0 0 var(--pilot-tool-chevron-size);
  position: relative;
  display: inline-block;
  grid-row: 1;
  grid-column: 1;
  transition: transform 160ms ease;
}
.pilot-tool-chevron::before {
  content: "";
  position: absolute;
  top: calc(var(--pilot-tool-chevron-size) * 0.18);
  left: calc(var(--pilot-tool-chevron-size) * 0.22);
  width: calc(var(--pilot-tool-chevron-size) * 0.55);
  height: calc(var(--pilot-tool-chevron-size) * 0.55);
  border-right: var(--pilot-tool-chevron-stroke) solid var(--pilot-tool-chevron-color);
  border-bottom: var(--pilot-tool-chevron-stroke) solid var(--pilot-tool-chevron-color);
  transform: rotate(-45deg);
}
.pilot-tool[open] .pilot-tool-chevron {
  transform: rotate(90deg);
}
.pilot-tool[data-has-body="no"] .pilot-tool-chevron {
  visibility: hidden;
}
.pilot-tool[data-has-body="no"] .pilot-tool-summary { cursor: default; }

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

/* Humanized title. Visual primary — sans-serif, larger font, prominent
 * weight. Wraps naturally at word boundaries because it owns a full
 * grid cell instead of competing with the pill on a flex row. */
.pilot-tool-name {
  grid-row: 1;
  grid-column: 2;
  font-family: var(--pilot-font);
  font-size: var(--pilot-tool-name-size);
  color: var(--pilot-tool-name-color);
  font-weight: var(--pilot-tool-name-weight);
  line-height: var(--pilot-tool-line-height);
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* Status pill. Right-aligned on row 1. Never pushes the title to wrap
 * because the title cell owns the flexible track. */
.pilot-tool-status {
  grid-row: 1;
  grid-column: 3;
  display: inline-block;
  font-size: var(--pilot-tool-status-size);
  padding: var(--pilot-tool-status-padding);
  border-radius: var(--pilot-tool-status-radius);
  background: var(--pilot-tool-status-bg);
  color: var(--pilot-tool-status-fg);
  line-height: 1.5;
  justify-self: end;
  align-self: start;
  white-space: nowrap;
}
.pilot-tool-status[data-state="running"] { color: var(--pilot-tool-status-running-fg); }
.pilot-tool-status[data-state="error"] {
  color: var(--pilot-tool-status-error-fg);
  background: var(--pilot-tool-status-error-bg);
}

/* Raw-name chip. Lives on row 2, under the humanized title. De-emphasized
 * (muted color, transparent background) so it informs without dominating. */
.pilot-tool-raw-name {
  grid-row: 2;
  grid-column: 2 / -1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--pilot-tool-raw-size);
  padding: var(--pilot-tool-raw-padding);
  border-radius: var(--pilot-tool-raw-radius);
  background: var(--pilot-tool-raw-bg);
  color: var(--pilot-tool-raw-fg);
  letter-spacing: 0.02em;
  justify-self: start;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.pilot-tool-body {
  display: grid;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
}
.pilot-tool-section-label {
  font-family: var(--pilot-font);
  font-size: var(--pilot-pretty-label-size);
  text-transform: var(--pilot-pretty-label-transform);
  letter-spacing: var(--pilot-pretty-label-tracking);
  color: var(--pilot-pretty-label-color);
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
  border: 1px solid var(--pilot-toggle-border);
  background: var(--pilot-toggle-bg);
  color: var(--pilot-toggle-fg);
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
  background: var(--pilot-toggle-active-bg);
  color: var(--pilot-toggle-active-fg);
  border-color: var(--pilot-toggle-active-bg);
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
  row-gap: var(--pilot-pretty-row-gap);
  margin: 0;
}
.pv-kv dt {
  margin: 0;
  font-size: var(--pilot-pretty-label-size);
  text-transform: var(--pilot-pretty-label-transform);
  letter-spacing: var(--pilot-pretty-label-tracking);
  color: var(--pilot-pretty-label-color);
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
  border-left: 2px solid var(--pilot-pretty-table-border);
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
  font-size: var(--pilot-pretty-label-size);
  text-transform: var(--pilot-pretty-label-transform);
  letter-spacing: var(--pilot-pretty-label-tracking);
  color: var(--pilot-pretty-label-color);
  font-weight: 500;
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--pilot-pretty-table-border);
}
.pv-table tbody td {
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--pilot-pretty-table-border);
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
