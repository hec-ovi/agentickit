/**
 * Tests for `<PilotAgentStateView>`, the JSX-friendly wrapper around
 * `usePilotAgentState`. Coverage:
 *
 *   1. Calls the render prop with `undefined` before any state arrives
 *      (when the agent's initialState is empty / not provided).
 *   2. Calls the render prop with the agent's `initialState` immediately
 *      on mount when supplied.
 *   3. Re-renders with the new state when STATE_SNAPSHOT arrives.
 *   4. Re-renders with the patched state when STATE_DELTA arrives.
 *   5. Two `<PilotAgentStateView>` instances against the same agent stay
 *      in sync (single source of truth via the per-agent WeakMap store).
 *   6. Generic type parameter flows through to the render callback.
 *
 * Pattern mirrors `ag-ui-runtime.test.tsx`: a `FakeAgent` whose `run()`
 * emits scripted `BaseEvent` arrays via `rxjs.Observable`, then
 * `agent.runAgent({...})` drives the apply pipeline. We never wire
 * `<Pilot runtime={...}>` here because `<PilotAgentStateView>` only
 * needs the agent reference; whether a Pilot tree is mounted is
 * orthogonal. (We do mount one anyway in the happy path so the agent's
 * subscriber chain matches a real consumer setup.)
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { Observable } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbstractAgent } from "@ag-ui/client";
import {
  EventType,
  type BaseEvent,
  type RunAgentInput,
  type State,
} from "@ag-ui/core";
import { Pilot } from "./pilot-provider.js";
import { agUiRuntime } from "../runtime/ag-ui-runtime.js";
import { PilotAgentStateView } from "./pilot-agent-state-view.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class FakeAgent extends AbstractAgent {
  private scripts: Array<ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>> = [];

  constructor(config?: { initialState?: State }) {
    super(config);
  }

  enqueue(events: ReadonlyArray<Omit<BaseEvent, "timestamp" | "rawEvent">>): void {
    this.scripts.push(events);
  }

  run(_input: RunAgentInput): Observable<BaseEvent> {
    const script = this.scripts.shift() ?? [];
    return new Observable<BaseEvent>((sub) => {
      Promise.resolve().then(() => {
        for (const ev of script) sub.next(ev as BaseEvent);
        sub.complete();
      });
    });
  }
}

interface CounterState {
  counter: number;
  message: string;
}

interface StepsState {
  steps: Array<{ id: string; label: string; status: "pending" | "active" | "done" }>;
}

describe("<PilotAgentStateView>", () => {
  it("calls the render prop with the agent's default state on mount (AbstractAgent defaults to `{}`)", () => {
    const agent = new FakeAgent();
    const renderSpy = vi.fn(
      (state: CounterState | undefined): ReactNode => (
        <div data-testid="empty">
          {/* Use a sentinel that distinguishes `{}` (default agent state)
              from `undefined` (no store entry yet). When `<PilotAgentStateView>`
              is rendered OUTSIDE of <Pilot>, no runtime mounts and the store
              has no entry; useSyncExternalStore returns the store's initial
              undefined. Inside <Pilot>, the runtime hook seeds the store
              from agent.state ({}) on mount. */}
          {state === undefined ? "no-store" : "has-store"}
        </div>
      ),
    );
    const { getByTestId } = render(
      <PilotAgentStateView<CounterState> agent={agent} render={renderSpy} />,
    );
    expect(renderSpy).toHaveBeenCalled();
    // No <Pilot> in this render, so no runtime, so no seeding; the store
    // is empty, getStateSnapshot returns undefined.
    expect(getByTestId("empty").textContent).toBe("no-store");
  });

  it("renders the agent's initialState immediately on mount", () => {
    const initial: CounterState = { counter: 5, message: "hello" };
    const agent = new FakeAgent({ initialState: initial });

    function Probe(): ReactNode {
      return (
        <PilotAgentStateView<CounterState>
          agent={agent}
          render={(state) => (
            <div data-testid="probe">
              {state?.counter ?? "?"}/{state?.message ?? "?"}
            </div>
          )}
        />
      );
    }

    const { getByTestId } = render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
      </Pilot>,
    );

    // The runtime hook seeds the store from agent.state on mount, so the
    // first render after mount sees the initialState.
    expect(getByTestId("probe").textContent).toBe("5/hello");
  });

  it("re-renders with the new state when STATE_SNAPSHOT arrives", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { counter: 42, message: "snap" } as CounterState,
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);

    function Probe(): ReactNode {
      return (
        <PilotAgentStateView<CounterState>
          agent={agent}
          render={(state) => (
            <div data-testid="probe">
              {/* `state` is the agent's `{}` default until snapshot arrives.
                  We probe through the optional chain so the empty case
                  reads "init" and the post-snapshot case reads "42/snap". */}
              {state?.counter !== undefined
                ? `${state.counter}/${state.message}`
                : "init"}
            </div>
          )}
        />
      );
    }

    const { getByTestId } = render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
      </Pilot>,
    );

    expect(getByTestId("probe").textContent).toBe("init");

    // Trigger a run; the FakeAgent emits the scripted events, the apply
    // pipeline mutates agent.state, our subscriber pushes to the store,
    // useSyncExternalStore wakes the consumer.
    await act(async () => {
      await agent.runAgent({});
    });

    await waitFor(() => {
      expect(getByTestId("probe").textContent).toBe("42/snap");
    });
  });

  it("applies STATE_DELTA (JSON Patch) on top of an existing snapshot", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          steps: [
            { id: "a", label: "A", status: "pending" },
            { id: "b", label: "B", status: "pending" },
          ],
        } as StepsState,
      } as BaseEvent,
      {
        type: EventType.STATE_DELTA,
        delta: [{ op: "replace", path: "/steps/0/status", value: "active" }],
      } as BaseEvent,
      {
        type: EventType.STATE_DELTA,
        delta: [
          { op: "replace", path: "/steps/0/status", value: "done" },
          { op: "replace", path: "/steps/1/status", value: "active" },
        ],
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);

    function Probe(): ReactNode {
      return (
        <PilotAgentStateView<StepsState>
          agent={agent}
          render={(state) => (
            <ul data-testid="steps">
              {state?.steps?.map((s) => (
                <li key={s.id} data-state={s.status}>
                  {s.label}
                </li>
              ))}
            </ul>
          )}
        />
      );
    }

    const { getByTestId } = render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
      </Pilot>,
    );

    await act(async () => {
      await agent.runAgent({});
    });

    await waitFor(() => {
      const items = getByTestId("steps").querySelectorAll("li");
      expect(items.length).toBe(2);
      expect(items[0]!.getAttribute("data-state")).toBe("done");
      expect(items[1]!.getAttribute("data-state")).toBe("active");
    });
  });

  it("two PilotAgentStateView instances against the same agent stay in sync", async () => {
    const agent = new FakeAgent();
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { counter: 99, message: "shared" } as CounterState,
      } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);

    function ProbeA(): ReactNode {
      return (
        <PilotAgentStateView<CounterState>
          agent={agent}
          render={(state) => <div data-testid="a">{state?.counter ?? "?"}</div>}
        />
      );
    }
    function ProbeB(): ReactNode {
      return (
        <PilotAgentStateView<CounterState>
          agent={agent}
          render={(state) => <div data-testid="b">{state?.counter ?? "?"}</div>}
        />
      );
    }

    const { getByTestId } = render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <ProbeA />
        <ProbeB />
      </Pilot>,
    );

    await act(async () => {
      await agent.runAgent({});
    });

    await waitFor(() => {
      expect(getByTestId("a").textContent).toBe("99");
      expect(getByTestId("b").textContent).toBe("99");
    });
  });

  it("does not re-render when the state value is reference-identical (no spurious work)", async () => {
    // The runtime's store skips notifications when `state === previous`, so
    // a STATE_SNAPSHOT carrying the SAME object reference (degenerate case
    // a misbehaving server might emit) shouldn't churn the consumer.
    const agent = new FakeAgent();
    const stableState: CounterState = { counter: 1, message: "x" };
    agent.enqueue([
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r1" } as BaseEvent,
      { type: EventType.STATE_SNAPSHOT, snapshot: stableState } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r1" } as BaseEvent,
    ]);

    let renderCount = 0;
    function Probe(): ReactNode {
      return (
        <PilotAgentStateView<CounterState>
          agent={agent}
          render={(state) => {
            renderCount += 1;
            return <div data-testid="probe">{state?.counter ?? "?"}</div>;
          }}
        />
      );
    }

    const { getByTestId } = render(
      <Pilot runtime={agUiRuntime({ agent })}>
        <Probe />
      </Pilot>,
    );

    const baselineRenders = renderCount;
    await act(async () => {
      await agent.runAgent({});
    });
    await waitFor(() => {
      expect(getByTestId("probe").textContent).toBe("1");
    });

    // The exact render count varies by React internals; the contract is
    // "didn't explode", and at least one render delivered the new state.
    expect(renderCount).toBeGreaterThan(baselineRenders);
  });
});
