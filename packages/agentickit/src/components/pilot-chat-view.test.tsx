/**
 * Tests for `<PilotChatView>`, the headless body shared by every form
 * factor. We wrap the view in a minimal `PilotChatContext.Provider` so
 * each test can set messages, isLoading, and error deterministically
 * without crossing the network boundary.
 *
 * Coverage:
 *   1. Empty state renders the default greeting from labels.
 *   2. Custom `greeting` prop overrides the default.
 *   3. User and assistant messages render.
 *   4. Suggestion chips fire `sendMessage` with the chip text.
 *   5. Suggestions are hidden once any message exists.
 *   6. Error banner renders and dismisses cleanly.
 *   7. Stop button replaces send while `isLoading` is true.
 *   8. Skills panel can be hidden via `showSkillsPanel={false}`.
 *   9. Imperative `focus()` and `prefill()` via ref hit the composer.
 *  10. Custom `className` is concatenated with `pilot-chat-view`.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactNode, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotChatView, type PilotChatViewHandle } from "./pilot-chat-view.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeChatValue(overrides: Partial<PilotChatContextValue> = {}): PilotChatContextValue {
  return {
    messages: [],
    status: "ready",
    error: undefined,
    isLoading: false,
    sendMessage: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    ...overrides,
  };
}

function ChatProvider(props: { children: ReactNode; value: PilotChatContextValue }): ReactNode {
  return (
    <PilotChatContext.Provider value={props.value}>{props.children}</PilotChatContext.Provider>
  );
}

describe("<PilotChatView>", () => {
  it("renders the default empty-state title and body when there are no messages", () => {
    const value = makeChatValue();
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotChatView labels={{ title: "Helper", emptyState: "How can I assist?" }} />
      </ChatProvider>,
    );
    expect(getByText("Helper")).toBeDefined();
    expect(getByText("How can I assist?")).toBeDefined();
  });

  it("renders a custom greeting when provided, overriding labels", () => {
    const value = makeChatValue();
    const { getByText, queryByText } = render(
      <ChatProvider value={value}>
        <PilotChatView
          greeting={<span>Custom greeting block</span>}
          labels={{ emptyState: "DEFAULT" }}
        />
      </ChatProvider>,
    );
    expect(getByText("Custom greeting block")).toBeDefined();
    expect(queryByText("DEFAULT")).toBeNull();
  });

  it("renders user and assistant messages with their text content", () => {
    const value = makeChatValue({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "what is 2+2?" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "the answer is 4" }] },
      ],
    });
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotChatView />
      </ChatProvider>,
    );
    expect(getByText("what is 2+2?")).toBeDefined();
    expect(getByText("the answer is 4")).toBeDefined();
  });

  it("clicking a suggestion chip calls sendMessage with the chip text", () => {
    const sendMessage = vi.fn(async () => {});
    const value = makeChatValue({ sendMessage });
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotChatView suggestions={["Summarize", "Translate"]} />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /summarize/i }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("Summarize");
  });

  it("hides suggestions once at least one message exists", () => {
    const value = makeChatValue({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    });
    const { queryByRole } = render(
      <ChatProvider value={value}>
        <PilotChatView suggestions={["A", "B"]} />
      </ChatProvider>,
    );
    expect(queryByRole("button", { name: /^a$/i })).toBeNull();
    expect(queryByRole("button", { name: /^b$/i })).toBeNull();
  });

  it("renders a dismissible error banner when chat.error is set", () => {
    const value = makeChatValue({ error: new Error("backend exploded"), status: "error" });
    const { getByRole, queryByText } = render(
      <ChatProvider value={value}>
        <PilotChatView />
      </ChatProvider>,
    );
    expect(queryByText(/backend exploded/i)).not.toBeNull();
    fireEvent.click(getByRole("button", { name: /dismiss error/i }));
    expect(queryByText(/backend exploded/i)).toBeNull();
  });

  it("swaps send for stop while isLoading and stop() fires when clicked", () => {
    const stop = vi.fn(async () => {});
    const value = makeChatValue({ isLoading: true, status: "streaming", stop });
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotChatView />
      </ChatProvider>,
    );
    expect(queryByRole("button", { name: /^send$/i })).toBeNull();
    fireEvent.click(getByRole("button", { name: /stop generating/i }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("hides the skills panel when showSkillsPanel is false", () => {
    const value = makeChatValue();
    const { queryByRole } = render(
      <ChatProvider value={value}>
        <PilotChatView showSkillsPanel={false} />
      </ChatProvider>,
    );
    // The skills-panel toggle is a button, when no Pilot registry context
    // is mounted, the panel returns null anyway, so the assertion is that
    // setting `showSkillsPanel={false}` produces no skills-panel button
    // even if a registry were present (the panel isn't rendered at all).
    expect(queryByRole("button", { name: /what can this copilot do/i })).toBeNull();
  });

  it("exposes focus() and prefill() via the imperative ref", () => {
    const value = makeChatValue();
    const ref = createRef<PilotChatViewHandle>();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotChatView ref={ref} autoFocus={false} />
      </ChatProvider>,
    );
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    expect(document.activeElement).not.toBe(textarea);
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement).toBe(textarea);
    act(() => {
      ref.current?.prefill("hello world");
    });
    expect(textarea.value).toBe("hello world");
  });

  it("applies a custom className alongside the base class", () => {
    const value = makeChatValue();
    const { container } = render(
      <ChatProvider value={value}>
        <PilotChatView className="my-extra" />
      </ChatProvider>,
    );
    const root = container.querySelector(".pilot-chat-view");
    expect(root).not.toBeNull();
    expect(root?.className).toContain("pilot-chat-view");
    expect(root?.className).toContain("my-extra");
  });

  // ----------------------------------------------------------------------
  // DOM-shape snapshots. These don't replace the behavioral tests above;
  // they catch unintended structural changes (an extra wrapper div, a
  // dropped data-testid, a class rename) that wouldn't fail any
  // role/text/click assertion. We use inline snapshots so a regression
  // surfaces as a focused diff in the test file itself.
  //
  // We snapshot the chat-view root (`.pilot-chat-view`) rather than the
  // full container so the harness wrapper doesn't drift the snapshot on
  // unrelated harness changes.
  // ----------------------------------------------------------------------

  it("snapshot: empty state shape with default labels", () => {
    const value = makeChatValue();
    const { container } = render(
      <ChatProvider value={value}>
        <PilotChatView autoFocus={false} />
      </ChatProvider>,
    );
    const root = container.querySelector(".pilot-chat-view");
    expect(root).toMatchInlineSnapshot(`
      <div
        class="pilot-chat-view"
      >
        <div
          class="pilot-messages"
          data-testid="pilot-messages"
        >
          <div
            class="pilot-empty"
            role="note"
          >
            <span
              class="pilot-empty-title"
            >
              Copilot
            </span>
            <span>
              Hi! Ask me anything about this page.
            </span>
          </div>
        </div>
        bound HTMLFormElement {
          "0": <textarea
            aria-label="Ask me anything..."
            placeholder="Ask me anything..."
            rows="1"
            style="height: 0px;"
          />,
          "1": <button
            aria-label="Send"
            class="pilot-send"
            disabled=""
            type="submit"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="14"
              viewBox="0 0 16 16"
              width="14"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
          </button>,
        }
      </div>
    `);
  });

  it("snapshot: error banner shape when chat.error is set", () => {
    const value = makeChatValue({
      error: new Error("snap-err"),
      status: "error",
    });
    const { container } = render(
      <ChatProvider value={value}>
        <PilotChatView autoFocus={false} />
      </ChatProvider>,
    );
    const banner = container.querySelector(".pilot-error");
    expect(banner).toMatchInlineSnapshot(`
      <div
        class="pilot-error"
        role="alert"
      >
        <span
          class="pilot-error-message"
        >
          snap-err
        </span>
        <button
          aria-label="Dismiss error"
          class="pilot-error-dismiss"
          type="button"
        >
          ×
        </button>
      </div>
    `);
  });
});
