/**
 * Composer (input + send/stop button) for `<PilotSidebar>`.
 *
 * Kept headless and local-state-only — the parent passes down the callbacks
 * it wants to wire to `sendMessage` / `stop`, so the component is trivial
 * to test in isolation and carries no hidden dependency on the chat context.
 */

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface PilotComposerProps {
  /** Called with the message text when the user submits. Must not throw. */
  onSubmit: (text: string) => void;
  /** Called when the user clicks the stop button while `isLoading`. */
  onStop: () => void;
  /** True while an assistant response is in-flight — swaps send for stop. */
  isLoading: boolean;
  /** Placeholder text. */
  placeholder: string;
  /** Accessible label for the send button. */
  sendLabel: string;
  /**
   * When true the textarea grabs focus after the first render. Used by the
   * parent to focus the input as the sidebar slides in — essential UX detail
   * given the sidebar's whole purpose is typing.
   */
  autoFocus?: boolean;
}

/** Imperative handle consumers can use to programmatically focus the input. */
export interface PilotComposerHandle {
  focus: () => void;
}

/**
 * Controlled-free composer: owns its own draft text so parent re-renders
 * (from streaming messages) don't disturb keystrokes in-flight.
 *
 * Keyboard contract:
 *   - `Enter` submits (if non-empty and not loading)
 *   - `Shift+Enter` inserts a newline
 *   - `Cmd/Ctrl+Enter` also submits, for users who prefer that shortcut
 */
export const PilotComposer = forwardRef<PilotComposerHandle, PilotComposerProps>(
  function PilotComposer(props, ref): ReactNode {
    const { onSubmit, onStop, isLoading, placeholder, sendLabel, autoFocus } = props;

    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
      }),
      [],
    );

    // Grow-to-fit behavior. Measuring with scrollHeight after a reset to
    // `auto` is the only reliable way across browsers — fixed CSS rows leave
    // a stranded scrollbar, and line-count math breaks on soft-wraps. The
    // `draft.length` read inside the effect (no-op aside from referencing
    // the variable) keeps biome's exhaustive-deps rule satisfied: the effect
    // must re-run whenever the draft changes so the textarea re-measures
    // after React commits the new value.
    useLayoutEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      // Reference draft so the linter sees it as a real dependency.
      void draft;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [draft]);

    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    const submit = useCallback((): void => {
      const trimmed = draft.trim();
      if (!trimmed || isLoading) return;
      onSubmit(trimmed);
      setDraft("");
    }, [draft, isLoading, onSubmit]);

    const onKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          submit();
        }
      },
      [submit],
    );

    const onFormSubmit = useCallback(
      (e: FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        submit();
      },
      [submit],
    );

    return (
      <form className="pilot-composer" onSubmit={onFormSubmit}>
        <div className="pilot-composer-row">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            disabled={false}
          />
          {isLoading ? (
            <button
              type="button"
              className="pilot-send"
              data-variant="stop"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              className="pilot-send"
              disabled={draft.trim().length === 0}
              aria-label={sendLabel}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    );
  },
);

function SendIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon(): ReactNode {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}
