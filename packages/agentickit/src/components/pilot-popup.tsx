"use client";

/**
 * `<PilotPopup>`, floating bubble form factor.
 *
 * A small circular button anchored to one of the four viewport corners
 * toggles a card-shaped chat panel. Different chrome than `<PilotSidebar>`
 * but composes the same `<PilotChatView>` body so messages, streaming,
 * suggestions, and the skills panel all behave identically.
 *
 * Use cases:
 *   - Customer-facing copilots that should not dominate the layout.
 *   - Marketing/landing pages that want the copilot off to the side.
 *   - Apps where the right-edge or left-edge is already occupied by a
 *     navigation pane and a slide-in sidebar would conflict.
 *
 * Open-state model: uncontrolled with a transition callback (same shape as
 * `<PilotSidebar>`'s `onOpenChange`). The toggle button is hidden while the
 * card is open (Intercom/Drift convention), closing happens via Escape, the
 * header X, or programmatic state flip from `onOpenChange`.
 *
 * Accessibility:
 *   - Toggle button has an explicit `aria-label`.
 *   - Card has `role="dialog"` + `aria-modal="false"` (the page behind
 *     remains interactive) and `aria-labelledby` pointing at the header
 *     title.
 *   - Escape closes the card and returns focus to whatever was focused
 *     before the popup opened.
 */

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { PilotChatView, type PilotChatViewHandle } from "./pilot-chat-view.js";
import {
  PilotChatIcon,
  type PilotChromeLabels,
  PilotCloseIcon,
  resolveChromeLabels,
} from "./pilot-chrome.js";
import { injectSidebarStyles } from "./pilot-sidebar-styles.js";

export type PilotPopupPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface PilotPopupProps {
  /** Open by default. Defaults to `false` (toggle button only). */
  defaultOpen?: boolean;
  /** Empty-state body shown before the first message. */
  greeting?: ReactNode;
  /** className applied to the popup card when open. */
  className?: string;
  /** Card width; accepts CSS units. Defaults to `"380px"`. */
  width?: number | string;
  /** Card height; accepts CSS units. Defaults to `"560px"`. */
  height?: number | string;
  /** Corner the toggle anchors to. Defaults to `"bottom-right"`. */
  position?: PilotPopupPosition;
  /**
   * One-click prompt chips surfaced above the composer when there are no
   * messages. Omit to hide the chip row entirely.
   */
  suggestions?: ReadonlyArray<string>;
  /**
   * Optional transition callback. Fired exactly when the open state flips ,
   * not on initial mount. The component manages its own state; this is a
   * notification, not a controlled API.
   */
  onOpenChange?: (open: boolean) => void;
  /** Text overrides for built-in copy. */
  labels?: PilotChromeLabels;
}

export function PilotPopup(props: PilotPopupProps = {}): ReactNode {
  const {
    defaultOpen = false,
    greeting,
    className,
    width = "380px",
    height = "560px",
    position = "bottom-right",
    suggestions,
    onOpenChange,
    labels,
  } = props;

  const resolvedLabels = resolveChromeLabels(labels);
  const titleId = useId();

  useEffect(() => {
    injectSidebarStyles();
  }, []);

  const [open, setOpen] = useState(defaultOpen);
  const chatViewRef = useRef<PilotChatViewHandle>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const lastReportedOpen = useRef(open);
  useEffect(() => {
    if (lastReportedOpen.current !== open) {
      lastReportedOpen.current = open;
      onOpenChange?.(open);
    }
  }, [open, onOpenChange]);

  // Return focus to the toggle button on close. Same rationale as sidebar:
  // the toggle is the only way to open this chrome (uncontrolled API), so
  // it's the right re-anchor when keyboard users dismiss.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      toggleButtonRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  // Escape closes; scoped to `open`.
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
  const heightCss = typeof height === "number" ? `${height}px` : height;

  // Floating chat widgets (Intercom, Drift, Crisp) hide the bubble when the
  // panel is open and rely on a single close affordance inside the panel
  // header. We follow the same pattern: closed -> toggle button visible,
  // open -> card with header close button visible. Avoids two buttons with
  // the same accessible name.
  if (!open) {
    return (
      <button
        ref={toggleButtonRef}
        type="button"
        className="pilot-popup-button"
        data-position={position}
        onClick={() => setOpen(true)}
        aria-label={resolvedLabels.openButton}
        aria-expanded={false}
      >
        <PilotChatIcon />
      </button>
    );
  }

  return (
    <div
      className={["pilot-popup-card", className].filter(Boolean).join(" ")}
      data-position={position}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={{
        ["--pilot-popup-width" as string]: widthCss,
        ["--pilot-popup-height" as string]: heightCss,
      }}
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
    </div>
  );
}
