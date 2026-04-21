"use client";

/**
 * `<PilotConfirmModal>` — themed replacement for `window.confirm`.
 *
 * Rendered by `<Pilot>` whenever the model calls an action flagged with
 * `mutating: true`. Blocks the `onToolCall` handler via a suspended promise
 * until the user either approves (running the handler) or declines
 * (reporting a `{ ok: false, reason: "User declined." }` result so the
 * loop continues rather than hangs).
 *
 * Design rationale:
 *
 *   - A portal-mounted card sits above the page content with a 60% black
 *     overlay. Click-outside, Escape, and the Cancel button all count as
 *     decline; Enter or the Confirm button approve. This is the Linear/Arc
 *     modal family — small, keyboard-first, zero chrome beyond what's
 *     required to name the action.
 *
 *   - Arguments render in a collapsed `<details>` block by default. Most
 *     mutating calls ship a handful of keys and the user doesn't need a
 *     JSON dump front-and-center; the `{}` tool calls (submit_*, reset_*)
 *     in particular show nothing worth spotlighting. Opening the block
 *     reveals a monospace code snippet with the pretty-printed payload.
 *
 *   - Animations are 180ms ease-out fades + a 4px translate up. Matches the
 *     sidebar's pilot-fade-in rhythm. `prefers-reduced-motion` collapses
 *     both to zero.
 *
 *   - Focus-traps between Confirm (initial focus) and Cancel so keyboard
 *     users never fall back out to the underlying document during the
 *     approval flow. On close, focus is restored to whatever element was
 *     active before the modal opened.
 *
 *   - Consumers can override the whole chrome via
 *     `<Pilot renderConfirm={...} />`. The override receives `approve` and
 *     `cancel` callbacks plus the action metadata; we don't give them a
 *     thrown error or a ref wrapper — just the four args.
 */

import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { injectModalStyles } from "./pilot-confirm-modal-styles.js";

/**
 * Public shape of the `renderConfirm` override. A consumer can render anything
 * — we only guarantee the four pieces of info plus the approve/cancel
 * callbacks. Returning `null` is valid (the modal becomes invisible) but
 * ill-advised: the promise inside the provider stays suspended until one of
 * the callbacks fires.
 */
export interface PilotConfirmRenderArgs {
  /** The action name (also the tool name). Used as the modal title. */
  name: string;
  /** The action's `description` text. Used as the subtitle. */
  description: string;
  /** The parsed tool-call input (raw JSON, not yet Zod-parsed). */
  input: unknown;
  /** Call to approve — runs the handler. */
  approve: () => void;
  /** Call to decline — loop continues with a "user declined" result. */
  cancel: () => void;
}

/**
 * Render-prop signature exposed by `<Pilot renderConfirm=...>`.
 */
export type PilotConfirmRender = (args: PilotConfirmRenderArgs) => ReactNode;

/**
 * Internal props for the default modal. `open` is the external mount-switch;
 * we render `null` when false so the portal doesn't stay in the DOM at rest.
 */
export interface PilotConfirmModalProps extends PilotConfirmRenderArgs {
  /** False renders nothing. True mounts the modal. */
  open: boolean;
}

/**
 * Default themed modal. Render portals into `document.body` so `overflow:
 * hidden` on the app's root layout can't clip the card.
 */
export function PilotConfirmModal(props: PilotConfirmModalProps): ReactElement | null {
  const { open, name, description, input, approve, cancel } = props;

  // Inject modal CSS lazily so the package stays zero-config — matching the
  // same pattern as `injectSidebarStyles`.
  useEffect(() => {
    if (open) injectModalStyles();
  }, [open]);

  // Track the element that had focus before the modal opened so we can
  // restore it on close. Linear-style polish — keyboard users don't get
  // stranded back at `<body>`.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [argsOpen, setArgsOpen] = useState(false);

  // SSR guard — only try to portal when a document exists.
  const canPortal = typeof document !== "undefined";

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // Primary-action focus: the confirm button, not the cancel button. This is
    // the Raycast/Arc convention — the safer default is Cancel, but defaulting
    // *focus* to Confirm lets keyboard users execute with Enter-Enter after
    // they've read the card. Escape is always a one-key decline.
    const raf = window.requestAnimationFrame(() => {
      confirmRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      // Restore focus when the modal unmounts. If the previously-focused
      // element is gone from the DOM (e.g., the component re-mounted),
      // the focus call silently no-ops.
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  // Reset the arguments-expanded state between separate confirms so each new
  // action opens with the collapsed-by-default surface.
  useEffect(() => {
    if (!open) setArgsOpen(false);
  }, [open]);

  // Keyboard handling: Escape = cancel, Enter = approve (when focus is not in
  // an input-like element). Tab is intercepted to trap focus between the two
  // buttons so keyboard users can't wander out.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === "Enter") {
        // If the user has focused the arguments `<summary>`, Enter toggles
        // the disclosure — don't hijack that.
        const active = document.activeElement;
        if (active && active.tagName === "SUMMARY") return;
        e.preventDefault();
        approve();
        return;
      }
      if (e.key === "Tab") {
        // Trap focus between Confirm and Cancel. Anything else inside the
        // card (the summary) remains reachable on the forward cycle.
        const confirmEl = confirmRef.current;
        const cancelEl = cancelRef.current;
        if (!confirmEl || !cancelEl) return;
        const active = document.activeElement;
        if (e.shiftKey && active === cancelEl) {
          e.preventDefault();
          confirmEl.focus();
        } else if (!e.shiftKey && active === confirmEl) {
          e.preventDefault();
          cancelEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, approve, cancel]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      // Only count clicks that started *and* ended on the backdrop itself —
      // drag-selecting text inside the card and releasing outside shouldn't
      // dismiss. We check both `target` and `currentTarget` so a stray click
      // on a child (e.g., the card) can't bubble up and close.
      if (e.target === e.currentTarget) {
        cancel();
      }
    },
    [cancel],
  );

  if (!open || !canPortal) return null;

  const prettyInput = formatJson(input);
  const hasInput = prettyInput !== null;

  const card: ReactElement = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close via Escape (window-level listener above); the backdrop is presentational only.
    <div className="pilot-confirm-backdrop" onClick={handleBackdropClick} role="presentation">
      <div
        className="pilot-confirm-card"
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pilot-confirm-title"
        aria-describedby="pilot-confirm-desc"
      >
        <div className="pilot-confirm-header">
          <h2 id="pilot-confirm-title" className="pilot-confirm-title">
            {humanizeName(name)}
          </h2>
          <p id="pilot-confirm-desc" className="pilot-confirm-desc">
            {description}
          </p>
        </div>
        {hasInput ? (
          <details
            className="pilot-confirm-args"
            open={argsOpen}
            onToggle={(e) => setArgsOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="pilot-confirm-args-summary">
              <span>Arguments</span>
              <span className="pilot-confirm-args-hint" aria-hidden="true">
                {argsOpen ? "hide" : "view"}
              </span>
            </summary>
            <pre className="pilot-confirm-args-pre">
              <code>{prettyInput}</code>
            </pre>
          </details>
        ) : null}
        <div className="pilot-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="pilot-confirm-btn pilot-confirm-btn-secondary"
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="pilot-confirm-btn pilot-confirm-btn-primary"
            onClick={approve}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}

/**
 * Pretty-print the tool input. Returns `null` when the payload is empty or
 * un-rendersable so the modal can hide the Arguments section entirely —
 * otherwise `submit_detail({})` would show a lonely `{}` that reads as noise.
 */
function formatJson(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === "object" && Object.keys(input as object).length === 0) {
    return null;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/**
 * `add_todo` → `Add todo`. `set_detail_field` → `Set detail field`.
 *
 * Snake-case is the convention for tool names; humans want sentence-case in
 * the modal header. We split on `_` so camelCase survives intact (unlikely
 * in practice but cheap to support).
 */
function humanizeName(name: string): string {
  const parts = name.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length === 0) return name;
  const first = (parts[0] ?? "").charAt(0).toUpperCase() + (parts[0] ?? "").slice(1);
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  return [first, ...rest].join(" ");
}
