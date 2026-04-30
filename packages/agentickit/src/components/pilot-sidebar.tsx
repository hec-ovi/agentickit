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
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotChatView, type PilotChatViewHandle } from "./pilot-chat-view.js";
import {
  type PilotChromeLabels,
  PilotCloseIcon,
  resolveChromeLabels,
} from "./pilot-chrome.js";
import { injectSidebarStyles } from "./pilot-sidebar-styles.js";

export interface PilotSidebarProps {
  /** Open by default. Defaults to `false` (toggle button only). */
  defaultOpen?: boolean;
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
   * Optional transition callback. Fired exactly when the open state flips ,
   * not on initial mount. The component manages its own state; this is a
   * notification, not a controlled API. Use it to drive analytics, hide a
   * fab, or toggle related UI.
   */
  onOpenChange?: (open: boolean) => void;
  /** Text overrides for built-in copy. Every key is optional. */
  labels?: PilotChromeLabels;
}

/**
 * Top-level sidebar component. Renders the toggle button when closed, or the
 * slide-in `<aside>` chrome wrapping a `<PilotChatView>` when open.
 */
export function PilotSidebar(props: PilotSidebarProps = {}): ReactNode {
  const {
    defaultOpen = false,
    greeting,
    className,
    width = "380px",
    position = "right",
    suggestions,
    onOpenChange,
    labels,
  } = props;

  const resolvedLabels = resolveChromeLabels(labels);
  const titleId = useId();

  // Inject styles once, on mount. Safe to call repeatedly, internally guarded.
  useEffect(() => {
    injectSidebarStyles();
  }, []);

  const [open, setOpen] = useState(defaultOpen);
  const chatViewRef = useRef<PilotChatViewHandle>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Notify the consumer on transitions only, not on initial mount.
  const lastReportedOpen = useRef(open);
  useEffect(() => {
    if (lastReportedOpen.current !== open) {
      lastReportedOpen.current = open;
      onOpenChange?.(open);
    }
  }, [open, onOpenChange]);

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
  }, [open]);

  const handleClose = useCallback(() => setOpen(false), []);

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
      <header className="pilot-header">
        <h2 id={titleId} className="pilot-header-title">
          {resolvedLabels.title}
        </h2>
        <button
          type="button"
          className="pilot-icon-button"
          onClick={handleClose}
          aria-label={resolvedLabels.closeButton}
        >
          <PilotCloseIcon />
        </button>
      </header>

      <PilotChatView
        ref={chatViewRef}
        greeting={greeting}
        suggestions={suggestions}
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

/**
 * Helper for tests and for rare integration paths that want to render the
 * sidebar without going through the full `<Pilot>` provider (e.g., a
 * Storybook story with canned messages).
 */
export function PilotSidebarStandalone(
  props: PilotSidebarProps & { value: PilotChatContextValue },
): ReactNode {
  const { value, ...rest } = props;
  return (
    <PilotChatContext.Provider value={value}>
      <PilotSidebar {...rest} />
    </PilotChatContext.Provider>
  );
}
