/**
 * Tests for `<PilotSidebar>`. We wrap the sidebar in a minimal
 * `PilotChatContext.Provider` rather than mounting the real `<Pilot>` so
 * each test can set `messages`, `isLoading`, and `error` deterministically.
 *
 * We verify:
 *   1. Rendering closed by default and the toggle button is visible.
 *   2. Clicking the toggle opens the sidebar.
 *   3. Greeting + empty state render when messages are empty.
 *   4. User + assistant messages render with their content.
 *   5. Tool-call parts surface the tool name.
 *   6. Suggestion chips call sendMessage with their label.
 *   7. The stop button replaces send while isLoading.
 *   8. Escape closes the sidebar.
 *   9. The input auto-focuses after opening.
 *  10. `className` is applied to the sidebar root.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactNode, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotSidebar } from "./pilot-sidebar.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Build a `PilotChatContextValue` with sensible defaults. Tests override only
 * the fields they care about; the rest are no-op shims.
 */
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

describe("<PilotSidebar>", () => {
  it("renders closed by default with a visible toggle button", () => {
    const value = makeChatValue();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar />
      </ChatProvider>,
    );
    // The toggle button is labeled; the sidebar aside is not yet mounted.
    expect(getByRole("button", { name: /open copilot/i })).toBeDefined();
    expect(queryByRole("complementary")).toBeNull();
  });

  it("opens the sidebar when the toggle is clicked", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    expect(getByRole("complementary")).toBeDefined();
  });

  it("renders greeting and empty state when there are no messages", () => {
    const value = makeChatValue();
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen greeting={<span>hello world greeting</span>} />
      </ChatProvider>,
    );
    expect(getByText(/hello world greeting/i)).toBeDefined();
  });

  it("renders user and assistant messages with their text content", () => {
    const value = makeChatValue({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hello copilot" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "hello back, friend" }],
        },
      ],
    });
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(getByText("hello copilot")).toBeDefined();
    expect(getByText("hello back, friend")).toBeDefined();
  });

  it("renders a tool-call part with the tool name visible", () => {
    const value = makeChatValue({
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-createCard",
              toolCallId: "call-1",
              state: "output-available",
              input: { title: "Acme" },
              output: { ok: true },
            },
          ],
        },
      ],
    });
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(getByText("createCard")).toBeDefined();
  });

  it("clicking a suggestion chip calls sendMessage with that text", () => {
    const sendMessage = vi.fn(async () => {});
    const value = makeChatValue({ sendMessage });
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen suggestions={["Summarize this page", "Draft an email"]} />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /summarize this page/i }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("Summarize this page");
  });

  it("shows a stop button while isLoading and calls stop() when clicked", () => {
    const stop = vi.fn(async () => {});
    const value = makeChatValue({ isLoading: true, status: "streaming", stop });
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(queryByRole("button", { name: /^send$/i })).toBeNull();
    const stopBtn = getByRole("button", { name: /stop generating/i });
    fireEvent.click(stopBtn);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("closes when Escape is pressed", () => {
    const value = makeChatValue();
    const { queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(queryByRole("complementary")).not.toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(queryByRole("complementary")).toBeNull();
  });

  it("focuses the input textarea when the sidebar opens", () => {
    // Start closed, then toggle open, and confirm focus landed on the
    // textarea — that's the most UX-critical path.
    const value = makeChatValue();

    function Harness(): ReactNode {
      // Stable value memoized so each render doesn't tear the context down.
      const memoedValue = useMemo(() => value, []);
      // Parent controls nothing — PilotSidebar manages its own open state.
      const [, setX] = useState(0);
      return (
        <ChatProvider value={memoedValue}>
          <button type="button" onClick={() => setX((n) => n + 1)}>
            noop
          </button>
          <PilotSidebar />
        </ChatProvider>
      );
    }

    const { getByRole } = render(<Harness />);
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    const textarea = getByRole("textbox");
    expect(document.activeElement).toBe(textarea);
  });

  it("applies the className prop to the sidebar root element", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen className="my-custom-class" />
      </ChatProvider>,
    );
    const root = getByRole("complementary");
    expect(root.className).toContain("pilot-sidebar");
    expect(root.className).toContain("my-custom-class");
  });

  it("renders a dismissible error banner when chat.error is set", () => {
    const value = makeChatValue({
      error: new Error("network down"),
      status: "error",
    });
    const { getByRole, queryByText } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(queryByText(/network down/i)).not.toBeNull();
    fireEvent.click(getByRole("button", { name: /dismiss error/i }));
    expect(queryByText(/network down/i)).toBeNull();
  });
});

/**
 * Controlled `open` API tests. These exist as a regression sentinel for the
 * "sidebar collapses when the parent rebuilds <Pilot runtime={...}>" bug
 * (the sidebar's internal open state would reset on remount). Lifting state
 * to the parent via the controlled `open` prop is the workaround the
 * example uses; these tests pin the contract.
 */
describe("<PilotSidebar> controlled `open` API", () => {
  it("uncontrolled mode (no open prop): toggle button flips internal state", () => {
    const value = makeChatValue();
    const onOpenChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    expect(queryByRole("complementary")).toBeNull();
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    expect(getByRole("complementary")).toBeDefined();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("controlled mode (open=true): renders open regardless of internal state", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar open onOpenChange={vi.fn()} />
      </ChatProvider>,
    );
    expect(getByRole("complementary")).toBeDefined();
  });

  it("controlled mode (open=false): renders closed regardless of internal state", () => {
    const value = makeChatValue();
    const { queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar open={false} onOpenChange={vi.fn()} />
      </ChatProvider>,
    );
    expect(queryByRole("complementary")).toBeNull();
  });

  it("controlled mode: clicking toggle does NOT flip internal state, only fires onOpenChange", () => {
    const value = makeChatValue();
    const onOpenChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar open={false} onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    // Sidebar is closed because controlled prop says so.
    expect(queryByRole("complementary")).toBeNull();
    // Click the toggle. In controlled mode, this MUST NOT flip internal
    // state; the consumer's onOpenChange handler gets the new value and
    // is responsible for re-rendering with `open={true}`.
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The sidebar remains closed because the controlled prop is still false
    // (the parent did not re-render us with a new value).
    expect(queryByRole("complementary")).toBeNull();
  });

  it("controlled mode: parent flipping `open` from outside makes the sidebar follow", () => {
    const value = makeChatValue();
    function Wrapper(): ReactNode {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="external" onClick={() => setOpen((p) => !p)}>
            external toggle
          </button>
          <ChatProvider value={value}>
            <PilotSidebar open={open} onOpenChange={setOpen} />
          </ChatProvider>
        </>
      );
    }
    const { getByTestId, queryByRole, getByRole } = render(<Wrapper />);
    expect(queryByRole("complementary")).toBeNull();
    fireEvent.click(getByTestId("external"));
    expect(getByRole("complementary")).toBeDefined();
    fireEvent.click(getByTestId("external"));
    expect(queryByRole("complementary")).toBeNull();
  });

  it("controlled mode: Escape fires onOpenChange(false) but does NOT close the sidebar without a re-render", () => {
    const value = makeChatValue();
    const onOpenChange = vi.fn();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar open onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    expect(getByRole("complementary")).toBeDefined();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    // Notification fired so the consumer can choose to close.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // But the sidebar stays open because the controlled prop is still true
    // (the consumer did not re-render us with a new value). This is the
    // intentional contract of controlled mode.
    expect(getByRole("complementary")).toBeDefined();
  });

  it("controlled mode: onOpenChange does NOT fire when the prop value did not actually change", () => {
    const value = makeChatValue();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ChatProvider value={value}>
        <PilotSidebar open onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    // Re-render with the SAME open value. No notification should fire,
    // because nothing changed; firing here would be a feedback-loop bait.
    onOpenChange.mockClear();
    rerender(
      <ChatProvider value={value}>
        <PilotSidebar open onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("uncontrolled mode: defaultOpen=true seeds internal state to open", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen />
      </ChatProvider>,
    );
    expect(getByRole("complementary")).toBeDefined();
  });

  it("controlled mode: `open` overrides `defaultOpen` (controlled wins)", () => {
    const value = makeChatValue();
    const { queryByRole } = render(
      <ChatProvider value={value}>
        <PilotSidebar defaultOpen open={false} onOpenChange={vi.fn()} />
      </ChatProvider>,
    );
    // defaultOpen would say "open", but controlled `open={false}` wins.
    expect(queryByRole("complementary")).toBeNull();
  });
});
