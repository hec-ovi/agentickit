/**
 * Tests for `<PilotModal>`. Controlled-only API: every test owns the
 * `open` state via a tiny `Harness` so the assertion target is whatever
 * `onOpenChange` is called with. Coverage:
 *
 *   1. Renders nothing when open is false.
 *   2. Renders the dialog (portaled to body) when open is true.
 *   3. Backdrop click fires onOpenChange(false).
 *   4. Click inside the card does NOT fire onOpenChange (drag-out fix).
 *   5. Escape fires onOpenChange(false).
 *   6. Header close button fires onOpenChange(false).
 *   7. Width/height flow into CSS custom properties.
 *   8. Custom className is applied to the card.
 *   9. Messages from PilotChatContext render inside the modal.
 *  10. Composer focus moves to the textarea on open.
 *  11. Suggestion chips fire sendMessage.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { PilotModal, type PilotModalProps } from "./pilot-modal.js";

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

interface HarnessProps {
  initial?: boolean;
  chat: PilotChatContextValue;
  /** Spy installed inside the harness so transitions are observable. */
  onOpenChange?: (open: boolean) => void;
  modalProps?: Omit<PilotModalProps, "open" | "onOpenChange">;
}

function Harness(props: HarnessProps): ReactNode {
  const { initial = true, chat, onOpenChange, modalProps } = props;
  const [open, setOpen] = useState(initial);
  return (
    <PilotChatContext.Provider value={chat}>
      <button
        type="button"
        data-testid="external-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        toggle
      </button>
      <PilotModal
        {...modalProps}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
      />
    </PilotChatContext.Provider>
  );
}

describe("<PilotModal>", () => {
  it("renders nothing when open is false", () => {
    const chat = makeChatValue();
    const { queryByRole } = render(<Harness initial={false} chat={chat} />);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog when open is true (portaled to <body>)", () => {
    const chat = makeChatValue();
    const { getByRole } = render(<Harness chat={chat} />);
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Portaled, dialog lives directly in <body>, not inside the harness wrapper.
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("clicking the backdrop fires onOpenChange(false)", () => {
    const chat = makeChatValue();
    const onOpenChange = vi.fn();
    const { container, queryByRole } = render(
      <Harness chat={chat} onOpenChange={onOpenChange} />,
    );
    // The backdrop is portaled to <body>; query inside document.body.
    const backdrop = document.body.querySelector(".pilot-modal-backdrop") as HTMLDivElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(queryByRole("dialog")).toBeNull();
    // `container` is referenced for parity with other tests; the harness
    // owns its trigger node here.
    expect(container).toBeDefined();
  });

  it("clicking inside the card does NOT close the modal", () => {
    const chat = makeChatValue();
    const onOpenChange = vi.fn();
    const { getByRole } = render(<Harness chat={chat} onOpenChange={onOpenChange} />);
    const card = getByRole("dialog");
    // Click the dialog (card) directly; the backdrop handler ignores it
    // because target !== currentTarget.
    fireEvent.click(card);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Escape fires onOpenChange(false)", () => {
    const chat = makeChatValue();
    const onOpenChange = vi.fn();
    const { queryByRole } = render(<Harness chat={chat} onOpenChange={onOpenChange} />);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("the header close button fires onOpenChange(false)", () => {
    const chat = makeChatValue();
    const onOpenChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <Harness chat={chat} onOpenChange={onOpenChange} />,
    );
    fireEvent.click(getByRole("button", { name: /close copilot/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("flows width and height into the card's inline CSS variables", () => {
    const chat = makeChatValue();
    const { getByRole } = render(
      <Harness chat={chat} modalProps={{ width: 800, height: "75vh" }} />,
    );
    const card = getByRole("dialog") as HTMLDivElement;
    expect(card.style.getPropertyValue("--pilot-modal-width")).toBe("800px");
    expect(card.style.getPropertyValue("--pilot-modal-height")).toBe("75vh");
  });

  it("applies a custom className to the card", () => {
    const chat = makeChatValue();
    const { getByRole } = render(
      <Harness chat={chat} modalProps={{ className: "branded-modal" }} />,
    );
    const card = getByRole("dialog");
    expect(card.className).toContain("pilot-modal-card");
    expect(card.className).toContain("branded-modal");
  });

  it("renders messages from PilotChatContext inside the modal", () => {
    const chat = makeChatValue({
      messages: [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "modal speaks" }] }],
    });
    const { getByText } = render(<Harness chat={chat} />);
    expect(getByText("modal speaks")).toBeDefined();
  });

  it("focus moves to the composer textarea when the modal opens", () => {
    const chat = makeChatValue();
    const { getByRole } = render(<Harness chat={chat} />);
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
  });

  it("suggestion chips inside the modal fire sendMessage", () => {
    const sendMessage = vi.fn(async () => {});
    const chat = makeChatValue({ sendMessage });
    const { getByRole } = render(
      <Harness chat={chat} modalProps={{ suggestions: ["Plan my week"] }} />,
    );
    fireEvent.click(getByRole("button", { name: /plan my week/i }));
    expect(sendMessage).toHaveBeenCalledWith("Plan my week");
  });

  it("Tab from the last focusable element wraps back to the first (focus trap)", () => {
    const chat = makeChatValue();
    const { getByRole } = render(<Harness chat={chat} />);
    const dialog = getByRole("dialog");
    // Find the last focusable inside the dialog. The send button is disabled
    // when the textarea is empty, so the last focusable is typically the
    // textarea itself (the only enabled control besides the close-X). Whatever
    // it is, focus it explicitly and Tab, focus must move into the dialog,
    // not out behind the backdrop.
    const focusables = dialog.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    expect(focusables.length).toBeGreaterThan(0);
    const last = focusables[focusables.length - 1] as HTMLElement;
    const first = focusables[0] as HTMLElement;
    act(() => {
      last.focus();
    });
    expect(document.activeElement).toBe(last);
    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from the first focusable wraps to the last (focus trap)", () => {
    const chat = makeChatValue();
    const { getByRole } = render(<Harness chat={chat} />);
    const dialog = getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    act(() => {
      first.focus();
    });
    expect(document.activeElement).toBe(first);
    act(() => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });
    expect(document.activeElement).toBe(last);
  });

  // --------------------------------------------------------------------
  // DOM-shape snapshots: capture the dialog wrapper at open=true so an
  // accidental rename or aria-attribute change surfaces in the test
  // file. The full body is PilotChatView; its snapshot lives there.
  // --------------------------------------------------------------------
  it("snapshot: dialog header shape when open", () => {
    const chat = makeChatValue();
    const { getByRole } = render(<Harness chat={chat} />);
    const header = getByRole("dialog").querySelector(".pilot-header");
    expect(header).toMatchInlineSnapshot(`
      <header
        class="pilot-header"
      >
        <h2
          class="pilot-header-title"
          id=":rd:"
        >
          Copilot
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

  it("snapshot: returns null when open is false", () => {
    const chat = makeChatValue();
    const { container } = render(<Harness initial={false} chat={chat} />);
    // No dialog node exists in body or container.
    expect(document.body.querySelector(".pilot-modal-card")).toBeNull();
    expect(container.querySelector(".pilot-modal-card")).toBeNull();
  });

  it("focus restores to the previously-focused element on close", () => {
    const chat = makeChatValue();
    // Render a button outside the modal that we focus before opening, then
    // open the modal, then close it. After close, focus must return to that
    // external button, not be left on body.
    function Harness2(): ReactNode {
      const [open, setOpen] = useState(false);
      return (
        <PilotChatContext.Provider value={chat}>
          <button
            type="button"
            data-testid="external"
            onClick={() => setOpen(true)}
          >
            open
          </button>
          <PilotModal open={open} onOpenChange={setOpen} />
        </PilotChatContext.Provider>
      );
    }
    const { getByTestId, queryByRole } = render(<Harness2 />);
    const external = getByTestId("external") as HTMLButtonElement;
    act(() => {
      external.focus();
    });
    expect(document.activeElement).toBe(external);
    fireEvent.click(external);
    // Modal is now open; composer textarea has focus.
    expect(queryByRole("dialog")).not.toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(external);
  });
});
