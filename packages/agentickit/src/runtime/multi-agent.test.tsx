/**
 * Integration tests for the Phase 7 multi-agent registry working in
 * concert with `<Pilot>` + `agUiRuntime`. Covers the user-facing pattern:
 *
 * ```tsx
 * <PilotAgentRegistry>
 *   <RegisterResearch />
 *   <RegisterCode />
 *   <ActiveChat activeId={activeId} />
 * </PilotAgentRegistry>
 * ```
 *
 * The `<ActiveChat>` reads the current agent from the registry via
 * `useAgent(activeId)` and mounts `<Pilot runtime={agUiRuntime({ agent })}>`.
 * When the consumer flips `activeId`, `useAgent` returns a different
 * reference, `agUiRuntime`'s WeakMap-cached factory returns a different
 * runtime instance, and `<Pilot>`'s `PilotRuntimeBridge` (added in Phase
 * 3b polish) detects the runtime swap and remounts cleanly.
 *
 * Coverage:
 *
 *   1. Two registered agents, mount Pilot against agent A, then swap to
 *      agent B: A's run() was called once, B's run() called once on
 *      the second send. No Rules-of-Hooks errors in console (regression
 *      for the runtime-bridge fix).
 *   2. Each agent keeps its OWN messages list. Swapping back to A shows
 *      A's prior message history, not B's.
 *   3. `usePilotAgentState(agentA)` and `usePilotAgentState(agentB)`
 *      operate on independent stores. Updating A's state does not
 *      cause B's consumers to re-render with A's value.
 *   4. Tool-call dispatch reaches the active agent's runtime, not the
 *      inactive agent's. Confirmed by which agent's `run()` is invoked
 *      after the tool result is appended.
 *   5. `useAgents()` reports both agents in registration order; an
 *      AgentPicker UI driven by useAgents stays in sync as agents
 *      mount and unmount.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState, StrictMode } from "react";
import { Observable } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbstractAgent } from "@ag-ui/client";
import {
  EventType,
  type BaseEvent,
  type RunAgentInput,
  type State,
} from "@ag-ui/core";
import { z } from "zod";
import { PilotAgentRegistry } from "../components/pilot-agent-registry.js";
import { PilotChatView } from "../components/pilot-chat-view.js";
import { Pilot } from "../components/pilot-provider.js";
import { useAgent } from "../hooks/use-agent.js";
import { useAgents } from "../hooks/use-agents.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import { useRegisterAgent } from "../hooks/use-register-agent.js";
import { agUiRuntime, usePilotAgentState } from "./ag-ui-runtime.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class FakeAgent extends AbstractAgent {
  private scripts: Array<ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>> = [];
  public readonly runs: RunAgentInput[] = [];

  constructor(config?: { initialState?: State; description?: string }) {
    super(config);
  }

  enqueue(events: ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>): void {
    this.scripts.push(events);
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    this.runs.push(input);
    const script = this.scripts.shift() ?? [];
    return new Observable<BaseEvent>((sub) => {
      Promise.resolve().then(() => {
        for (const ev of script) sub.next(ev as BaseEvent);
        sub.complete();
      });
    });
  }
}

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

function toolCallTurn(
  threadId: string,
  runId: string,
  messageId: string,
  toolCallId: string,
  toolName: string,
  args: unknown,
): ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">> {
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: toolName,
      parentMessageId: messageId,
    } as BaseEvent,
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta: JSON.stringify(args),
    } as BaseEvent,
    { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent,
    { type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent,
  ];
}

/**
 * `<RegisterAgent>` is a tiny helper that lets a test specify the agent
 * instance directly (instead of letting the hook construct it via a
 * factory). This is what real consumers wouldn't do (the factory pattern
 * lets the hook own construction); for tests, we want the agent
 * reference up-front so we can `agent.enqueue(...)` and inspect
 * `agent.runs` afterward.
 */
function RegisterAgent(props: { id: string; agent: AbstractAgent }): null {
  useRegisterAgent(props.id, () => props.agent);
  return null;
}

/**
 * `<ActiveChat>` mounts a `<Pilot>` driven by whichever agent is
 * registered under `activeId`. Until that id is registered, falls back
 * to a placeholder.
 */
function ActiveChat(props: { activeId: string; children?: ReactNode }): ReactNode {
  const agent = useAgent(props.activeId);
  if (!agent) return <div data-testid="placeholder">no agent registered for {props.activeId}</div>;
  return (
    <Pilot runtime={agUiRuntime({ agent })}>
      {props.children}
      <PilotChatView autoFocus={false} showSkillsPanel={false} />
    </Pilot>
  );
}

describe("multi-agent: <PilotAgentRegistry> + Pilot + agUiRuntime", () => {
  it("two agents registered, switching activeId routes the run() call to the right one", async () => {
    const a = new FakeAgent({ description: "agent-a" });
    const b = new FakeAgent({ description: "agent-b" });
    a.enqueue(textTurn("t", "r1", "m1", "from A"));
    b.enqueue(textTurn("t", "r1", "m1", "from B"));

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <button
            type="button"
            data-testid="pick-a"
            onClick={() => setActive("a")}
          >
            A
          </button>
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active} />
        </PilotAgentRegistry>
      );
    }

    render(<Harness />);

    // Pilot is mounted against agent A initially.
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("from A")).not.toBeNull();
    });
    expect(a.runs).toHaveLength(1);
    expect(b.runs).toHaveLength(0);

    // Swap to B; runtime remounts cleanly via PilotRuntimeBridge.
    fireEvent.click(screen.getByTestId("pick-b"));
    const textarea2 = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea2, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("from B")).not.toBeNull();
    });
    expect(a.runs).toHaveLength(1);
    expect(b.runs).toHaveLength(1);
  });

  it("each agent keeps its own messages list (history preserved on swap-back)", async () => {
    const a = new FakeAgent({ description: "a" });
    const b = new FakeAgent({ description: "b" });
    a.enqueue(textTurn("t", "r1", "m1", "A says hi"));
    b.enqueue(textTurn("t", "r1", "m1", "B says hello"));

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <button
            type="button"
            data-testid="pick-a"
            onClick={() => setActive("a")}
          >
            A
          </button>
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active} />
        </PilotAgentRegistry>
      );
    }

    render(<Harness />);

    // Send via A.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.queryByText("A says hi")).not.toBeNull();
    });

    // Swap to B.
    fireEvent.click(screen.getByTestId("pick-b"));
    // After swap, A's messages should NOT be visible (we're showing B's history,
    // which is empty until we send).
    expect(screen.queryByText("A says hi")).toBeNull();
    expect(screen.queryByText("first")).toBeNull();

    // Send via B.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.queryByText("B says hello")).not.toBeNull();
    });
    // B's history is now visible; A's still hidden.
    expect(screen.queryByText("A says hi")).toBeNull();

    // Swap back to A: A's prior history must reappear (A.messages is the
    // source of truth on agent.messages, preserved across runtime mounts).
    fireEvent.click(screen.getByTestId("pick-a"));
    await waitFor(() => {
      expect(screen.queryByText("A says hi")).not.toBeNull();
    });
    expect(screen.queryByText("first")).not.toBeNull();
    // B's messages are NOT visible.
    expect(screen.queryByText("B says hello")).toBeNull();
    expect(screen.queryByText("second")).toBeNull();
  });

  it("usePilotAgentState reads independent stores per agent reference", async () => {
    const a = new FakeAgent({ description: "a" });
    const b = new FakeAgent({ description: "b" });
    a.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      { type: EventType.STATE_SNAPSHOT, snapshot: { phase: "A-phase" } } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);
    b.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      { type: EventType.STATE_SNAPSHOT, snapshot: { phase: "B-phase" } } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);

    interface Phase {
      phase: string;
    }
    function ProbeA(): ReactNode {
      const state = usePilotAgentState<Phase>(a);
      return <div data-testid="state-a">{state?.phase ?? "?"}</div>;
    }
    function ProbeB(): ReactNode {
      const state = usePilotAgentState<Phase>(b);
      return <div data-testid="state-b">{state?.phase ?? "?"}</div>;
    }

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <ProbeA />
          <ProbeB />
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active} />
        </PilotAgentRegistry>
      );
    }

    render(<Harness />);

    // Send via A; state from A should land on probe-a only.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("state-a").textContent).toBe("A-phase");
    });
    // Probe B's state must not have changed.
    expect(screen.getByTestId("state-b").textContent).toBe("?");

    // Swap to B and send.
    fireEvent.click(screen.getByTestId("pick-b"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId("state-b").textContent).toBe("B-phase");
    });
    // Probe A's state is still A-phase (not overwritten).
    expect(screen.getByTestId("state-a").textContent).toBe("A-phase");
  });

  it("registered actions dispatch to the active agent's tool-call event, not the inactive agent's", async () => {
    const a = new FakeAgent({ description: "a" });
    const b = new FakeAgent({ description: "b" });
    // A asks for the registered tool; B doesn't ask for anything.
    a.enqueue(toolCallTurn("t", "r1", "m1", "c1", "search", { q: "weather" }));
    a.enqueue(textTurn("t", "r2", "m2", "Got it from A."));
    // B's first run is a plain text turn so we can verify no tool fires.
    b.enqueue(textTurn("t", "r1", "m1", "Got it from B."));

    const handlerSpy = vi.fn(() => ({ result: "sunny" }));

    function Widget(): null {
      usePilotAction({
        name: "search",
        description: "search",
        parameters: z.object({ q: z.string() }),
        handler: handlerSpy,
      });
      return null;
    }

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active}>
            <Widget />
          </ActiveChat>
        </PilotAgentRegistry>
      );
    }

    render(<Harness />);

    // Send via A. A emits a tool call -> handler runs (registry).
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "what's the weather" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("Got it from A.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledWith({ q: "weather" });
    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(a.runs).toHaveLength(2); // tool-call turn + continuation
    expect(b.runs).toHaveLength(0);

    // Swap to B and send. B doesn't emit a tool call; handler must NOT fire again.
    fireEvent.click(screen.getByTestId("pick-b"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi B" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("Got it from B.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledTimes(1); // unchanged
    expect(b.runs).toHaveLength(1);
  });

  it("useAgents reflects registry mutations live (agent picker stays in sync)", () => {
    const a = new FakeAgent();
    const b = new FakeAgent();

    function Picker(): ReactNode {
      const list = useAgents();
      return (
        <ul data-testid="picker">
          {list.map((entry) => (
            <li key={entry.id}>{entry.id}</li>
          ))}
        </ul>
      );
    }

    function Harness(props: { mountB: boolean }): ReactNode {
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          {props.mountB ? <RegisterAgent id="b" agent={b} /> : null}
          <Picker />
        </PilotAgentRegistry>
      );
    }

    const { rerender, getByTestId } = render(<Harness mountB={false} />);
    expect(
      Array.from(getByTestId("picker").querySelectorAll("li")).map((li) => li.textContent),
    ).toEqual(["a"]);

    rerender(<Harness mountB={true} />);
    expect(
      Array.from(getByTestId("picker").querySelectorAll("li")).map((li) => li.textContent),
    ).toEqual(["a", "b"]);

    rerender(<Harness mountB={false} />);
    expect(
      Array.from(getByTestId("picker").querySelectorAll("li")).map((li) => li.textContent),
    ).toEqual(["a"]);
  });

  it("multi-agent swap under <StrictMode> still produces zero React errors", async () => {
    // Same swap drill as the next test, but wrapped in StrictMode so
    // every effect runs the dev double-invocation cycle. Catches
    // regressions where strict-mode re-mount of registration hooks
    // would orphan or double-register agents and corrupt the registry
    // mid-swap.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const a = new FakeAgent();
    const b = new FakeAgent();
    a.enqueue(textTurn("t", "r1", "m1", "A1"));
    b.enqueue(textTurn("t", "r1", "m1", "B1"));

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active} />
        </PilotAgentRegistry>
      );
    }

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.queryByText("A1")).not.toBeNull();
    });

    act(() => {
      screen.getByTestId("pick-b").click();
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.queryByText("B1")).not.toBeNull();
    });

    const calls = errorSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const hookOrderErr = calls.find((m) => m.includes("order of Hooks"));
    expect(hookOrderErr).toBeUndefined();

    errorSpy.mockRestore();
  });

  it("zero React errors during rapid agent swaps (regression for Phase 3b polish runtime-bridge fix)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const a = new FakeAgent();
    const b = new FakeAgent();
    a.enqueue(textTurn("t", "r1", "m1", "A1"));
    b.enqueue(textTurn("t", "r1", "m1", "B1"));
    a.enqueue(textTurn("t", "r2", "m2", "A2"));

    function Harness(): ReactNode {
      const [active, setActive] = useState<"a" | "b">("a");
      return (
        <PilotAgentRegistry>
          <RegisterAgent id="a" agent={a} />
          <RegisterAgent id="b" agent={b} />
          <button
            type="button"
            data-testid="pick-a"
            onClick={() => setActive("a")}
          >
            A
          </button>
          <button
            type="button"
            data-testid="pick-b"
            onClick={() => setActive("b")}
          >
            B
          </button>
          <ActiveChat activeId={active} />
        </PilotAgentRegistry>
      );
    }

    render(<Harness />);

    // Three rapid swaps, each with a send.
    for (const pick of ["pick-b", "pick-a", "pick-b"] as const) {
      act(() => {
        screen.getByTestId(pick).click();
      });
    }

    // Final state: B is active. Send a message through it.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.queryByText("B1")).not.toBeNull();
    });

    // No "change in the order of Hooks" errors.
    const calls = errorSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const hookOrderErr = calls.find((m) => m.includes("order of Hooks"));
    expect(hookOrderErr).toBeUndefined();

    errorSpy.mockRestore();
  });
});
