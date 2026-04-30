"use client";

/**
 * `<PilotModal>`, centered backdrop dialog form factor.
 *
 * Controlled-only: consumers own the open state and pass `open` +
 * `onOpenChange`. There is no built-in trigger button, the modal exists
 * to be opened in response to an explicit consumer action (a "Help" item
 * in a menu, a keyboard shortcut, a programmatic command palette).
 *
 * Composition: a portaled backdrop wraps a `<PilotChatView>` for the body.
 * Backdrop click and Escape both fire `onOpenChange(false)`.
 *
 * Accessibility:
 *   - Backdrop is `role="presentation"`; the inner card is `role="dialog"`
 *     with `aria-modal="true"` and `aria-labelledby` pointing at the
 *     header title.
 *   - Focus moves to the composer on open (via `PilotChatView`'s built-in
 *     autoFocus). On close, focus returns to whatever element was
 *     focused before the modal opened.
 *   - Tab cycles within the dialog (focus trap). Backdrop click and
 *     Escape close. Without the trap, `aria-modal="true"` lies to screen
 *     readers, keyboard users could Tab out behind the backdrop while
 *     the modal claimed exclusive focus.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { PilotChatView, type PilotChatViewHandle } from "./pilot-chat-view.js";
import {
  PilotCloseIcon,
  type PilotModalLabels,
  createFocusRestoreHandle,
  findFocusBounds,
  resolveModalLabels,
} from "./pilot-chrome.js";
import { injectSidebarStyles } from "./pilot-sidebar-styles.js";

export interface PilotModalProps {
  /** Controlled open state. Required. */
  open: boolean;
  /** Called whenever the modal wants to close (backdrop, Escape, X button). */
  onOpenChange: (open: boolean) => void;
  /** Empty-state body shown before the first message. */
  greeting?: ReactNode;
  /** className applied to the modal card. */
  className?: string;
  /** Card width; accepts CSS units. Defaults to `"720px"`. */
  width?: number | string;
  /** Card height; accepts CSS units. Defaults to `"80vh"`. */
  height?: number | string;
  /**
   * One-click prompt chips surfaced above the composer when there are no
   * messages. Omit to hide the chip row entirely.
   */
  suggestions?: ReadonlyArray<string>;
  /** Text overrides for built-in copy. */
  labels?: PilotModalLabels;
}

export function PilotModal(props: PilotModalProps): ReactNode {
  const {
    open,
    onOpenChange,
    greeting,
    className,
    width = "720px",
    height = "80vh",
    suggestions,
    labels,
  } = props;

  const resolvedLabels = resolveModalLabels(labels);
  const titleId = useId();

  useEffect(() => {
    if (open) injectSidebarStyles();
  }, [open]);

  const cardRef = useRef<HTMLDivElement>(null);
  const chatViewRef = useRef<PilotChatViewHandle>(null);
  const focusRestore = useMemo(() => createFocusRestoreHandle(), []);

  // Capture the previously-focused element BEFORE the composer's autoFocus
  // useEffect grabs the textarea. Layout effects fire bottom-up after DOM
  // commit but before the regular useEffect phase, so when this fires,
  // PilotComposer has not yet called textareaRef.current.focus(), and
  // document.activeElement is still whatever the consumer's trigger
  // button (or any other previously-focused element) was. On close,
  // focus is restored exactly there.
  //
  // This is why sidebar/popup use a different pattern: they own the
  // toggle button and can simply re-focus it on close. The modal has no
  // toggle, so the previously-focused-element capture is the right tool.
  useLayoutEffect(() => {
    if (!open) return;
    focusRestore.capture();
    return () => {
      focusRestore.restore();
    };
  }, [open, focusRestore]);

  // Escape closes. Listener scoped to `open` so closed modals leave keyboard
  // alone.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  // Tab focus trap, required because the card declares `aria-modal="true"`.
  // Uses capture phase so we can intercept before the browser's default tab
  // navigation moves focus out of the dialog. Recomputes the focusable
  // bounds on every key event so dynamic content (suggestions appearing,
  // error banner showing) doesn't trap on stale references.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const { first, last } = findFocusBounds(card);
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !card.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      // Only count clicks that started AND ended on the backdrop itself ,
      // drag-selecting text inside the card and releasing outside shouldn't
      // dismiss. Same convention as `<PilotConfirmModal>`.
      if (e.target === e.currentTarget) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  // SSR / non-DOM safe, only portal when `document` exists.
  const canPortal = typeof document !== "undefined";
  if (!open || !canPortal) return null;

  const widthCss = typeof width === "number" ? `${width}px` : width;
  const heightCss = typeof height === "number" ? `${height}px` : height;

  const node: ReactNode = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close via the Escape window-level listener; the backdrop is presentational only.
    <div className="pilot-modal-backdrop" onClick={handleBackdropClick} role="presentation">
      <div
        className={["pilot-modal-card", className].filter(Boolean).join(" ")}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          ["--pilot-modal-width" as string]: widthCss,
          ["--pilot-modal-height" as string]: heightCss,
        }}
      >
        <header className="pilot-header">
          <h2 id={titleId} className="pilot-header-title">
            {resolvedLabels.title}
          </h2>
          <button
            type="button"
            className="pilot-icon-button"
            onClick={() => onOpenChange(false)}
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
    </div>
  );

  return createPortal(node, document.body);
}
