"use client";

/**
 * `<PilotSidebar>`, the package's slide-in chat chrome.
 *
 * Composition:
 *
 *   - The body (messages, error banner, suggestions, skills panel, composer)
 *     is delegated to `<PilotChatView>` so the sidebar, popup, and modal
 *     form factors stay in sync without duplication.
 *   - This file owns sidebar-specific chrome only: the toggle button, the
 *     slide-in `<aside>`, the header with title and close button, position +
 *     width handling, and the escape-to-close keyboard hook.
 *
 * Open-state model: uncontrolled with a transition callback. The component
 * owns its own open state internally; `defaultOpen` sets the initial value
 * and `onOpenChange` is called whenever the state flips. Consumers who need
 * full controlled state can wrap a `<Pilot>` over a custom chrome built on
 * `<PilotChatView>`.
 *
 * Architecture:
 *
 *   - Structural inspiration from assistant-ui's ThreadRoot / ThreadViewport /
 *     Composer primitives (MIT-licensed, credited in `NOTICE.md`). We do NOT
 *     copy their code, we wrote our own with a much smaller surface (~5 files
 *     vs. their ~30 primitives). See `NOTICE.md` at the repo root.
 *
 *   - Styles are a self-contained CSS string injected into the document head
 *     on mount. No Tailwind, no design system, no side-effect imports.
 *     Consumers override via CSS variables (--pilot-bg, --pilot-accent, …).
 *
 * Accessibility:
 *
 *   - The slide-in panel is a `<aside>` with `role="complementary"` and an
 *     `aria-label` consumers can override via `labels.title`.
 *   - The close button, suggestion chips, input, and send button all have
 *     explicit labels, no icon-only controls without accessible text.
 *   - `Escape` closes the sidebar; focus returns to whatever was focused
 *     before the sidebar opened (the toggle button when the user clicked it,
 *     or any other element when the sidebar was opened programmatically).
 *   - On open, focus lands on the input textarea so the user can type
 *     immediately.
 */

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { PilotChatView, type PilotChatViewHandle } from "./pilot-chat-view.js";
import { type PilotChromeLabels, PilotChromeHeader, resolveChromeLabels } from "./pilot-chrome.js";
import { injectSidebarStyles } from "./pilot-sidebar-styles.js";

export interface PilotSidebarProps {
  /**
   * Initial open state when the sidebar is uncontrolled. Defaults to
   * `false` (toggle button only). Ignored when `open` is provided.
   */
  defaultOpen?: boolean;
  /**
   * Controlled open state. When provided (boolean), the sidebar is FULLY
   * controlled: it reflects this value exactly and never updates its own
   * internal state. Pair with `onOpenChange` to drive a state lifted to
   * the parent (useful when you need open state to survive runtime swaps,
   * route changes, or any reconciliation that would otherwise reset
   * uncontrolled state). When omitted (undefined), the sidebar is
   * uncontrolled and uses `defaultOpen` as the initial value.
   */
  open?: boolean;
  /**
   * Rendered inside the empty state when there are no messages yet. Falls
   * back to `labels.emptyState` when omitted.
   */
  greeting?: ReactNode;
  /** className applied to the sidebar's outer `<aside>` element. */
  className?: string;
  /** Sidebar width; accepts CSS units. Defaults to `"380px"`. */
  width?: number | string;
  /** Side the sidebar docks to. Defaults to `"right"`. */
  position?: "left" | "right";
  /**
   * One-click prompt chips surfaced above the composer when there are no
   * messages. Clicking a chip fires `sendMessage(chipText)` and immediately
   * focuses the input. Omit to hide the chip row entirely.
   */
  suggestions?: ReadonlyArray<string>;
  /**
   * Fires every time the sidebar attempts to flip open state, in BOTH
   * uncontrolled and controlled modes. In uncontrolled mode this is a
   * notification (the component already updated its own state). In
   * controlled mode this is the consumer's hook to update the state it
   * owns; without an `onOpenChange` handler in controlled mode, the
   * sidebar will never appear to change.
   */
  onOpenChange?: (open: boolean) => void;
  /** Text overrides for built-in copy. Every key is optional. */
  labels?: PilotChromeLabels;
  /**
   * Composer visibility, forwarded to the inner `<PilotChatView>`. See
   * `PilotChatViewProps.composer` for full semantics. Default `"full"`.
   */
  composer?: "full" | "suggestions" | "off";
  /**
   * How the sidebar relates to the page content.
   *
   * - `"overlay"` (default): the sidebar floats over the page; nothing
   *   underneath is shifted. Same behavior `<PilotSidebar>` has always had.
   * - `"push"`: when the sidebar is open, the package adds
   *   `data-pilot-sidebar-state="open"`, `data-pilot-sidebar-mode="push"`,
   *   `data-pilot-sidebar-position="left|right"`, and a CSS variable
   *   `--pilot-sidebar-width-active` to `<html>`. The package's own CSS
   *   then applies a matching padding to `<body>` so the page content
   *   shifts. Consumers can override the rule for finer-grained control,
   *   e.g. push only a specific element.
   */
  mode?: "overlay" | "push";
}

/**
 * Top-level sidebar component. Renders the toggle button when closed, or the
 * slide-in `<aside>` chrome wrapping a `<PilotChatView>` when open.
 */
export function PilotSidebar(props: PilotSidebarProps = {}): ReactNode {
  const {
    defaultOpen = false,
    open: controlledOpen,
    greeting,
    className,
    width = "380px",
    position = "right",
    suggestions,
    onOpenChange,
    labels,
    composer,
    mode = "overlay",
  } = props;

  const resolvedLabels = resolveChromeLabels(labels);
  const titleId = useId();

  // Inject styles once, on mount. Safe to call repeatedly, internally guarded.
  useEffect(() => {
    injectSidebarStyles();
  }, []);

  // Controlled vs uncontrolled. When `controlledOpen` is provided, the
  // consumer owns the state; we never write to internal state and the
  // rendered open value reflects the prop exactly. This is what lets a
  // parent lift open state above any reconciliation boundary that would
  // otherwise reset the uncontrolled internal state (e.g., runtime swaps
  // when the consumer rebuilds <Pilot runtime={...}>).
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : internalOpen;
  const chatViewRef = useRef<PilotChatViewHandle>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const setOpen = useCallback(
    (value: boolean) => {
      if (value === open) return;
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, open, onOpenChange],
  );

  // Push mode: while the sidebar is open, mark <html> with data attributes
  // and a CSS variable so the package's own CSS (and consumer overrides)
  // can shift the page content to make room. Cleans up to a closed state
  // on unmount and on close.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const widthValue = typeof width === "number" ? `${width}px` : width;
    if (mode === "push" && open) {
      html.setAttribute("data-pilot-sidebar-mode", "push");
      html.setAttribute("data-pilot-sidebar-state", "open");
      html.setAttribute("data-pilot-sidebar-position", position);
      html.style.setProperty("--pilot-sidebar-width-active", widthValue);
    } else {
      html.removeAttribute("data-pilot-sidebar-mode");
      html.removeAttribute("data-pilot-sidebar-state");
      html.removeAttribute("data-pilot-sidebar-position");
      html.style.removeProperty("--pilot-sidebar-width-active");
    }
    return () => {
      html.removeAttribute("data-pilot-sidebar-mode");
      html.removeAttribute("data-pilot-sidebar-state");
      html.removeAttribute("data-pilot-sidebar-position");
      html.style.removeProperty("--pilot-sidebar-width-active");
    };
  }, [mode, open, position, width]);

  // Return focus to the toggle button on close. The toggle is the only way
  // to open the sidebar (the API is uncontrolled), so the toggle is the
  // right re-anchor for keyboard users. The ref points at the freshly-
  // remounted toggle by the time this effect fires (commit happens before
  // effects, ref callback runs during commit).
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      toggleButtonRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  // Escape closes the sidebar. Listener scoped to `open` so the key doesn't
  // leak behavior when the sidebar isn't visible.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [open, setOpen]);

  // `setOpen` is now a useCallback whose identity changes when `open` or
  // `isControlled` flips. handleClose's deps must include it — the
  // earlier `[]` form silently captured a stale closure on first render
  // (with `open === false`), so subsequent close clicks short-circuited
  // because the captured `setOpen` saw `value === open` and returned.
  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  const widthCss = typeof width === "number" ? `${width}px` : width;

  if (!open) {
    return (
      <button
        ref={toggleButtonRef}
        type="button"
        className="pilot-toggle"
        data-position={position}
        onClick={() => setOpen(true)}
        aria-label={resolvedLabels.openButton}
        aria-expanded={false}
      >
        <span className="pilot-toggle-dot" aria-hidden="true" />
        <span>{resolvedLabels.title}</span>
      </button>
    );
  }

  const classes = ["pilot-sidebar", className].filter(Boolean).join(" ");

  return (
    <aside
      className={classes}
      data-position={position}
      aria-labelledby={titleId}
      style={{ ["--pilot-sidebar-width" as string]: widthCss }}
    >
      <PilotChromeHeader
        title={resolvedLabels.title}
        closeLabel={resolvedLabels.closeButton}
        onClose={handleClose}
        titleId={titleId}
      />

      <PilotChatView
        ref={chatViewRef}
        greeting={greeting}
        suggestions={suggestions}
        composer={composer}
        labels={{
          title: resolvedLabels.title,
          inputPlaceholder: resolvedLabels.inputPlaceholder,
          sendButton: resolvedLabels.sendButton,
          emptyState: resolvedLabels.emptyState,
        }}
        autoFocus
      />
    </aside>
  );
}

