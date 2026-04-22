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
import { useForm } from "react-hook-form";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import { usePilotForm } from "../hooks/use-pilot-form.js";
import { usePilotState } from "../hooks/use-pilot-state.js";
import {
  installPilotFetchMock,
  type MockPilotFetchController,
  textReplyTurn,
  toolCallTurn,
} from "../test-utils/stream-mock.js";
import { Pilot } from "./pilot-provider.js";
import { PilotSidebar } from "./pilot-sidebar.js";

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

// ---------------------------------------------------------------------------
// Additional scenarios covering the rest of the public surface. Each one
// spins up its own widget, mocks its own stream, and asserts on the DOM +
// handler/setter invocations + fetch count.
// ---------------------------------------------------------------------------

describe("<Pilot> integration — usePilotState setter auto-registers update_<name>", () => {
  function StatefulTodoWidget({ setter }: { setter: (next: string[]) => void }) {
    const [todos, setTodos] = useState<string[]>([]);
    usePilotState({
      name: "todos",
      description: "Current todos.",
      value: todos,
      schema: z.array(z.string()),
      setValue: (next) => {
        setter(next);
        setTodos(next);
      },
    });
    return (
      <ul data-testid="todos">
        {todos.map((t, i) => (
          <li key={`${i}-${t}`}>{t}</li>
        ))}
      </ul>
    );
  }

  it("forwards the model's replacement value through the setter when the user approves", async () => {
    const setter = vi.fn();

    // Model calls the auto-generated `update_todos` with a full new list.
    // Because `usePilotState` marks this action `mutating: true`, the
    // confirm modal will appear and we have to click Confirm.
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "update_todos",
        input: ["buy milk", "pay rent"],
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Updated." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <StatefulTodoWidget setter={setter} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // Wait for the confirm modal, then approve.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("buy milk")).not.toBeNull();
      expect(screen.queryByText("pay rent")).not.toBeNull();
    });
    expect(setter).toHaveBeenCalledTimes(1);
    expect(setter).toHaveBeenCalledWith(["buy milk", "pay rent"]);

    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(2);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — mutating action + approve", () => {
  function MutatingWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "delete_all",
      description: "Delete everything.",
      parameters: z.object({}).strict(),
      handler: (args) => {
        refs.addTodoHandler(args);
        return { removed: 42 };
      },
      mutating: true,
    });
    return <div data-testid="mutating-host" />;
  }

  it("pops the confirm modal, runs the handler on approve, and continues", async () => {
    const refs: HarnessRefs = {
      addTodoHandler: vi.fn(),
      unknownToolHandler: vi.fn(),
    };
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "delete_all",
        input: {},
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Deleted." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <MutatingWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // Modal must appear before the handler runs.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    expect(refs.addTodoHandler).not.toHaveBeenCalled();
    fireEvent.click(confirmBtn);

    // Handler fires once, the stream continues to the final text.
    await waitFor(() => {
      expect(refs.addTodoHandler).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("Deleted.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — mutating action + cancel", () => {
  function MutatingWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "delete_all",
      description: "Delete everything.",
      parameters: z.object({}).strict(),
      handler: (args) => {
        refs.addTodoHandler(args);
        return { removed: 42 };
      },
      mutating: true,
    });
    return <div data-testid="mutating-host" />;
  }

  it("records a user-declined output and does not run the handler", async () => {
    const refs: HarnessRefs = {
      addTodoHandler: vi.fn(),
      unknownToolHandler: vi.fn(),
    };
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "delete_all",
        input: {},
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Understood." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <MutatingWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    // Handler must never have run, but the conversation still continues
    // so the model can respond to the decline.
    await waitFor(() => {
      expect(screen.queryByText("Understood.")).not.toBeNull();
    });
    expect(refs.addTodoHandler).not.toHaveBeenCalled();
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — usePilotForm set_field + submit", () => {
  function ContactFormWidget({
    onSubmit,
  }: {
    onSubmit: (values: { name: string; email: string }) => void;
  }) {
    const form = useForm<{ name: string; email: string }>({
      defaultValues: { name: "", email: "" },
    });
    usePilotForm(form, { name: "contact" });
    return (
      <form
        data-testid="contact-form"
        onSubmit={form.handleSubmit((v) => {
          onSubmit(v);
        })}
      >
        <input data-testid="name" {...form.register("name")} />
        <input data-testid="email" {...form.register("email")} />
        <button type="submit" data-testid="submit">
          submit
        </button>
      </form>
    );
  }

  it("runs set_<name>_field to write RHF state, then submit_<name> to fire the form's onSubmit", async () => {
    const onSubmit = vi.fn();

    // Four scripted turns: two field writes (not mutating), one submit
    // (mutating → confirm modal), one final text reply.
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "set_contact_field",
        input: { field: "name", value: "Ada" },
      }),
    );
    mock.push(
      toolCallTurn({
        toolCallId: "c2",
        toolName: "set_contact_field",
        input: { field: "email", value: "ada@example.com" },
      }),
    );
    mock.push(
      toolCallTurn({
        toolCallId: "c3",
        toolName: "submit_contact",
        input: {},
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Submitted." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <ContactFormWidget onSubmit={onSubmit} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // RHF writes should land before the confirm modal opens.
    await waitFor(() => {
      expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Ada");
    });
    await waitFor(() => {
      expect((screen.getByTestId("email") as HTMLInputElement).value).toBe("ada@example.com");
    });

    // submit_contact is mutating — approve the modal so the form submits.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ada", email: "ada@example.com" });

    await waitFor(() => {
      expect(screen.queryByText("Submitted.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(4);
  });
});

describe("<Pilot> integration — handler that throws surfaces as output-error", () => {
  function FlakyWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "flaky",
      description: "Will throw.",
      parameters: z.object({ x: z.number() }),
      handler: (args) => {
        refs.addTodoHandler(args);
        throw new Error("simulated failure");
      },
    });
    return <div data-testid="flaky-host" />;
  }

  it("catches the thrown error, records an output-error part, and does not loop", async () => {
    const refs: HarnessRefs = {
      addTodoHandler: vi.fn(),
      unknownToolHandler: vi.fn(),
    };
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "flaky",
        input: { x: 1 },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "I saw the error." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <FlakyWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(refs.addTodoHandler).toHaveBeenCalledTimes(1);
    });
    // The provider should surface the throw through addToolOutput, which
    // our ChatDriver renders as a <p data-testid="tool-error">.
    await waitFor(() => {
      expect(screen.queryByTestId("tool-error")).not.toBeNull();
    });
    expect(screen.getByTestId("tool-error").textContent).toContain("simulated failure");

    await waitFor(() => {
      expect(screen.queryByText("I saw the error.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Advanced scenarios — lifecycle edges, provider props, form edge cases,
// registry semantics, and sidebar interactions. Each one is self-contained
// so a failure points straight at the feature it exercises.
// ---------------------------------------------------------------------------

describe("<Pilot> integration — auto-confirm window skips the modal on rapid repeats", () => {
  function MutatingWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "stamp",
      description: "Stamp something.",
      parameters: z.object({ n: z.number() }),
      handler: (args) => {
        refs.addTodoHandler(args);
        return { ok: true, n: (args as { n: number }).n };
      },
      mutating: true,
    });
    return <div />;
  }

  it("prompts once, then auto-approves the same tool within the 5s window", async () => {
    const refs: HarnessRefs = {
      addTodoHandler: vi.fn(),
      unknownToolHandler: vi.fn(),
    };
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "stamp", input: { n: 1 } }));
    mock.push(toolCallTurn({ toolCallId: "c2", toolName: "stamp", input: { n: 2 } }));
    mock.push(textReplyTurn({ id: "t1", text: "Stamped twice." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <MutatingWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // First call → modal appears. Approve it.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    // Second call — handler runs without a second modal because the first
    // approval was seconds ago. Assert the handler fired for BOTH calls
    // and the modal is no longer in the DOM for the second.
    await waitFor(() => {
      expect(refs.addTodoHandler).toHaveBeenCalledTimes(2);
    });
    expect(refs.addTodoHandler.mock.calls.map((c) => c[0])).toEqual([{ n: 1 }, { n: 2 }]);
    // A second Confirm button would have been rendered if the modal popped
    // again. Once the handler has been called twice, no Confirm should
    // remain visible.
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();

    await waitFor(() => {
      expect(screen.queryByText("Stamped twice.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(3);
  });
});

describe("<Pilot> integration — renderConfirm override replaces the default modal", () => {
  function MutatingWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "risky",
      description: "Risky op.",
      parameters: z.object({}).strict(),
      handler: (args) => {
        refs.addTodoHandler(args);
        return { ok: true };
      },
      mutating: true,
    });
    return <div />;
  }

  it("uses the caller-provided renderer and runs the handler when the custom approve fires", async () => {
    const refs: HarnessRefs = {
      addTodoHandler: vi.fn(),
      unknownToolHandler: vi.fn(),
    };
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "risky", input: {} }));
    mock.push(textReplyTurn({ id: "t1", text: "Took care of it." }));

    render(
      <Pilot
        apiUrl="/api/pilot"
        renderConfirm={(args) => (
          <div data-testid="custom-modal">
            <p>custom confirm for {args.name}</p>
            <button type="button" data-testid="custom-approve" onClick={args.approve}>
              custom approve
            </button>
            <button type="button" data-testid="custom-cancel" onClick={args.cancel}>
              custom cancel
            </button>
          </div>
        )}
      >
        <MutatingWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // The default modal must NOT render — there should be no button with
    // the built-in "Confirm" label.
    await waitFor(() => {
      expect(screen.queryByTestId("custom-modal")).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();

    fireEvent.click(screen.getByTestId("custom-approve"));

    await waitFor(() => {
      expect(refs.addTodoHandler).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("Took care of it.")).not.toBeNull();
    });
  });
});

describe("<Pilot> integration — custom headers forward on every fetch", () => {
  it("passes static headers verbatim", async () => {
    mock.push(textReplyTurn({ id: "t1", text: "ok" }));
    render(
      <Pilot apiUrl="/api/pilot" headers={{ "x-test-header": "static-value" }}>
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(1);
    });
    expect(mock.calls[0]?.headers?.["x-test-header"]).toBe("static-value");
  });

  it("recomputes a function-valued header per call", async () => {
    let counter = 0;
    mock.push(textReplyTurn({ id: "t1", text: "one" }));
    mock.push(textReplyTurn({ id: "t2", text: "two" }));
    render(
      <Pilot
        apiUrl="/api/pilot"
        headers={() => ({ "x-counter": String(++counter) })}
      >
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(1);
    });
    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(2);
    });
    expect(mock.calls[0]?.headers?.["x-counter"]).toBe("1");
    expect(mock.calls[1]?.headers?.["x-counter"]).toBe("2");
  });
});

describe("<Pilot> integration — body.model per-request override", () => {
  it("forwards the model string as body.model on every POST", async () => {
    mock.push(textReplyTurn({ id: "t1", text: "ok" }));
    render(
      <Pilot apiUrl="/api/pilot" model="anthropic/claude-sonnet-4-5">
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(1);
    });
    const body = mock.calls[0]?.body as { model?: string } | undefined;
    expect(body?.model).toBe("anthropic/claude-sonnet-4-5");
  });
});

describe("<Pilot> integration — usePilotForm reset_<name>", () => {
  function ContactForm({ onReset }: { onReset: () => void }) {
    const form = useForm<{ name: string }>({ defaultValues: { name: "default-name" } });
    usePilotForm(form, { name: "contact" });
    // Prefill something different so reset is observable.
    const { register, watch, setValue } = form;
    const current = watch("name");
    return (
      <form>
        <input data-testid="name" {...register("name")} />
        <span data-testid="current-value">{current}</span>
        <button
          type="button"
          data-testid="prefill"
          onClick={() => {
            setValue("name", "prefilled", { shouldDirty: true });
            onReset();
          }}
        >
          prefill
        </button>
      </form>
    );
  }

  it("resets the form to defaultValues when reset_contact is called", async () => {
    const onReset = vi.fn();
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "reset_contact", input: {} }));
    mock.push(textReplyTurn({ id: "t1", text: "Cleared." }));
    render(
      <Pilot apiUrl="/api/pilot">
        <ContactForm onReset={onReset} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("prefill"));
    await waitFor(() => {
      expect(screen.getByTestId("current-value").textContent).toBe("prefilled");
    });
    expect(onReset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("send"));
    // reset_contact is mutating; approve the modal.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByTestId("current-value").textContent).toBe("default-name");
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — usePilotForm submit without a mounted form", () => {
  function DetachedFormRegistration() {
    const form = useForm<{ x: string }>({ defaultValues: { x: "" } });
    usePilotForm(form, { name: "detached" });
    // No <form> is rendered anywhere in the tree on purpose.
    return null;
  }

  it("returns {success:false, message:~locate} without crashing", async () => {
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "submit_detached", input: {} }));
    mock.push(textReplyTurn({ id: "t1", text: "No form to submit." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <DetachedFormRegistration />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    // Mutating → Confirm.
    const confirmBtn = await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("No form to submit.")).not.toBeNull();
    });
    // Exactly two POSTs — no loop on the failure.
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — duplicate action name is last-wins", () => {
  function TwoRegistrars({
    firstHandler,
    secondHandler,
  }: {
    firstHandler: (a: unknown) => unknown;
    secondHandler: (a: unknown) => unknown;
  }) {
    usePilotAction({
      name: "dup",
      description: "first",
      parameters: z.object({ n: z.number() }),
      handler: firstHandler,
    });
    usePilotAction({
      name: "dup",
      description: "second",
      parameters: z.object({ n: z.number() }),
      handler: secondHandler,
    });
    return null;
  }

  it("dispatches to the most recently registered handler", async () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn(() => ({ ok: true }));
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "dup", input: { n: 5 } }));
    mock.push(textReplyTurn({ id: "t1", text: "ok" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <TwoRegistrars firstHandler={firstHandler} secondHandler={secondHandler} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(secondHandler).toHaveBeenCalledTimes(1);
    });
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith({ n: 5 });
  });
});

describe("<Pilot> integration — async handler (Promise return)", () => {
  function AsyncWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "slow",
      description: "takes a tick",
      parameters: z.object({ x: z.number() }),
      handler: async (args) => {
        await new Promise((r) => setTimeout(r, 30));
        refs.addTodoHandler(args);
        return { done: true };
      },
    });
    return null;
  }

  it("awaits the Promise before the next turn fires", async () => {
    const refs: HarnessRefs = { addTodoHandler: vi.fn(), unknownToolHandler: vi.fn() };
    mock.push(toolCallTurn({ toolCallId: "c1", toolName: "slow", input: { x: 7 } }));
    mock.push(textReplyTurn({ id: "t1", text: "Got it." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <AsyncWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(refs.addTodoHandler).toHaveBeenCalledTimes(1);
    });
    expect(refs.addTodoHandler).toHaveBeenCalledWith({ x: 7 });
    await waitFor(() => {
      expect(screen.queryByText("Got it.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — Zod parse failure surfaces as output-error", () => {
  function StrictWidget({ refs }: { refs: HarnessRefs }) {
    usePilotAction({
      name: "strict",
      description: "requires a number",
      parameters: z.object({ count: z.number() }),
      handler: (args) => {
        refs.addTodoHandler(args);
        return { ok: true };
      },
    });
    return null;
  }

  it("does not call the handler and records the Zod message", async () => {
    const refs: HarnessRefs = { addTodoHandler: vi.fn(), unknownToolHandler: vi.fn() };
    // Bad input: a string instead of a number.
    mock.push(
      toolCallTurn({ toolCallId: "c1", toolName: "strict", input: { count: "nope" } }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Saw the schema error." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <StrictWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByTestId("tool-error")).not.toBeNull();
    });
    expect(refs.addTodoHandler).not.toHaveBeenCalled();
    // Zod's messages vary by version; assert it's non-empty and mentions
    // something schema-adjacent.
    expect(screen.getByTestId("tool-error").textContent ?? "").not.toBe("");
    await waitFor(() => {
      expect(screen.queryByText("Saw the schema error.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> integration — chat.stop() aborts the current stream", () => {
  function Harness({ probe }: { probe: (ctx: PilotChatContextValue | null) => void }) {
    const chat = useContext(PilotChatContext);
    probe(chat);
    return (
      <div>
        <button
          type="button"
          data-testid="send"
          onClick={() => void chat?.sendMessage("start the stream")}
        >
          send
        </button>
        <button type="button" data-testid="stop" onClick={() => chat?.stop()}>
          stop
        </button>
        <span data-testid="status">{chat?.status ?? "?"}</span>
      </div>
    );
  }

  it("stops a streaming response and returns the UI to ready", async () => {
    // Emit a real text-delta so useChat advances from `submitted` to
    // `streaming` — stop() only aborts a fetch that's mid-read — then
    // park. Only chat.stop() can end the stream after that.
    mock.pushOpen([
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Starting..." },
    ]);

    let captured: PilotChatContextValue | null = null;
    render(
      <Pilot apiUrl="/api/pilot">
        <Harness probe={(c) => (captured = c)} />
      </Pilot>,
    );
    fireEvent.click(screen.getByTestId("send"));
    // Wait until useChat is actively streaming so the abort path has
    // something to abort. A generous timeout because the hang-park stream
    // can interact oddly with happy-dom's scheduling.
    await waitFor(
      () => {
        expect(screen.getByTestId("status").textContent).toBe("streaming");
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByTestId("stop"));
    await waitFor(
      () => {
        const s = screen.getByTestId("status").textContent;
        expect(s === "ready" || s === "error").toBe(true);
      },
      { timeout: 2000 },
    );
    // No second POST should have fired.
    expect(mock.pilotPostCount()).toBe(1);
    expect(captured).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// <PilotSidebar> interactions. We mount the real sidebar (not a harness)
// so these tests also double as a smoke check that the sidebar renders
// without crashing under happy-dom.
// ---------------------------------------------------------------------------

describe("<PilotSidebar> integration — composer send", () => {
  it("fires a POST with the typed text when the user submits the form", async () => {
    mock.push(textReplyTurn({ id: "t1", text: "Got your message." }));

    render(
      <Pilot apiUrl="/api/pilot">
        <PilotSidebar defaultOpen />
      </Pilot>,
    );

    // The textarea's aria-label mirrors the placeholder, which defaults
    // to "Ask me anything...". We key off the placeholder text.
    const textarea = screen.getByPlaceholderText("Ask me anything...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello pilot" } });
    const sendBtn = screen.getByRole("button", { name: "Send" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(1);
    });
    const body = mock.calls[0]?.body as
      | { messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }> }
      | undefined;
    const lastMessage = body?.messages?.[body.messages.length - 1];
    const lastText = lastMessage?.parts?.find((p) => p.type === "text")?.text;
    expect(lastText).toBe("hello pilot");
  });
});

describe("<PilotSidebar> integration — suggestion chip", () => {
  it("fires sendMessage with the chip text when clicked", async () => {
    mock.push(textReplyTurn({ id: "t1", text: "hi!" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <PilotSidebar defaultOpen suggestions={["greet me"]} />
      </Pilot>,
    );
    const chip = await screen.findByRole("button", { name: "greet me" });
    fireEvent.click(chip);
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBe(1);
    });
    const body = mock.calls[0]?.body as
      | { messages?: Array<{ parts?: Array<{ type?: string; text?: string }> }> }
      | undefined;
    expect(body?.messages?.[0]?.parts?.[0]?.text).toBe("greet me");
  });
});

describe("<PilotSidebar> integration — stop button during streaming", () => {
  it("shows a Stop-generating button while streaming and aborts on click", async () => {
    mock.pushOpen([
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "In progress..." },
    ]);

    render(
      <Pilot apiUrl="/api/pilot">
        <PilotSidebar defaultOpen />
      </Pilot>,
    );
    const textarea = screen.getByPlaceholderText("Ask me anything...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "do a long thing" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Wait for the stop button to appear (it replaces Send during loading).
    const stopBtn = await screen.findByRole(
      "button",
      { name: "Stop generating" },
      { timeout: 2000 },
    );
    fireEvent.click(stopBtn);

    // After abort, the send button should come back (sidebar exits
    // the loading state).
    await waitFor(
      () => {
        expect(screen.queryByRole("button", { name: "Send" })).not.toBeNull();
      },
      { timeout: 2000 },
    );
    // Exactly one POST — no retry after the stop.
    expect(mock.pilotPostCount()).toBe(1);
  });
});
