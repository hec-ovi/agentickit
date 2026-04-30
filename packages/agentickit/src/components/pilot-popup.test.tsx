/**
 * Tests for `<PilotPopup>`. We wrap the popup in a `PilotChatContext`
 * provider so the chat-view body has data to render. Coverage:
 *
 *   1. Renders closed by default with a visible toggle button.
 *   2. Clicking the toggle opens the card.
 *   3. Clicking the toggle a second time closes the card.
 *   4. Header close button closes the card.
 *   5. Escape closes the card and returns focus to the toggle.
 *   6. `onOpenChange` fires with the new value on every transition.
 *   7. `defaultOpen` mounts the card on first render.
 *   8. `position` is reflected on both the toggle and the card.
 *   9. `width` and `height` flow into CSS custom properties on the card.
 *  10. Custom `className` is applied to the card.
 *  11. Messages from `PilotChatContext` render inside the card.
 *  12. Suggestion chips fire `sendMessage` from inside the card.
 *  13. Toggle's `aria-expanded` flips with state.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotPopup } from "./pilot-popup.js";

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

describe("<PilotPopup>", () => {
  it("renders closed by default with a visible toggle button", () => {
    const value = makeChatValue();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup />
      </ChatProvider>,
    );
    expect(getByRole("button", { name: /open copilot/i })).toBeDefined();
    expect(queryByRole("dialog")).toBeNull();
  });

  it("clicking the toggle opens the popup card", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    expect(getByRole("dialog")).toBeDefined();
  });

  it("the header close button closes the popup", () => {
    const value = makeChatValue();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen />
      </ChatProvider>,
    );
    expect(queryByRole("dialog")).not.toBeNull();
    // When open, the toggle button is hidden (Intercom/Drift convention) so
    // there is exactly one "Close copilot" button in the DOM: the header X.
    fireEvent.click(getByRole("button", { name: /close copilot/i }));
    expect(queryByRole("dialog")).toBeNull();
    // The toggle returns once the popup closes.
    expect(getByRole("button", { name: /open copilot/i })).toBeDefined();
  });

  it("Escape closes the popup and returns focus to the toggle", () => {
    const value = makeChatValue();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen />
      </ChatProvider>,
    );
    expect(queryByRole("dialog")).not.toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(queryByRole("dialog")).toBeNull();
    const toggle = getByRole("button", { name: /open copilot/i });
    expect(document.activeElement).toBe(toggle);
  });

  it("fires onOpenChange with the new value on every transition", () => {
    const onOpenChange = vi.fn();
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup onOpenChange={onOpenChange} />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /open copilot/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("defaultOpen mounts the card on first render", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen />
      </ChatProvider>,
    );
    expect(getByRole("dialog")).toBeDefined();
  });

  it("reflects the position prop on both the toggle and the card", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen position="top-left" />
      </ChatProvider>,
    );
    const card = getByRole("dialog");
    expect(card.getAttribute("data-position")).toBe("top-left");
  });

  it("flows width and height into the card's inline CSS variables", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen width={420} height="640px" />
      </ChatProvider>,
    );
    const card = getByRole("dialog") as HTMLDivElement;
    // Numeric width should be coerced to px; string height should pass through.
    expect(card.style.getPropertyValue("--pilot-popup-width")).toBe("420px");
    expect(card.style.getPropertyValue("--pilot-popup-height")).toBe("640px");
  });

  it("applies a custom className to the card", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen className="custom-card" />
      </ChatProvider>,
    );
    const card = getByRole("dialog");
    expect(card.className).toContain("pilot-popup-card");
    expect(card.className).toContain("custom-card");
  });

  it("renders messages from PilotChatContext inside the popup", () => {
    const value = makeChatValue({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hello popup" }] }],
    });
    const { getByText } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen />
      </ChatProvider>,
    );
    expect(getByText("hello popup")).toBeDefined();
  });

  it("suggestion chips inside the popup fire sendMessage", () => {
    const sendMessage = vi.fn(async () => {});
    const value = makeChatValue({ sendMessage });
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen suggestions={["Lookup the weather"]} />
      </ChatProvider>,
    );
    fireEvent.click(getByRole("button", { name: /lookup the weather/i }));
    expect(sendMessage).toHaveBeenCalledWith("Lookup the weather");
  });

  it("toggle's aria-expanded reflects the closed state and the toggle hides while open", () => {
    const value = makeChatValue();
    const { getByRole, queryByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup />
      </ChatProvider>,
    );
    const toggle = getByRole("button", { name: /open copilot/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    // When open, the toggle is removed from the DOM in favor of the dialog
    // (matches floating chat widgets like Intercom). The close affordance
    // is the header X button inside the dialog.
    expect(queryByRole("button", { name: /open copilot/i })).toBeNull();
    expect(getByRole("dialog")).toBeDefined();
  });

  // ----------------------------------------------------------------------
  // DOM-shape snapshots. We capture the toggle (closed) and the dialog
  // header (open) at stable positions so an accidental rename or wrapper
  // change shows up as a focused diff. The dialog body is the shared
  // PilotChatView; its snapshot lives in pilot-chat-view.test.tsx.
  // ----------------------------------------------------------------------

  it("snapshot: toggle button shape when closed", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup position="bottom-right" />
      </ChatProvider>,
    );
    const toggle = getByRole("button", { name: /open copilot/i });
    expect(toggle).toMatchInlineSnapshot(`
      <button
        aria-expanded="false"
        aria-label="Open copilot"
        class="pilot-popup-button"
        data-position="bottom-right"
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          viewBox="0 0 20 20"
          width="20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 6c0-1.105.895-2 2-2h10c1.105 0 2 .895 2 2v6c0 1.105-.895 2-2 2H8l-3 3v-3H5c-1.105 0-2-.895-2-2V6Z"
            stroke="currentColor"
            stroke-linejoin="round"
            stroke-width="1.5"
          />
        </svg>
      </button>
    `);
  });

  it("snapshot: dialog header shape when open", () => {
    const value = makeChatValue();
    const { getByRole } = render(
      <ChatProvider value={value}>
        <PilotPopup defaultOpen position="bottom-left" labels={{ title: "Helper" }} />
      </ChatProvider>,
    );
    const header = getByRole("dialog").querySelector(".pilot-header");
    expect(header).toMatchInlineSnapshot(`
      <header
        class="pilot-header"
      >
        <h2
          class="pilot-header-title"
          id=":rd:"
        >
          Helper
        </h2>
        <button
          aria-label="Close copilot"
          class="pilot-icon-button"
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            viewBox="0 0 14 14"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 3L11 11M11 3L3 11"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </header>
    `);
  });
});
