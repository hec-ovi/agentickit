/**
 * Component-level integration tests for <Pilot>.
 *
 * The earlier test file deliberately avoided triggering any `sendMessage`
 * calls; it only checked rendering and context wiring. That left the
 * entire tool-calling lifecycle — which is the whole point of the
 * package — unverified end-to-end. This file fills that gap.
 *
 * The harness mounts a real <Pilot> with a test widget that registers
 * one action via `usePilotAction`, installs a scripted fetch mock that
 * plays back UI-message SSE frames captured from real vLLM runs, and
 * then asserts on three observable things:
 *
 *   1. The DOM — the state we expect after the tool fires.
 *   2. The handler — how many times and with what arguments.
 *   3. The fetch count — so infinite loops are caught in CI, not in
 *      production.
 *
 * Both bugs that bit us in April 2026 are covered:
 *   - Missing `tool-input-available` (handler never fires).
 *   - Infinite re-POST after a text reply (loop drains tokens).
 * If the package regresses on either, one of these tests goes red.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext, useState } from "react";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import { usePilotState } from "../hooks/use-pilot-state.js";
import {
  installPilotFetchMock,
  type MockPilotFetchController,
  textReplyTurn,
  toolCallTurn,
} from "../test-utils/stream-mock.js";
import { Pilot } from "./pilot-provider.js";

// ---------------------------------------------------------------------------
// Test harness: a tiny todo widget plus a button that fires sendMessage.
// Encapsulated so each test can read/write the same observable surface
// without duplicating the plumbing.
// ---------------------------------------------------------------------------

interface HarnessRefs {
  addTodoHandler: ReturnType<typeof vi.fn>;
  unknownToolHandler: ReturnType<typeof vi.fn>;
}

function TodoWidget({ refs }: { refs: HarnessRefs }) {
  const [todos, setTodos] = useState<string[]>([]);

  usePilotState({
    name: "todos",
    description: "Current todos.",
    value: todos,
    schema: z.array(z.string()),
  });

  usePilotAction({
    name: "add_todo",
    description: "Append a todo.",
    parameters: z.object({ text: z.string() }),
    handler: (args) => {
      refs.addTodoHandler(args);
      setTodos((prev) => [...prev, args.text]);
      return { ok: true };
    },
  });

  return (
    <ul data-testid="todos">
      {todos.map((text, i) => (
        <li key={`${i}-${text}`} data-testid="todo-item">
          {text}
        </li>
      ))}
    </ul>
  );
}

function ChatDriver() {
  const chat = useChatOrNull();
  if (!chat) return null;
  // Render any assistant text/tool-error so tests can assert on message
  // surfaces, not just state mutations. Keeps the harness free of the
  // full PilotSidebar (which has its own styling + suggestion logic
  // unrelated to the behavior we want to verify here).
  return (
    <div>
      <button
        type="button"
        data-testid="send"
        onClick={() => void chat.sendMessage("do the thing")}
      >
        send
      </button>
      <div data-testid="messages">
        {chat.messages.flatMap((msg, mi) => {
          const parts = Array.isArray(msg.parts) ? msg.parts : [];
          return parts.map((part, pi) => {
            const p = part as { type?: string; text?: string; errorText?: string; state?: string };
            if (p.type === "text" && typeof p.text === "string") {
              return (
                <p key={`${mi}-${pi}`} data-testid="assistant-text">
                  {p.text}
                </p>
              );
            }
            if (
              (p.type === "dynamic-tool" || (p.type && p.type.startsWith("tool-"))) &&
              p.state === "output-error" &&
              typeof p.errorText === "string"
            ) {
              return (
                <p key={`${mi}-${pi}`} data-testid="tool-error">
                  {p.errorText}
                </p>
              );
            }
            return null;
          });
        })}
      </div>
    </div>
  );
}

// Named helper so the driver component reads `chat` at the top level
// without cluttering every place where the context is consumed.
function useChatOrNull(): PilotChatContextValue | null {
  return useContext(PilotChatContext);
}

function renderHarness(): HarnessRefs {
  const refs: HarnessRefs = {
    addTodoHandler: vi.fn(),
    unknownToolHandler: vi.fn(),
  };
  render(
    <Pilot apiUrl="/api/pilot">
      <TodoWidget refs={refs} />
      <ChatDriver />
    </Pilot>,
  );
  return refs;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let mock: MockPilotFetchController;

beforeEach(() => {
  mock = installPilotFetchMock();
});

afterEach(() => {
  mock.restore();
  cleanup();
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("<Pilot> integration — happy tool loop", () => {
  it("dispatches the tool call, updates state, and stops after the text reply", async () => {
    // Two scripted turns:
    //   1. Assistant calls add_todo({"text":"buy milk"}).
    //   2. After the client reports success, assistant replies with text.
    mock.push(
      toolCallTurn({ toolCallId: "c1", toolName: "add_todo", input: { text: "buy milk" } }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Added." }));

    const refs = renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    // Wait for the DOM to reflect the tool execution.
    await waitFor(() => {
      expect(screen.queryByText("buy milk")).not.toBeNull();
    });

    // Handler was invoked once with the exact input the script delivered.
    expect(refs.addTodoHandler).toHaveBeenCalledTimes(1);
    expect(refs.addTodoHandler).toHaveBeenCalledWith({ text: "buy milk" });

    // And now the tight loop assertion: after the text reply lands, no
    // further POST should fire. Wait long enough that any spurious
    // resubmission would happen in the background, then re-check.
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(2);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — loop prevention (3 tool calls + text)", () => {
  it("makes exactly 4 POSTs for a 3-tool-then-text conversation", async () => {
    mock.push(
      toolCallTurn({ toolCallId: "c1", toolName: "add_todo", input: { text: "buy milk" } }),
    );
    mock.push(
      toolCallTurn({ toolCallId: "c2", toolName: "add_todo", input: { text: "call mom" } }),
    );
    mock.push(
      toolCallTurn({ toolCallId: "c3", toolName: "add_todo", input: { text: "pay rent" } }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Done with all three." }));

    const refs = renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByText("pay rent")).not.toBeNull();
    });
    expect(refs.addTodoHandler).toHaveBeenCalledTimes(3);
    expect(refs.addTodoHandler.mock.calls.map((call) => call[0])).toEqual([
      { text: "buy milk" },
      { text: "call mom" },
      { text: "pay rent" },
    ]);

    // Four requests total: initial + 3 auto-resubmits driven by tool
    // outputs. After the text reply there must be none.
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(4);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(mock.pilotPostCount()).toBe(4);
  });
});

describe("<Pilot> integration — unknown tool errors cleanly", () => {
  it("reports output-error for an unregistered tool and does not loop", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "nonexistent_tool",
        input: { foo: "bar" },
      }),
    );
    // After the client reports the error, the model's next turn is text.
    mock.push(textReplyTurn({ id: "t1", text: "Sorry, I couldn't do that." }));

    renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByText("Sorry, I couldn't do that.")).not.toBeNull();
    });

    // Exactly two POSTs, no runaway loop.
    expect(mock.pilotPostCount()).toBe(2);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});
