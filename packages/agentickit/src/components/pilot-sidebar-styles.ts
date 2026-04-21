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
 * Theming is CSS-variable-driven — consumers override by setting the variables
 * on a parent scope (e.g., `:root` or `body`, or a wrapping div).
 *
 * We inject exactly once per document. StrictMode and multiple PilotSidebar
 * instances all share the same `<style>` tag, so there's no risk of duplicate
 * rules piling up.
 */

const STYLE_ELEMENT_ID = "pilot-sidebar-styles";

/** The full stylesheet, written inline so we can ship a zero-config sidebar. */
export const PILOT_SIDEBAR_CSS = `
:root {
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
  :root {
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

.pilot-part-text { white-space: pre-wrap; }

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

.pilot-streaming-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 14px;
  padding: 0 2px;
}
.pilot-streaming-dots span {
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 999px;
  background: var(--pilot-fg-muted);
  opacity: 0.5;
  animation: pilot-dot 1.1s infinite ease-in-out;
}
.pilot-streaming-dots span:nth-child(2) { animation-delay: 0.18s; }
.pilot-streaming-dots span:nth-child(3) { animation-delay: 0.36s; }
@keyframes pilot-dot {
  0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
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
  padding: 12px 16px 14px;
  border-top: 1px solid var(--pilot-border);
  flex: 0 0 auto;
  background: var(--pilot-bg);
}
.pilot-composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: var(--pilot-bg-elevated);
  border: 1px solid var(--pilot-border-strong);
  border-radius: var(--pilot-radius);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.pilot-composer-row:focus-within {
  border-color: var(--pilot-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pilot-accent) 12%, transparent);
}
.pilot-composer textarea {
  flex: 1 1 auto;
  min-height: 22px;
  max-height: 160px;
  padding: 2px 0;
  margin: 0;
  border: none;
  outline: none;
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
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--pilot-accent-fg);
  background: var(--pilot-accent);
  border: 1px solid var(--pilot-accent);
  border-radius: 999px;
  cursor: pointer;
  flex: 0 0 auto;
  transition: opacity 120ms ease, transform 120ms ease;
}
.pilot-send:hover:not(:disabled) { transform: translateY(-1px); }
.pilot-send:disabled { opacity: 0.4; cursor: not-allowed; }
.pilot-send:focus-visible {
  outline: 2px solid var(--pilot-accent);
  outline-offset: 2px;
}
.pilot-send[data-variant="stop"] {
  background: var(--pilot-error-fg);
  border-color: var(--pilot-error-fg);
}

@keyframes pilot-fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .pilot-sidebar,
  .pilot-message,
  .pilot-empty,
  .pilot-error { animation: none; }
}
`;

/**
 * Inject the stylesheet once per document. Safe to call on every mount —
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
