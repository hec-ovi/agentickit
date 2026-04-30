"use client";

/**
 * `<PilotChatView>`, the headless chat body shared by every form factor.
 *
 * Three concrete presentations wrap this component:
 *   - `<PilotSidebar>`, slide-in panel docked to one side of the viewport.
 *   - `<PilotPopup>`, floating bubble anchored to a corner.
 *   - `<PilotModal>`, centered backdrop dialog.
 *
 * Public consumers can also render `<PilotChatView>` directly inside their
 * own chrome (a tab, a card, a fullscreen page) by mounting it as a child of
 * `<Pilot>`. The component holds zero opinions about position, size, or how
 * it's shown, that's the chrome's job.
 *
 * Body composition (top to bottom):
 *
 *   1. Message list with sticky-to-bottom autoscroll.
 *   2. Dismissible error banner when `chat.error` is set.
 *   3. Suggestion chip row when there are no messages and `suggestions` is
 *      non-empty.
 *   4. Optional skills panel surfacing the registered actions/state/forms.
 *   5. Composer with autosize textarea and send/stop button.
 *
 * The component reads from `PilotChatContext` and dispatches `sendMessage` /
 * `stop` against it. Outside a `<Pilot>` provider it renders an empty body ,
 * useful for storybooks and visual regression with canned data via
 * `PilotChatContext.Provider`.
 */

import {
  type ForwardedRef,
  type ReactNode,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { PilotChatContext } from "../context.js";
import { PilotComposer, type PilotComposerHandle } from "./pilot-sidebar-composer.js";
import { PilotMessageList } from "./pilot-sidebar-messages.js";
import { PilotSkillsPanel } from "./pilot-skills-panel.js";

export interface PilotChatViewLabels {
  /** Used as the accessible empty-state title and as a fallback for chrome titles. */
  title?: string;
  /** Placeholder shown inside the composer textarea. */
  inputPlaceholder?: string;
  /** Accessible label on the send button. */
  sendButton?: string;
  /** Body of the empty-state block before the first message. */
  emptyState?: string;
}

export interface PilotChatViewProps {
  /**
   * Replaces the empty-state block before the first message. Falls back to
   * `labels.title` + `labels.emptyState` when omitted.
   */
  greeting?: ReactNode;
  /** Additional className concatenated with `pilot-chat-view`. */
  className?: string;
  /**
   * One-click prompt chips surfaced above the composer when there are no
   * messages. Clicking a chip fires `sendMessage(chipText)` and refocuses
   * the composer. Omit to hide the chip row entirely.
   */
  suggestions?: ReadonlyArray<string>;
  /** Text overrides for built-in copy. Every key is optional. */
  labels?: PilotChatViewLabels;
  /**
   * Auto-focus the composer textarea on first render. Default `true` because
   * the most common parent (sidebar/popup/modal) only mounts the chat view
   * when the chrome opens, and the user is about to type.
   */
  autoFocus?: boolean;
  /**
   * Render the collapsible skills panel above the composer. Default `true`.
   * Pass `false` to hide it (e.g., the parent chrome already has its own
   * capability surface).
   */
  showSkillsPanel?: boolean;
}

/**
 * Imperative handle consumers can use to focus or prefill the composer
 * without crossing the chat-context boundary.
 */
export interface PilotChatViewHandle {
  focus: () => void;
  prefill: (text: string) => void;
}

const DEFAULT_LABELS: Required<PilotChatViewLabels> = {
  title: "Copilot",
  inputPlaceholder: "Ask me anything...",
  sendButton: "Send",
  emptyState: "Hi! Ask me anything about this page.",
};

/** Stable empty array reference for the no-context fallback. */
const EMPTY_MESSAGES: ReadonlyArray<unknown> = [];

export const PilotChatView = forwardRef<PilotChatViewHandle, PilotChatViewProps>(
  function PilotChatView(props, ref: ForwardedRef<PilotChatViewHandle>): ReactNode {
    const {
      greeting,
      className,
      suggestions,
      labels,
      autoFocus = true,
      showSkillsPanel = true,
    } = props;

    const resolved = {
      title: labels?.title ?? DEFAULT_LABELS.title,
      inputPlaceholder: labels?.inputPlaceholder ?? DEFAULT_LABELS.inputPlaceholder,
      sendButton: labels?.sendButton ?? DEFAULT_LABELS.sendButton,
      emptyState: labels?.emptyState ?? DEFAULT_LABELS.emptyState,
    };

    const composerRef = useRef<PilotComposerHandle>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => composerRef.current?.focus(),
        prefill: (text: string) => composerRef.current?.prefill(text),
      }),
      [],
    );

    const chat = useContext(PilotChatContext);

    const handleSend = useCallback(
      (text: string): void => {
        if (!chat) return;
        // sendMessage returns a promise but we don't need to await, the UI
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

    const handlePrefill = useCallback((text: string): void => {
      composerRef.current?.prefill(text);
    }, []);

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

    const messages = chat?.messages ?? EMPTY_MESSAGES;
    const isLoading = chat?.isLoading ?? false;
    const empty: ReactNode = greeting ?? (
      <>
        <span className="pilot-empty-title">{resolved.title}</span>
        <span>{resolved.emptyState}</span>
      </>
    );

    const classes = ["pilot-chat-view", className].filter(Boolean).join(" ");

    return (
      <div className={classes}>
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
            {suggestions.map((text, index) => (
              <button
                key={text}
                type="button"
                className="pilot-suggestion"
                // 60ms stagger, capped so a long suggestion list doesn't drag
                // the UI; the suggestions only render on first-message state.
                style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                onClick={() => handleSuggestion(text)}
                disabled={isLoading}
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}

        {showSkillsPanel ? <PilotSkillsPanel onPickPrompt={handlePrefill} /> : null}

        <PilotComposer
          ref={composerRef}
          onSubmit={handleSend}
          onStop={handleStop}
          isLoading={isLoading}
          placeholder={resolved.inputPlaceholder}
          sendLabel={resolved.sendButton}
          autoFocus={autoFocus}
        />
      </div>
    );
  },
);
