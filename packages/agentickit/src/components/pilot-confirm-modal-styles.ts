/**
 * Styles for `<PilotConfirmModal>` shipped as a single CSS string and injected
 * into `<head>` on first open — mirroring the sidebar's pattern so consumers
 * don't need a CSS side-effect import.
 *
 * Theming inherits from the sidebar's CSS variables (`--pilot-bg`, etc.). When
 * the modal renders without the sidebar (rare — the modal only shows up when
 * the agent acts, which usually means the sidebar is open too), the fallback
 * values match the sidebar's light-mode defaults.
 */

const STYLE_ELEMENT_ID = "pilot-confirm-modal-styles";

export const PILOT_CONFIRM_MODAL_CSS = `
.pilot-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483640;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 10, 12, 0.44);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  animation: pilot-confirm-fade 180ms ease-out;
}

.pilot-confirm-card {
  width: min(420px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 20px 16px;
  background: var(--pilot-bg, #ffffff);
  color: var(--pilot-fg, #0a0a0a);
  border: 1px solid var(--pilot-border-strong, rgba(0, 0, 0, 0.14));
  border-radius: calc(var(--pilot-radius, 10px) + 2px);
  box-shadow:
    0 18px 48px rgba(10, 10, 12, 0.18),
    0 2px 8px rgba(10, 10, 12, 0.06),
    0 0 0 1px rgba(10, 10, 12, 0.02);
  font: 400 14px/1.5 var(--pilot-font, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif);
  animation: pilot-confirm-enter 180ms cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

.pilot-confirm-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pilot-confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--pilot-fg, #0a0a0a);
}
.pilot-confirm-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pilot-fg-muted, #6b7280);
}

.pilot-confirm-args {
  margin: 0;
  padding: 0;
  border: 1px solid var(--pilot-border, rgba(0, 0, 0, 0.08));
  border-radius: var(--pilot-radius-sm, 6px);
  background: var(--pilot-tool-bg, rgba(0, 0, 0, 0.03));
  overflow: hidden;
}
.pilot-confirm-args-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--pilot-fg-muted, #6b7280);
  list-style: none;
}
.pilot-confirm-args-summary::-webkit-details-marker { display: none; }
.pilot-confirm-args-summary:hover { color: var(--pilot-fg, #0a0a0a); }
.pilot-confirm-args-summary:focus-visible {
  outline: 2px solid var(--pilot-accent, #0a0a0a);
  outline-offset: -2px;
}
.pilot-confirm-args-hint {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pilot-fg-subtle, #9ca3af);
}
.pilot-confirm-args[open] .pilot-confirm-args-summary {
  border-bottom: 1px solid var(--pilot-border, rgba(0, 0, 0, 0.08));
}
.pilot-confirm-args-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 200px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: var(--pilot-fg, #0a0a0a);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--pilot-bg-elevated, #ffffff);
}
.pilot-confirm-args-pre code {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
}
.pilot-confirm-args[open] .pilot-confirm-args-pre {
  animation: pilot-confirm-details-in 160ms ease-out both;
}

.pilot-confirm-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.pilot-confirm-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  font: 500 13px/1 var(--pilot-font, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif);
  border-radius: var(--pilot-radius-sm, 6px);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
  border: 1px solid transparent;
}
.pilot-confirm-btn:focus-visible {
  outline: 2px solid var(--pilot-accent, #0a0a0a);
  outline-offset: 2px;
}
.pilot-confirm-btn-primary {
  color: var(--pilot-accent-fg, #ffffff);
  background: var(--pilot-accent, #0a0a0a);
  border-color: var(--pilot-accent, #0a0a0a);
}
.pilot-confirm-btn-primary:hover { transform: translateY(-1px); }
.pilot-confirm-btn-primary:active { transform: translateY(0); }
.pilot-confirm-btn-secondary {
  color: var(--pilot-fg, #0a0a0a);
  background: var(--pilot-bg-elevated, #ffffff);
  border-color: var(--pilot-border-strong, rgba(0, 0, 0, 0.14));
}
.pilot-confirm-btn-secondary:hover {
  background: var(--pilot-tool-bg, rgba(0, 0, 0, 0.03));
  border-color: var(--pilot-accent, #0a0a0a);
}

@keyframes pilot-confirm-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pilot-confirm-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pilot-confirm-details-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .pilot-confirm-backdrop,
  .pilot-confirm-card,
  .pilot-confirm-args[open] .pilot-confirm-args-pre { animation: none; }
  .pilot-confirm-btn-primary:hover { transform: none; }
}
`;

/**
 * Inject the modal stylesheet once per document. Safe to call on every open —
 * subsequent calls find the existing `<style>` and return without touching
 * the DOM.
 */
export function injectModalStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  el.textContent = PILOT_CONFIRM_MODAL_CSS;
  document.head.insertBefore(el, document.head.firstChild);
}
