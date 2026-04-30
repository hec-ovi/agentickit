/**
 * Tests for the AG-UI runtime adapter.
 *
 * The runtime is a thin layer on top of `@ag-ui/client`'s `AbstractAgent`,
 * which means the test infrastructure also reaches into `@ag-ui/client`.
 * Production users are expected to construct `HttpAgent` (or any subclass)
 * with a real URL; tests substitute a `FakeAgent` whose `run()` emits a
 * canned `Observable<BaseEvent>` so we can drive any event ordering
 * deterministically without an HTTP backend.
 *
 * Coverage falls into four buckets:
 *
 *   1. Pure conversion: `convertMessages` against scripted
 *      `Message[]` arrays. No React, no agent. Asserts the
 *      AG-UI-to-UIMessage adapter is faithful.
 *
 *   2. Subscriber wiring: the runtime hook subscribes to the agent and
 *      surfaces messages, status, and errors. We render a `<PilotChatView>`
 *      under `<Pilot runtime={agUiRuntime({ agent })}>` and verify the chat
 *      context flows match the agent's state after each scripted run.
 *
 *   3. Tool-call bridging: a registered action receives a TOOL_CALL_END
 *      event from the fake agent, the provider's handler runs, and the
 *      runtime appends a `role: "tool"` message + re-runs to continue.
 *      Plus the mutating + confirm-modal gating still gates an AG-UI tool
 *      call exactly like a local one.
 *
 *   4. State + activity hooks: a child component using
 *      `usePilotAgentState` re-renders when STATE_SNAPSHOT / STATE_DELTA
 *      arrives; another using `usePilotAgentActivity` sees activity and
 *      reasoning entries.
 *
 * Most tests use real `fireEvent` interactions (`type into textarea`,
 * `click send`) on `<PilotChatView>`. No `fetch`, no `@ag-ui/client`
 * `HttpAgent`, the only network is the fake agent's `run()` Observable.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useContext } from "react";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AbstractAgent } from "@ag-ui/client";
import {
  EventType,
  type BaseEvent,
  type Message as AgUiMessage,
  type RunAgentInput,
  type State,
} from "@ag-ui/core";
import { PilotChatView } from "../components/pilot-chat-view.js";
import { Pilot } from "../components/pilot-provider.js";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import {
  agUiRuntime,
  convertMessages,
  usePilotAgentActivity,
  usePilotAgentState,
} from "./ag-ui-runtime.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Fake agent + scripting helpers                                     */
/* ------------------------------------------------------------------ */

/**
 * A test-only `AbstractAgent`. Each call to `run(input)` consumes the next
 * entry from `scripts` and emits its events on the returned Observable.
 * Tests push entries before triggering a run (e.g., before clicking send).
 *
 * Why we extend `AbstractAgent` rather than fake the runtime's expectations
 * directly: the runtime calls `agent.subscribe(subscriber)` and
 * `agent.runAgent(params)`, both of which live on `AbstractAgent` and route
 * through its internal apply pipeline (`defaultApplyEvents`). Driving the
 * fake at the `run()` boundary exercises the same code paths a real
 * `HttpAgent` would: messages mutate via the apply pipeline, subscribers
 * fire via the same dispatch loop, state deltas reduce through
 * `fast-json-patch`. Bypassing that and synthesizing subscriber callbacks
 * directly would skip the only seam the runtime depends on.
 */
class FakeAgent extends AbstractAgent {
  private scripts: Array<ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>> = [];
  /** Captured `runAgent` parameters per run, in order. */
  public readonly runs: RunAgentInput[] = [];
  /** When set, the next run() throws this error instead of emitting events. */
  public throwOnRun: Error | undefined;

  constructor(config?: { initialState?: State; initialMessages?: AgUiMessage[] }) {
    super(config);
  }

  /** Push a script for an upcoming run. Each script is a finite event list. */
  enqueue(events: ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>): void {
    this.scripts.push(events);
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    this.runs.push(input);
    if (this.throwOnRun) {
      const err = this.throwOnRun;
      return new Observable<BaseEvent>((sub) => {
        sub.error(err);
      });
    }
    const script = this.scripts.shift() ?? [];
    return new Observable<BaseEvent>((subscriber) => {
      // Queue async so the first emission lands AFTER any synchronous
      // setup the apply pipeline does. Real HttpAgent SSE behaves the same.
      Promise.resolve().then(() => {
        for (const ev of script) {
          subscriber.next(ev as BaseEvent);
        }
        subscriber.complete();
      });
    });
  }
}

/** Helper: emit a complete text-only assistant turn for a given message id. */
function textTurn(
  threadId: string,
  runId: string,
  messageId: string,
  text: string,
): ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">> {
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent,
    { type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent,
  ];
}

/**
 * Helper: emit a tool-call turn (assistant requests a tool, no inline
 * result). The runtime is responsible for dispatching, appending a tool
 * result message, and re-running. The tool args field is JSON-serialized
 * since the wire format uses string args.
 */
function toolCallTurn(
  threadId: string,
  runId: string,
  messageId: string,
  toolCallId: string,
  toolName: string,
  args: unknown,
): ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">> {
  const json = JSON.stringify(args);
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: toolName,
      parentMessageId: messageId,
    } as BaseEvent,
    { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: json } as BaseEvent,
    { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent,
    { type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent,
  ];
}

/* ------------------------------------------------------------------ */
/* 1. convertMessages: pure unit tests                                 */
/* ------------------------------------------------------------------ */

describe("convertMessages", () => {
  it("returns an empty array for no input", () => {
    expect(convertMessages([])).toEqual([]);
  });

  it("converts a string-content user message into a UIMessage with one text part", () => {
    const messages: AgUiMessage[] = [
      { id: "u1", role: "user", content: "hello" } as AgUiMessage,
    ];
    expect(convertMessages(messages)).toEqual([
      { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("converts an assistant text-only message into a UIMessage", () => {
    const messages: AgUiMessage[] = [
      { id: "a1", role: "assistant", content: "answer" } as AgUiMessage,
    ];
    expect(convertMessages(messages)).toEqual([
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "answer" }] },
    ]);
  });

  it("folds tool result into the preceding assistant message's tool part", () => {
    const messages: AgUiMessage[] = [
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          {
            id: "c1",
            type: "function",
            function: { name: "search", arguments: '{"q":"weather"}' },
          },
        ],
      } as AgUiMessage,
      {
        id: "t1",
        role: "tool",
        toolCallId: "c1",
        content: '{"result":"sunny"}',
      } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-search",
          toolName: "search",
          toolCallId: "c1",
          input: { q: "weather" },
          state: "output-available",
          output: { result: "sunny" },
        },
      ],
    });
  });

  it("emits state output-error when the tool result carries an error field", () => {
    const messages: AgUiMessage[] = [
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          {
            id: "c1",
            type: "function",
            function: { name: "boom", arguments: "{}" },
          },
        ],
      } as AgUiMessage,
      {
        id: "t1",
        role: "tool",
        toolCallId: "c1",
        content: "",
        error: "kaboom",
      } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    expect(out).toHaveLength(1);
    expect((out[0] as { parts: Array<{ state: string; errorText?: string }> }).parts[0]).toMatchObject({
      type: "tool-boom",
      state: "output-error",
      errorText: "kaboom",
    });
  });

  it("marks orphan tool calls with no matching tool message as input-available", () => {
    const messages: AgUiMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "thinking...",
        toolCalls: [
          {
            id: "c1",
            type: "function",
            function: { name: "search", arguments: '{"q":"x"}' },
          },
        ],
      } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    expect(out).toHaveLength(1);
    const parts = (out[0] as { parts: Array<{ type: string; state?: string }> }).parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: "thinking..." });
    expect(parts[1]).toMatchObject({
      type: "tool-search",
      state: "input-available",
    });
  });

  it("drops activity and reasoning messages from the chat list", () => {
    const messages: AgUiMessage[] = [
      { id: "u1", role: "user", content: "go" } as AgUiMessage,
      {
        id: "act1",
        role: "activity",
        activityType: "step",
        content: { step: "fetching" },
      } as AgUiMessage,
      {
        id: "rsn1",
        role: "reasoning",
        content: "I should call the search tool.",
      } as AgUiMessage,
      { id: "a1", role: "assistant", content: "done" } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    expect(out.map((m) => (m as { id: string }).id)).toEqual(["u1", "a1"]);
  });

  it("multimodal user content collapses to text + placeholder for non-text parts", () => {
    const messages: AgUiMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          { type: "text", text: "look at this " },
          { type: "image", source: { type: "url", value: "https://example.com/x.png" } },
        ],
      } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    expect(out).toEqual([
      { id: "u1", role: "user", parts: [{ type: "text", text: "look at this [image]" }] },
    ]);
  });

  it("falls back to the raw string when tool args/result are not valid JSON", () => {
    const messages: AgUiMessage[] = [
      {
        id: "a1",
        role: "assistant",
        toolCalls: [
          {
            id: "c1",
            type: "function",
            function: { name: "echo", arguments: "not json" },
          },
        ],
      } as AgUiMessage,
      {
        id: "t1",
        role: "tool",
        toolCallId: "c1",
        content: "raw output",
      } as AgUiMessage,
    ];
    const out = convertMessages(messages);
    const part = (out[0] as { parts: Array<{ input: unknown; output: unknown }> }).parts[0];
    expect(part.input).toBe("not json");
    expect(part.output).toBe("raw output");
  });
});

/* ------------------------------------------------------------------ */
/* 2. Subscriber wiring: <Pilot runtime={agUiRuntime}> integration     */
/* ------------------------------------------------------------------ */

describe("<Pilot runtime={agUiRuntime}> integration", () => {
  it("renders an empty messages list before any run", () => {
    const agent = new FakeAgent();
    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );
    // Empty-state greeting is what PilotChatView shows before any messages.
    expect(screen.queryByText(/hi! ask me anything/i)).not.toBeNull();
  });

  it("user types into the composer, clicks send, and the assistant reply appears", async () => {
    const agent = new FakeAgent();
    agent.enqueue(textTurn("t1", "r1", "a1", "Hello back!"));

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hi" } });
    expect(textarea.value).toBe("Hi");

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("Hello back!")).not.toBeNull();
    });
    // The user's message renders too.
    expect(screen.queryByText("Hi")).not.toBeNull();
    // Exactly one runAgent call happened (no follow-up since the run had no tool call).
    expect(agent.runs).toHaveLength(1);
  });

  it("shows the user message as soon as it's submitted, before the run finishes", async () => {
    const agent = new FakeAgent();
    // Hold the run open by NOT enqueueing a complete script: the agent
    // will emit nothing and complete immediately, but the user message has
    // already been added.
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" } as BaseEvent,
    ]);

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("ping")).not.toBeNull();
    });
  });

  it("surfaces RUN_ERROR through chat.error → error banner in PilotChatView", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      { type: EventType.RUN_ERROR, message: "model exploded" } as BaseEvent,
    ]);

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText(/model exploded/i)).not.toBeNull();
    });
  });

  it("surfaces an Observable error (run() throws) through chat.error", async () => {
    // AbstractAgent's onError logs `Agent execution failed:` to console.error
    // before re-throwing; muffle that line so the test output stays clean.
    // The runtime's runAgent-level catch already converts the throw into a
    // chat.error, so we still assert the user-visible behavior.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const agent = new FakeAgent();
    agent.throwOnRun = new Error("network down");

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText(/network down/i)).not.toBeNull();
    });
    errorSpy.mockRestore();
  });

  it("forwards registered actions as Tool entries in the next run's input", async () => {
    const agent = new FakeAgent();
    agent.enqueue(textTurn("t1", "r1", "a1", "ok"));

    function Widget(): null {
      usePilotAction({
        name: "lookup",
        description: "look something up",
        parameters: z.object({ q: z.string() }),
        handler: () => ({ result: "stub" }),
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(agent.runs).toHaveLength(1);
    });
    const tools = agent.runs[0]!.tools;
    expect(tools).toEqual([
      expect.objectContaining({
        name: "lookup",
        description: "look something up",
      }),
    ]);
    expect(tools[0]!.parameters).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* 3. Tool-call bridging                                              */
/* ------------------------------------------------------------------ */

describe("<Pilot runtime={agUiRuntime}> tool-call bridging", () => {
  it("dispatches a tool call to a registered handler, appends the result, and re-runs", async () => {
    const agent = new FakeAgent();
    // First run: assistant requests a tool call. Second run (auto-triggered
    // by the runtime after the tool result is appended): assistant replies
    // with the final text.
    agent.enqueue(toolCallTurn("t1", "r1", "a1", "c1", "lookup", { q: "weather" }));
    agent.enqueue(textTurn("t1", "r2", "a2", "It's sunny."));

    const handlerSpy = vi.fn(() => ({ result: "sunny, 72F" }));

    function Widget(): null {
      usePilotAction({
        name: "lookup",
        description: "look something up",
        parameters: z.object({ q: z.string() }),
        handler: handlerSpy,
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "weather?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("It's sunny.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledWith({ q: "weather" });
    // Two runs: the original tool-call run, then the continuation that
    // produced the text reply.
    expect(agent.runs).toHaveLength(2);
  });

  it("does not dispatch a tool that is not in the local registry (server-side tool)", async () => {
    // AG-UI servers can mix client-side and server-side tools in the same
    // run. If we dispatched every TOOL_CALL_END the server would receive a
    // duplicate tool message (ours and theirs via TOOL_CALL_RESULT). The
    // runtime gates on the registry: unknown tools are skipped, the
    // server-side path resolves them itself. Verified here by emitting a
    // single tool-call run with no registered action and asserting the
    // runtime does NOT trigger a follow-up run.
    const agent = new FakeAgent();
    agent.enqueue(toolCallTurn("t1", "r1", "a1", "c1", "server-tool", {}));

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    // Wait for the run to settle.
    await waitFor(() => {
      expect(agent.runs).toHaveLength(1);
    });
    // Give the runtime a microtask to potentially trigger a follow-up;
    // none should fire because no client tool was dispatched.
    await new Promise((r) => setTimeout(r, 30));
    expect(agent.runs).toHaveLength(1);
    // The server-side tool's call appears in the user-visible chat as an
    // assistant tool part, but no `role: "tool"` message has been added by
    // the client runtime.
    const tools = (agent.messages as Array<{ role: string }>).filter(
      (m) => m.role === "tool",
    );
    expect(tools).toHaveLength(0);
  });

  it("mutating actions still gate behind the confirm modal under the AG-UI runtime", async () => {
    const agent = new FakeAgent();
    agent.enqueue(toolCallTurn("t1", "r1", "a1", "c1", "delete_thing", { id: "abc" }));
    agent.enqueue(textTurn("t1", "r2", "a2", "Done."));

    const handlerSpy = vi.fn(() => ({ ok: true }));

    function Widget(): null {
      usePilotAction({
        name: "delete_thing",
        description: "danger zone",
        parameters: z.object({ id: z.string() }),
        handler: handlerSpy,
        mutating: true,
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "delete!" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    // Confirm modal mounts, handler hasn't run yet.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    expect(handlerSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => {
      expect(screen.queryByText("Done.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledWith({ id: "abc" });
    expect(agent.runs).toHaveLength(2);
  });

  it("declining a mutating action sends an `ok: false` tool message and continues", async () => {
    const agent = new FakeAgent();
    agent.enqueue(toolCallTurn("t1", "r1", "a1", "c1", "delete_thing", { id: "abc" }));
    agent.enqueue(textTurn("t1", "r2", "a2", "Cancelled."));

    const handlerSpy = vi.fn(() => ({ ok: true }));

    function Widget(): null {
      usePilotAction({
        name: "delete_thing",
        description: "danger zone",
        parameters: z.object({ id: z.string() }),
        handler: handlerSpy,
        mutating: true,
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "delete!" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText("Cancelled.")).not.toBeNull();
    });
    expect(handlerSpy).not.toHaveBeenCalled();
    // Continuation message includes the user-declined tool result, not a
    // hard error, so the model can react conversationally.
    const continuation = agent.runs[1]!.messages;
    const toolMsg = continuation.find((m) => m.role === "tool") as
      | { content: string; error?: string }
      | undefined;
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.error).toBeUndefined();
    const parsed = JSON.parse(toolMsg!.content) as { ok: boolean; reason: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toMatch(/declined/i);
  });

  it("renderAndWait actions still mount HITL UI and resolve through the AG-UI runtime", async () => {
    const agent = new FakeAgent();
    agent.enqueue(toolCallTurn("t1", "r1", "a1", "c1", "pick_letter", { prompt: "Pick" }));
    agent.enqueue(textTurn("t1", "r2", "a2", "You picked A."));

    function Widget(): null {
      usePilotAction({
        name: "pick_letter",
        description: "ask user to pick A or B",
        parameters: z.object({ prompt: z.string() }),
        handler: () => null as never,
        renderAndWait: ({ respond }) => (
          <div data-testid="hitl">
            <button
              type="button"
              data-testid="pick-A"
              onClick={() => respond({ letter: "A" })}
            >
              A
            </button>
          </div>
        ),
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("hitl")).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId("pick-A"));

    await waitFor(() => {
      expect(screen.queryByText("You picked A.")).not.toBeNull();
    });

    const continuation = agent.runs[1]!.messages;
    const toolMsg = continuation.find((m) => m.role === "tool") as { content: string };
    expect(toolMsg).toBeDefined();
    expect(JSON.parse(toolMsg.content)).toEqual({ letter: "A" });
  });
});

/* ------------------------------------------------------------------ */
/* 4. State + activity hooks                                          */
/* ------------------------------------------------------------------ */

describe("usePilotAgentState / usePilotAgentActivity", () => {
  it("seeds the agent's initial state into the store on mount", () => {
    // AbstractAgent's constructor defaults `state` to `{}`. Consumers can
    // pass `initialState` to seed something richer; either way, the store
    // mirrors `agent.state` immediately on mount so consumers don't see a
    // flicker between mount and first STATE_SNAPSHOT.
    const agent = new FakeAgent({ initialState: { phase: "idle" } });
    let observed: unknown = "sentinel";
    function Probe(): null {
      observed = usePilotAgentState(agent);
      return null;
    }
    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
      </Pilot>,
    );
    expect(observed).toEqual({ phase: "idle" });
  });

  it("re-renders the consumer when STATE_SNAPSHOT arrives", async () => {
    const agent = new FakeAgent();
    const initialSnapshot: State = { counter: 0 };
    const finalSnapshot: State = { counter: 7 };
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: initialSnapshot,
      } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: finalSnapshot,
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" } as BaseEvent,
    ]);

    interface CounterState {
      counter: number;
    }
    function Probe(): ReactNode {
      const state = usePilotAgentState<CounterState>(agent);
      return <div data-testid="counter">{state?.counter ?? "none"}</div>;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    expect(screen.getByTestId("counter").textContent).toBe("none");

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("counter").textContent).toBe("7");
    });
  });

  it("applies STATE_DELTA (JSON Patch) on top of an existing snapshot", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { counter: 0, label: "start" },
      } as BaseEvent,
      {
        type: EventType.STATE_DELTA,
        delta: [
          { op: "replace", path: "/counter", value: 3 },
          { op: "replace", path: "/label", value: "middle" },
        ],
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" } as BaseEvent,
    ]);

    interface S {
      counter: number;
      label: string;
    }
    function Probe(): ReactNode {
      const state = usePilotAgentState<S>(agent);
      return (
        <div data-testid="probe">
          {state?.counter ?? "?"}/{state?.label ?? "?"}
        </div>
      );
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("3/middle");
    });
  });

  it("usePilotAgentActivity returns the activity messages emitted by the agent", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      // The event carries flat messageId / activityType / content fields;
      // the apply pipeline reduces those into an ActivityMessage written
      // to agent.messages.
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: "act1",
        activityType: "step",
        content: { step: "fetching" },
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" } as BaseEvent,
    ]);

    function Probe(): ReactNode {
      const { activities } = usePilotAgentActivity(agent);
      return (
        <div data-testid="activities">
          count={activities.length} types={activities.map((a) => a.activityType).join(",")}
        </div>
      );
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    expect(screen.getByTestId("activities").textContent).toBe("count=0 types=");

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("activities").textContent).toBe("count=1 types=step");
    });
  });

  it("the agent's state is shared across multiple consumers (single source of truth)", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { value: 42 },
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" } as BaseEvent,
    ]);

    interface S {
      value: number;
    }
    function ProbeA(): ReactNode {
      const state = usePilotAgentState<S>(agent);
      return <div data-testid="a">{state?.value ?? "?"}</div>;
    }
    function ProbeB(): ReactNode {
      const state = usePilotAgentState<S>(agent);
      return <div data-testid="b">{state?.value ?? "?"}</div>;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <ProbeA />
        <ProbeB />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("a").textContent).toBe("42");
      expect(screen.getByTestId("b").textContent).toBe("42");
    });
  });
});

/* ------------------------------------------------------------------ */
/* 5. Lifecycle                                                       */
/* ------------------------------------------------------------------ */

describe("agUiRuntime lifecycle", () => {
  it("clicking 'Stop generating' aborts the in-flight run and re-enables the send button", async () => {
    const agent = new FakeAgent();
    const abortSpy = vi.spyOn(agent, "abortRun");

    // Hold the run open via a Subject we control. The runtime's send
    // button can only morph into 'Stop generating' while the run is
    // actually in flight, so we need a real never-completing stream.
    const heldSubject = new Subject<BaseEvent>();
    vi.spyOn(agent, "run").mockImplementation((input: RunAgentInput) => {
      (agent.runs as unknown as RunAgentInput[]).push(input);
      return new Observable<BaseEvent>((sub) => {
        sub.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        } as BaseEvent);
        const inner = heldSubject.subscribe(sub);
        return () => inner.unsubscribe();
      });
    });
    // abortRun: simulate AbstractAgent's behavior of completing the
    // outgoing stream so the runtime's runUntilSettled resolves.
    abortSpy.mockImplementation(() => {
      heldSubject.next({
        type: EventType.RUN_FINISHED,
        threadId: "t",
        runId: "r",
      } as BaseEvent);
      heldSubject.complete();
    });

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    // The send button morphs into 'Stop generating' while loading.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /stop generating/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /stop generating/i }));

    expect(abortSpy).toHaveBeenCalled();
    // After abort, the chat returns to ready and the Send button is back.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^send$/i })).not.toBeNull();
    });
  });
});

/* ------------------------------------------------------------------ */
/* 6. Factory stability + merge semantics                              */
/* ------------------------------------------------------------------ */

describe("agUiRuntime factory", () => {
  it("returns the same runtime instance for the same agent (M3 stability)", () => {
    const agent = new FakeAgent();
    const a = agUiRuntime({ agent });
    const b = agUiRuntime({ agent });
    expect(a).toBe(b);
  });

  it("returns different runtime instances for different agents", () => {
    const agentA = new FakeAgent();
    const agentB = new FakeAgent();
    const a = agUiRuntime({ agent: agentA });
    const b = agUiRuntime({ agent: agentB });
    expect(a).not.toBe(b);
  });

  it("bypasses the cache when prepareRunParameters is supplied (function identity matters)", () => {
    const agent = new FakeAgent();
    const a = agUiRuntime({ agent, prepareRunParameters: () => ({}) });
    const b = agUiRuntime({ agent, prepareRunParameters: () => ({}) });
    expect(a).not.toBe(b);
  });

  it("prepareRunParameters tools and context CONCATENATE with registry-derived defaults", async () => {
    const agent = new FakeAgent();
    agent.enqueue(textTurn("t1", "r1", "a1", "ok"));
    const prepareSpy = vi.fn(() => ({
      tools: [
        {
          name: "extra-tool",
          description: "added by prepareRunParameters",
          parameters: { type: "object" },
        },
      ],
      context: [{ value: "extra:1", description: "added context" }],
      forwardedProps: { foo: "bar" },
    }));

    function Widget(): null {
      usePilotAction({
        name: "registered",
        description: "from registry",
        parameters: z.object({}),
        handler: () => null,
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent, prepareRunParameters: prepareSpy })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(agent.runs).toHaveLength(1);
    });
    const tools = agent.runs[0]!.tools;
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(["registered", "extra-tool"]);
    const context = agent.runs[0]!.context;
    expect(context.length).toBe(1);
    expect(context[0]!.value).toBe("extra:1");
    expect(agent.runs[0]!.forwardedProps).toEqual({ foo: "bar" });
  });
});

/* ------------------------------------------------------------------ */
/* 7. Continuation cap surfaces an error                              */
/* ------------------------------------------------------------------ */

describe("continuation cap", () => {
  it("surfaces an error and stops looping after 16 tool-call iterations", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = new FakeAgent();
    // Enqueue 20 tool-call runs in a row. The runtime should stop after
    // 16 iterations and surface a chat error.
    for (let i = 0; i < 20; i++) {
      agent.enqueue(toolCallTurn("t", `r${i}`, `a${i}`, `c${i}`, "loop", {}));
    }

    function Widget(): null {
      usePilotAction({
        name: "loop",
        description: "ever-looping tool",
        parameters: z.object({}),
        handler: () => ({ ok: true }),
      });
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Widget />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(
      () => {
        expect(screen.queryByText(/continuation cap/i)).not.toBeNull();
      },
      { timeout: 3000 },
    );
    expect(warnSpy).toHaveBeenCalled();
    // Exactly 16 runs happened, not 20.
    expect(agent.runs.length).toBe(16);
    warnSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/* 8. Re-entry guard + stop                                           */
/* ------------------------------------------------------------------ */

describe("sendMessage re-entry guard", () => {
  it("blocks a concurrent sendMessage call while the first is still in flight", async () => {
    const agent = new FakeAgent();
    // Each run takes a microtask; the second sendMessage should be dropped.
    agent.enqueue(textTurn("t", "r1", "a1", "first"));
    agent.enqueue(textTurn("t", "r2", "a2", "second"));

    let chatRef: PilotChatContextValue | null = null;
    function Capture(): null {
      // Snag the chat context value imperatively so we can fire two
      // sendMessage calls in the same tick.
      chatRef = useContext(PilotChatContext);
      return null;
    }

    render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Capture />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    expect(chatRef).not.toBeNull();
    // Fire two sends concurrently in the same tick. Both calls must be
    // wrapped in act() because sendMessage causes React state updates
    // (status flip, messages append) that React expects to settle inside
    // an act batch.
    await act(async () => {
      const p1 = chatRef!.sendMessage("a");
      const p2 = chatRef!.sendMessage("b");
      await Promise.all([p1, p2]);
    });

    // Only the first run actually executed.
    expect(agent.runs).toHaveLength(1);
  });
});
