/**
 * Shared chrome utilities used by every form factor: `<PilotSidebar>`,
 * `<PilotPopup>`, and `<PilotModal>`.
 *
 * The three form factors have different chrome (slide-in panel vs floating
 * card vs centered backdrop) but the *same* set of strings for the body and
 * header. Centralizing the label types and resolver here keeps API surface
 * consistent and prevents drift when a new label is added.
 */

import { type ReactNode } from "react";

/**
 * Labels for chromes that own a toggle button (sidebar, popup). Modal omits
 * `openButton` because it is controlled-only and never renders its own
 * trigger, see `PilotModalLabels` for that variant.
 */
export interface PilotChromeLabels {
  /** Header title and accessible label for the empty state. */
  title?: string;
  /** Placeholder shown inside the composer textarea. */
  inputPlaceholder?: string;
  /** Accessible label on the send button. */
  sendButton?: string;
  /** Body of the empty-state block before the first message. */
  emptyState?: string;
  /** Accessible label for the floating toggle / open trigger. */
  openButton?: string;
  /** Accessible label for the close (X) button inside the chrome. */
  closeButton?: string;
}

/** Modal variant: same as PilotChromeLabels minus `openButton`. */
export type PilotModalLabels = Omit<PilotChromeLabels, "openButton">;

/** Fully-resolved labels with every key populated. */
export interface ResolvedChromeLabels {
  title: string;
  inputPlaceholder: string;
  sendButton: string;
  emptyState: string;
  openButton: string;
  closeButton: string;
}

const DEFAULTS: ResolvedChromeLabels = {
  title: "Copilot",
  inputPlaceholder: "Ask me anything...",
  sendButton: "Send",
  emptyState: "Hi! Ask me anything about this page.",
  openButton: "Open copilot",
  closeButton: "Close copilot",
};

/**
 * Fill in defaults for any label key the caller omitted. Sidebar and popup
 * call this; modal calls `resolveModalLabels` which delegates here and
 * drops `openButton` from the result.
 */
export function resolveChromeLabels(input: PilotChromeLabels | undefined): ResolvedChromeLabels {
  return {
    title: input?.title ?? DEFAULTS.title,
    inputPlaceholder: input?.inputPlaceholder ?? DEFAULTS.inputPlaceholder,
    sendButton: input?.sendButton ?? DEFAULTS.sendButton,
    emptyState: input?.emptyState ?? DEFAULTS.emptyState,
    openButton: input?.openButton ?? DEFAULTS.openButton,
    closeButton: input?.closeButton ?? DEFAULTS.closeButton,
  };
}

/** Like `resolveChromeLabels` but with `openButton` masked out for clarity. */
export function resolveModalLabels(
  input: PilotModalLabels | undefined,
): Omit<ResolvedChromeLabels, "openButton"> {
  const full = resolveChromeLabels(input);
  return {
    title: full.title,
    inputPlaceholder: full.inputPlaceholder,
    sendButton: full.sendButton,
    emptyState: full.emptyState,
    closeButton: full.closeButton,
  };
}

/**
 * Capture the currently-focused element when a chrome opens, restore it
 * when it closes. Used by sidebar, popup, and modal so focus returns to
 * wherever the user was before the chrome appeared (the trigger button if
 * they clicked it, the previously-focused control if they opened via a
 * keyboard shortcut, or `body` as a no-op fallback).
 *
 * Returns the ref handle; intended use is one `useEffect` per chrome that
 * calls `capture()` on open and `restore()` from cleanup.
 */
export function createFocusRestoreHandle(): {
  capture: () => void;
  restore: () => void;
} {
  let previous: HTMLElement | null = null;
  return {
    capture: (): void => {
      if (typeof document === "undefined") return;
      previous = (document.activeElement as HTMLElement | null) ?? null;
    },
    restore: (): void => {
      previous?.focus?.();
    },
  };
}

/**
 * Find the first and last focusable elements within a container. Used by
 * the modal's Tab focus trap so keyboard users can't escape the dialog
 * while `aria-modal="true"` claims they can't.
 *
 * The selector matches buttons, links, inputs, textareas, selects, and
 * elements with explicit `tabindex >= 0`. Disabled controls and elements
 * with `tabindex="-1"` are excluded. Hidden elements (`display: none`,
 * `visibility: hidden`) survive the selector but the browser's tab order
 * skips them, which is acceptable for our use.
 */
export function findFocusBounds(
  container: HTMLElement | null,
): { first: HTMLElement | null; last: HTMLElement | null } {
  if (!container) return { first: null, last: null };
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(", ");
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  if (nodes.length === 0) return { first: null, last: null };
  return { first: nodes[0] ?? null, last: nodes[nodes.length - 1] ?? null };
}

/**
 * Standard close X icon used by every chrome's header. Identical SVG
 * across sidebar, popup, and modal, extracted here so a future redesign
 * touches one place.
 */
export function PilotCloseIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Chat-bubble icon used by the popup's floating toggle. */
export function PilotChatIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 6c0-1.105.895-2 2-2h10c1.105 0 2 .895 2 2v6c0 1.105-.895 2-2 2H8l-3 3v-3H5c-1.105 0-2-.895-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
