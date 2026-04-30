/**
 * Unit tests for the multi-agent registry primitives:
 *   - <PilotAgentRegistry> provider
 *   - useRegisterAgent(id, factory)
 *   - useAgent(id)
 *   - useAgents()
 *
 * No `<Pilot>` mounted; we test the registry layer in isolation.
 * Integration with the runtime / chat surfaces is covered separately in
 * `runtime/multi-agent.test.tsx`.
 *
 * The `FakeAgent` extends `AbstractAgent` with a no-op `run()` so we get
 * a valid agent instance the registry can hold without any network or
 * apply pipeline work.
 */

import { act, cleanup, render } from "@testing-library/react";
import { type ReactNode, useState, StrictMode } from "react";
import { Observable } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbstractAgent } from "@ag-ui/client";
import type { BaseEvent, RunAgentInput } from "@ag-ui/core";
import {
  PilotAgentRegistry,
} from "../components/pilot-agent-registry.js";
import { useAgent } from "./use-agent.js";
import { useAgents } from "./use-agents.js";
import { useRegisterAgent } from "./use-register-agent.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class FakeAgent extends AbstractAgent {
  public abortRunCalls = 0;
  run(_input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((sub) => sub.complete());
  }
  abortRun(): void {
    this.abortRunCalls += 1;
    super.abortRun();
  }
}

describe("<PilotAgentRegistry> provider", () => {
  it("mounts with an empty registry (useAgents returns [])", () => {
    let captured: ReadonlyArray<{ id: string }> | null = null;
    function Probe(): null {
      const list = useAgents();
      captured = list as ReadonlyArray<{ id: string }>;
      return null;
    }
    render(
      <PilotAgentRegistry>
        <Probe />
      </PilotAgentRegistry>,
    );
    expect(captured).toEqual([]);
  });

  it("returns empty list when no provider is mounted (graceful fallback)", () => {
    let captured: ReadonlyArray<{ id: string }> | null = null;
    function Probe(): null {
      captured = useAgents() as ReadonlyArray<{ id: string }>;
      return null;
    }
    render(<Probe />);
    expect(captured).toEqual([]);
  });

  it("useAgent returns undefined when no provider is mounted", () => {
    let captured: unknown = "sentinel";
    function Probe(): null {
      captured = useAgent("missing");
      return null;
    }
    render(<Probe />);
    expect(captured).toBeUndefined();
  });
});

describe("useRegisterAgent", () => {
  it("registers the agent on mount and exposes it via useAgent", () => {
    const factory = vi.fn(() => new FakeAgent({ description: "research" }));

    function Register(): null {
      useRegisterAgent("research", factory);
      return null;
    }
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      observed = useAgent("research");
      return null;
    }

    render(
      <PilotAgentRegistry>
        <Register />
        <Probe />
      </PilotAgentRegistry>,
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(observed).toBeDefined();
    expect(observed?.description).toBe("research");
  });

  it("calls the factory exactly once even after re-renders", () => {
    const factory = vi.fn(() => new FakeAgent());

    function Register(): null {
      useRegisterAgent("agent-x", factory);
      return null;
    }
    function Harness(): ReactNode {
      // Force a re-render via a state bump to make sure the factory
      // doesn't get re-invoked.
      const [, setN] = useState(0);
      return (
        <PilotAgentRegistry>
          <Register />
          <button type="button" data-testid="bump" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
        </PilotAgentRegistry>
      );
    }
    const { getByTestId } = render(<Harness />);
    expect(factory).toHaveBeenCalledTimes(1);
    act(() => {
      getByTestId("bump").click();
    });
    act(() => {
      getByTestId("bump").click();
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("deregisters on unmount but does NOT call agent.abortRun() (runtime owns abort)", () => {
    // The hook intentionally does not call abortRun in cleanup. Aborting
    // is a runtime-layer concern (the runtime owns the in-flight stream
    // and exposes its own `stop()` callback). If two `useRegisterAgent`
    // calls share the same agent reference under different ids, an
    // unmount-time abort on one would tear down a run the other
    // registration's runtime is mid-stream on; the registry stays out of
    // the way.
    const agent = new FakeAgent();

    function Register(): null {
      useRegisterAgent("a", () => agent);
      return null;
    }
    function Harness(props: { mounted: boolean }): ReactNode {
      return (
        <PilotAgentRegistry>
          {props.mounted ? <Register /> : null}
          <Probe />
        </PilotAgentRegistry>
      );
    }
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      observed = useAgent("a");
      return null;
    }

    const { rerender } = render(<Harness mounted={true} />);
    expect(observed).toBe(agent);
    expect(agent.abortRunCalls).toBe(0);

    rerender(<Harness mounted={false} />);
    expect(observed).toBeUndefined();
    // Cleanup deregisters but does NOT abort the agent's run.
    expect(agent.abortRunCalls).toBe(0);
  });

  it("last-wins on duplicate id (second registration replaces the first)", () => {
    const a = new FakeAgent({ description: "first" });
    const b = new FakeAgent({ description: "second" });

    function RegisterA(): null {
      useRegisterAgent("dup", () => a);
      return null;
    }
    function RegisterB(): null {
      useRegisterAgent("dup", () => b);
      return null;
    }
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      observed = useAgent("dup");
      return null;
    }

    function Harness(props: { which: "a" | "both" | "b" }): ReactNode {
      return (
        <PilotAgentRegistry>
          {props.which !== "b" ? <RegisterA /> : null}
          {props.which !== "a" ? <RegisterB /> : null}
          <Probe />
        </PilotAgentRegistry>
      );
    }

    const { rerender } = render(<Harness which="a" />);
    expect(observed?.description).toBe("first");

    rerender(<Harness which="both" />);
    // Both registered: last-wins -> "second" (the one mounted later).
    expect(observed?.description).toBe("second");

    rerender(<Harness which="b" />);
    // First was unmounted; second is still there.
    expect(observed?.description).toBe("second");
  });

  it("a stale cleanup does NOT remove a fresh registration that took the same id", () => {
    // Order: RegisterA mounts -> registers as "x" with handle h1.
    // RegisterB mounts -> registers as "x" with handle h2 (replaces).
    // RegisterA unmounts -> cleanup MUST NOT remove h2 (stale handle).
    const a = new FakeAgent({ description: "first" });
    const b = new FakeAgent({ description: "second" });

    function RegisterA(): null {
      useRegisterAgent("x", () => a);
      return null;
    }
    function RegisterB(): null {
      useRegisterAgent("x", () => b);
      return null;
    }
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      observed = useAgent("x");
      return null;
    }

    // Step 1: only A mounted.
    function Step1(): ReactNode {
      return (
        <PilotAgentRegistry>
          <RegisterA />
          <Probe />
        </PilotAgentRegistry>
      );
    }
    function Step2(): ReactNode {
      return (
        <PilotAgentRegistry>
          <RegisterA />
          <RegisterB />
          <Probe />
        </PilotAgentRegistry>
      );
    }
    function Step3(): ReactNode {
      return (
        <PilotAgentRegistry>
          <RegisterB />
          <Probe />
        </PilotAgentRegistry>
      );
    }

    const { rerender } = render(<Step1 />);
    expect(observed?.description).toBe("first");

    rerender(<Step2 />);
    expect(observed?.description).toBe("second");

    rerender(<Step3 />);
    // A unmounted; its stale cleanup must not have evicted B.
    expect(observed?.description).toBe("second");
  });

  it("strict-mode safe: register/cleanup/register pair converges to one live registration", () => {
    const factory = vi.fn(() => new FakeAgent());

    function Register(): null {
      useRegisterAgent("strict", factory);
      return null;
    }
    function Probe(): ReactNode {
      const list = useAgents();
      return <div data-testid="count">{list.length}</div>;
    }

    const { getByTestId } = render(
      <StrictMode>
        <PilotAgentRegistry>
          <Register />
          <Probe />
        </PilotAgentRegistry>
      </StrictMode>,
    );
    // After StrictMode's mount-cleanup-mount cycle, exactly one
    // registration should live on.
    expect(getByTestId("count").textContent).toBe("1");
    // Factory under StrictMode runs twice (once per render pass) BUT the
    // ref keeps the first instance; the second is discarded. We don't
    // strictly enforce a count here because React's StrictMode behavior
    // can change; the important contract is that the LIVE registration
    // count is 1.
    expect(factory.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("useAgent", () => {
  it("returns undefined for an unknown id, then re-renders when the id is registered", () => {
    let renderCount = 0;
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      renderCount += 1;
      observed = useAgent("late");
      return null;
    }

    function Late(props: { mount: boolean }): ReactNode {
      if (!props.mount) return null;
      function Reg(): null {
        useRegisterAgent("late", () => new FakeAgent({ description: "late-arrival" }));
        return null;
      }
      return <Reg />;
    }

    function Harness(props: { mountLate: boolean }): ReactNode {
      return (
        <PilotAgentRegistry>
          <Probe />
          <Late mount={props.mountLate} />
        </PilotAgentRegistry>
      );
    }

    const { rerender } = render(<Harness mountLate={false} />);
    expect(observed).toBeUndefined();

    const beforeMount = renderCount;
    rerender(<Harness mountLate={true} />);
    expect(observed?.description).toBe("late-arrival");
    expect(renderCount).toBeGreaterThan(beforeMount);
  });

  it("returns a stable agent reference between unrelated re-renders", () => {
    // Concern: useAgent() must not "tear" when consumer parents re-render
    // for unrelated reasons. Once the agent is registered, the returned
    // reference between subsequent mutations should be `===` to the same
    // registration's agent.
    //
    // Note on the initial-undefined sample: the very first render of the
    // Probe component runs BEFORE Reg's `useEffect` flushes (effects fire
    // bottom-up after the render pass). So `useAgent` initially returns
    // undefined, then the registry notifies and the next render returns
    // the agent. This test asserts stability AFTER the first
    // post-registration observation.
    const agent = new FakeAgent();

    const observed: Array<AbstractAgent | undefined> = [];
    function Probe(): null {
      observed.push(useAgent("stable"));
      return null;
    }
    function Reg(): null {
      useRegisterAgent("stable", () => agent);
      return null;
    }
    function Harness(): ReactNode {
      const [, setN] = useState(0);
      return (
        <PilotAgentRegistry>
          <Reg />
          <Probe />
          <button type="button" data-testid="bump" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
        </PilotAgentRegistry>
      );
    }

    const { getByTestId } = render(<Harness />);
    // After mount + effect flush, the latest sample should be the agent.
    const latest = observed[observed.length - 1];
    expect(latest).toBe(agent);
    const samplesBefore = observed.length;

    act(() => {
      getByTestId("bump").click();
    });
    act(() => {
      getByTestId("bump").click();
    });

    // Every sample taken AFTER the agent was first observed must still
    // reference the same agent (no torn read between unrelated renders).
    const firstAgentSampleIndex = observed.findIndex((ref) => ref === agent);
    expect(firstAgentSampleIndex).toBeGreaterThanOrEqual(0);
    for (let i = firstAgentSampleIndex; i < observed.length; i++) {
      expect(observed[i]).toBe(agent);
    }
    // And the bumps actually re-rendered the probe.
    expect(observed.length).toBeGreaterThan(samplesBefore);
  });

  it("re-renders when the id is unregistered", () => {
    let observed: AbstractAgent | undefined;
    function Probe(): null {
      observed = useAgent("temp");
      return null;
    }

    function Reg(): null {
      useRegisterAgent("temp", () => new FakeAgent());
      return null;
    }

    function Harness(props: { mount: boolean }): ReactNode {
      return (
        <PilotAgentRegistry>
          {props.mount ? <Reg /> : null}
          <Probe />
        </PilotAgentRegistry>
      );
    }

    const { rerender } = render(<Harness mount={true} />);
    expect(observed).toBeDefined();

    rerender(<Harness mount={false} />);
    expect(observed).toBeUndefined();
  });
});

describe("useAgents", () => {
  it("returns the list in registration order", () => {
    let captured: ReadonlyArray<{ id: string }> | null = null;
    function Probe(): null {
      captured = useAgents() as ReadonlyArray<{ id: string }>;
      return null;
    }
    function Reg(props: { id: string }): null {
      useRegisterAgent(props.id, () => new FakeAgent());
      return null;
    }
    render(
      <PilotAgentRegistry>
        <Reg id="research" />
        <Reg id="code" />
        <Reg id="writing" />
        <Probe />
      </PilotAgentRegistry>,
    );
    expect(captured?.map((e) => e.id)).toEqual(["research", "code", "writing"]);
  });

  it("returns a stable reference across reads when the registry has not mutated", () => {
    let firstSnapshot: unknown = null;
    let secondSnapshot: unknown = null;
    let renderCount = 0;
    function Probe(): null {
      renderCount += 1;
      const snap = useAgents();
      if (renderCount === 1) firstSnapshot = snap;
      if (renderCount > 1) secondSnapshot = snap;
      return null;
    }

    function Harness(): ReactNode {
      const [, setN] = useState(0);
      return (
        <PilotAgentRegistry>
          <Probe />
          <button type="button" data-testid="bump" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
        </PilotAgentRegistry>
      );
    }

    const { getByTestId } = render(<Harness />);
    act(() => {
      getByTestId("bump").click();
    });
    // The registry didn't mutate, so getSnapshot returned the same array.
    expect(firstSnapshot).toBe(secondSnapshot);
  });
});
