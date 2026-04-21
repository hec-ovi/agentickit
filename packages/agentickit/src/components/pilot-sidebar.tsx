"use client";

/**
 * `<PilotSidebar>` — the package's default chat UI.
 *
 * Consumers who want a working copilot with zero styling work drop this in
 * under `<Pilot>` and get a polished, accessible, themeable sidebar. Everyone
 * else can build their own UI from `PilotChatContext` and ignore this file.
 *
 * Architecture:
 *
 *   - Structural inspiration from assistant-ui's ThreadRoot / ThreadViewport /
 *     Composer primitives (MIT-licensed, credited in `NOTICE.md`). We do NOT
 *     copy their code — we wrote our own with a much smaller surface (~5 files
 *     vs. their ~30 primitives). See `NOTICE.md` at the repo root.
 *
 *   - Styles are a self-contained CSS string injected into the document head
 *     on mount. No Tailwind, no design system, no side-effect imports.
 *     Consumers override via CSS variables (--pilot-bg, --pilot-accent, …).
 *
 *   - Messages, composer, and the toggle-to-open-button are split into sibling
 *     files so each stays testable and the top-level component reads like a
 *     layout declaration.
 *
 * Accessibility:
 *
 *   - The slide-in panel is a `<aside>` with `role="complementary"` and an
 *     `aria-label` consumers can override via `labels.title`.
 *   - The close button, suggestion chips, input, and send button all have
 *     explicit labels — no icon-only controls without accessible text.
 *   - `Escape` closes the sidebar; focus returns to the toggle button.
 *   - On open, focus lands on the input textarea so the user can type
 *     immediately.
 */

import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotComposer, type PilotComposerHandle } from "./pilot-sidebar-composer.js";
import { PilotMessageList } from "./pilot-sidebar-messages.js";
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
   * Optional controlled-open callback. When provided, the caller can still
   * let the component manage state (we only call this when state flips) —
   * pair with `defaultOpen` to set the initial value.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Text overrides for every label rendered by the sidebar. Every key is
   * optional — omitted keys use the built-in English defaults.
   */
  labels?: {
    title?: string;
    inputPlaceholder?: string;
    sendButton?: string;
    emptyState?: string;
    openButton?: string;
    closeButton?: string;
  };
}

interface ResolvedLabels {
  title: string;
  inputPlaceholder: string;
  sendButton: string;
  emptyState: string;
  openButton: string;
  closeButton: string;
}

const DEFAULT_LABELS: ResolvedLabels = {
  title: "Copilot",
  inputPlaceholder: "Ask me anything...",
  sendButton: "Send",
  emptyState: "Hi! Ask me anything about this page.",
  openButton: "Open copilot",
  closeButton: "Close copilot",
};

function resolveLabels(input: PilotSidebarProps["labels"]): ResolvedLabels {
  return {
    title: input?.title ?? DEFAULT_LABELS.title,
    inputPlaceholder: input?.inputPlaceholder ?? DEFAULT_LABELS.inputPlaceholder,
    sendButton: input?.sendButton ?? DEFAULT_LABELS.sendButton,
    emptyState: input?.emptyState ?? DEFAULT_LABELS.emptyState,
    openButton: input?.openButton ?? DEFAULT_LABELS.openButton,
    closeButton: input?.closeButton ?? DEFAULT_LABELS.closeButton,
  };
}

/**
 * Top-level sidebar component. Composes the header, message list, suggestion
 * chips, optional error banner, and composer — plus a floating toggle button
 * when collapsed.
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

  const resolvedLabels = resolveLabels(labels);
  const titleId = useId();

  // Inject styles once, on mount. Safe to call repeatedly — internally guarded.
  useEffect(() => {
    injectSidebarStyles();
  }, []);

  const [open, setOpen] = useState(defaultOpen);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const composerRef = useRef<PilotComposerHandle>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Notify the consumer on transitions only — not on initial mount.
  const lastReportedOpen = useRef(open);
  useEffect(() => {
    if (lastReportedOpen.current !== open) {
      lastReportedOpen.current = open;
      onOpenChange?.(open);
    }
  }, [open, onOpenChange]);

  // Escape closes the sidebar and hands focus back to the toggle so keyboard
  // users aren't stranded. We scope the listener to `open` so the key doesn't
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

  // Return focus to the toggle button after a close transition so tab-users
  // don't lose their place.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      toggleButtonRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  const chat = useContext(PilotChatContext);

  const handleSend = useCallback(
    (text: string): void => {
      if (!chat) return;
      // sendMessage returns a promise but we don't need to await — the UI
      // updates via context when `status` flips.
      void chat.sendMessage(text);
    },
    [chat],
  );

  const handleSuggestion = useCallback(
    (text: string): void => {
      handleSend(text);
      composerRef.current?.focus();
    },
    [handleSend],
  );

  const handleStop = useCallback((): void => {
    if (!chat) return;
    void chat.stop();
  }, [chat]);

  // Clear the error-dismissal state when a new error arrives so subsequent
  // errors aren't swallowed by a stale dismiss.
  const errorMessage = chat?.error?.message ?? null;
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (errorMessage !== prevErrorRef.current) {
      prevErrorRef.current = errorMessage;
      setErrorDismissed(false);
    }
  }, [errorMessage]);

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

  const messages = chat?.messages ?? EMPTY_MESSAGES;
  const isLoading = chat?.isLoading ?? false;
  const empty: ReactNode = greeting ?? (
    <>
      <span className="pilot-empty-title">{resolvedLabels.title}</span>
      <span>{resolvedLabels.emptyState}</span>
    </>
  );

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
          onClick={() => setOpen(false)}
          aria-label={resolvedLabels.closeButton}
        >
          <CloseIcon />
        </button>
      </header>

      <PilotMessageList messages={messages} isLoading={isLoading} emptyState={empty} />

      {errorMessage && !errorDismissed ? (
        <div className="pilot-error" role="alert">
          <span className="pilot-error-message">{errorMessage}</span>
          <button
            type="button"
            className="pilot-error-dismiss"
            onClick={() => setErrorDismissed(true)}
            aria-label="Dismiss error"
          >
            {"×"}
          </button>
        </div>
      ) : null}

      {suggestions && suggestions.length > 0 && messages.length === 0 ? (
        <div className="pilot-suggestions" aria-label="Suggested prompts">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              className="pilot-suggestion"
              onClick={() => handleSuggestion(text)}
              disabled={isLoading}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}

      <PilotComposer
        ref={composerRef}
        onSubmit={handleSend}
        onStop={handleStop}
        isLoading={isLoading}
        placeholder={resolvedLabels.inputPlaceholder}
        sendLabel={resolvedLabels.sendButton}
        autoFocus
      />
    </aside>
  );
}

/**
 * Stable empty array reference used when the sidebar is rendered outside a
 * `<Pilot>` provider. Keeping the reference stable avoids churning the
 * `PilotMessageList` memoized props across renders.
 */
const EMPTY_MESSAGES: ReadonlyArray<unknown> = [];

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

function CloseIcon(): ReactNode {
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
