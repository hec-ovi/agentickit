/**
 * Tests for {@link usePilotState}. Covers the read-only path, the
 * auto-generated `update_<name>` tool when `setValue` is supplied, and the
 * out-of-provider warning.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useContext, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pilot } from "../components/pilot-provider.js";
import { PilotRegistryContext } from "../context.js";
import { usePilotState } from "./use-pilot-state.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePilotState", () => {
  it("registers a read-only state entry when setValue is omitted", () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function TestState() {
      usePilotState({
        name: "count",
        description: "a counter",
        value: 42,
        schema: z.number(),
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <TestState />
      </Pilot>,
    );

    const snap = registry?.getSnapshot();
    expect(snap?.states).toHaveLength(1);
    expect(snap?.states[0]?.name).toBe("count");
    expect(snap?.states[0]?.value).toBe(42);
    // No auto-update action because setValue is absent.
    expect(snap?.actions).toHaveLength(0);
  });

  it("registers an update_<name> action when setValue is provided", async () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;
    const updates: number[] = [];

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function TestState() {
      const [count, setCount] = useState(0);
      usePilotState({
        name: "count",
        description: "a counter",
        value: count,
        schema: z.number(),
        setValue: (next) => {
          updates.push(next);
          setCount(next);
        },
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <TestState />
      </Pilot>,
    );

    const snap = registry?.getSnapshot();
    expect(snap?.actions).toHaveLength(1);
    const updateAction = snap?.actions.find((a) => a.name === "update_count");
    expect(updateAction).toBeDefined();
    expect(updateAction?.mutating).toBe(true);

    // Invoke the generated update action directly.
    await act(async () => {
      await updateAction?.handler(7);
    });
    expect(updates).toEqual([7]);
  });

  it("does not crash when used outside a <Pilot> provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Orphan() {
      usePilotState({
        name: "lonely",
        description: "no provider",
        value: 0,
        schema: z.number(),
      });
      return <div>ok</div>;
    }

    const { getByText } = render(<Orphan />);
    expect(getByText("ok")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('usePilotState("lonely")'));
  });
});
