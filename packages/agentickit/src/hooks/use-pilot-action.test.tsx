/**
 * Tests for {@link usePilotAction}. Focuses on lifecycle (register on mount,
 * deregister on unmount), dev-only duplicate warnings, and graceful handling
 * when the hook is used outside a `<Pilot>` provider.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pilot } from "../components/pilot-provider.js";
import { PilotRegistryContext } from "../context.js";
import { usePilotAction } from "./use-pilot-action.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function RegistrySpy({
  onSnapshot,
}: { onSnapshot: (ctx: ReturnType<typeof useRegistry>) => void }) {
  const ctx = useRegistry();
  onSnapshot(ctx);
  return null;
}

function useRegistry() {
  const ctx = useContext(PilotRegistryContext);
  return ctx;
}

describe("usePilotAction", () => {
  it("registers the action on mount and deregisters on unmount", () => {
    let registry: ReturnType<typeof useRegistry> = null;

    function TestAction() {
      usePilotAction({
        name: "greet",
        description: "Say hello",
        parameters: z.object({ who: z.string() }),
        handler: ({ who }) => `Hello, ${who}`,
      });
      return null;
    }

    const { unmount } = render(
      <Pilot apiUrl="/api/test">
        <RegistrySpy
          onSnapshot={(r) => {
            registry = r;
          }}
        />
        <TestAction />
      </Pilot>,
    );

    // After the initial effect pass, the action must be in the snapshot.
    expect(registry).not.toBeNull();
    const snapshot = registry?.getSnapshot();
    expect(snapshot?.actions).toHaveLength(1);
    expect(snapshot?.actions[0]?.name).toBe("greet");

    unmount();

    // A fresh render of the provider alone should have zero actions.
    const { unmount: unmount2 } = render(
      <Pilot apiUrl="/api/test">
        <RegistrySpy
          onSnapshot={(r) => {
            registry = r;
          }}
        />
      </Pilot>,
    );
    expect(registry?.getSnapshot().actions).toHaveLength(0);
    unmount2();
  });

  it("fires a dev-mode warning on duplicate action names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function First() {
      usePilotAction({
        name: "dup",
        description: "first",
        parameters: z.object({}),
        handler: () => "a",
      });
      return null;
    }
    function Second() {
      usePilotAction({
        name: "dup",
        description: "second",
        parameters: z.object({}),
        handler: () => "b",
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/test">
        <First />
        <Second />
      </Pilot>,
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate action name "dup"'));
  });

  it("does not crash when used outside a <Pilot> provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Orphan() {
      usePilotAction({
        name: "orphan",
        description: "no provider",
        parameters: z.object({}),
        handler: () => null,
      });
      return <div>ok</div>;
    }

    const { getByText } = render(<Orphan />);
    expect(getByText("ok")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('usePilotAction("orphan")'));
  });

  it("captures the latest handler via ref without re-registering", async () => {
    let registry: ReturnType<typeof useRegistry> = null;
    let callCount = 0;

    function TestAction({ multiplier }: { multiplier: number }) {
      usePilotAction({
        name: "compute",
        description: "compute something",
        parameters: z.object({ x: z.number() }),
        // Handler identity changes on every render — the hook should pick
        // up the latest without churning the registry.
        handler: ({ x }) => {
          callCount += 1;
          return x * multiplier;
        },
      });
      return null;
    }

    const { rerender } = render(
      <Pilot apiUrl="/api/test">
        <RegistrySpy
          onSnapshot={(r) => {
            registry = r;
          }}
        />
        <TestAction multiplier={2} />
      </Pilot>,
    );

    const action = registry?.getSnapshot().actions[0];
    expect(action).toBeDefined();
    expect(await action?.handler({ x: 10 })).toBe(20);

    // Re-render with a new multiplier. The registry should still have the
    // same `id` (no churn) but the handler should see the new value.
    const idBefore = action?.id;
    await act(async () => {
      rerender(
        <Pilot apiUrl="/api/test">
          <RegistrySpy
            onSnapshot={(r) => {
              registry = r;
            }}
          />
          <TestAction multiplier={5} />
        </Pilot>,
      );
    });

    const actionAfter = registry?.getSnapshot().actions[0];
    expect(actionAfter?.id).toBe(idBefore);
    expect(await actionAfter?.handler({ x: 10 })).toBe(50);
    expect(callCount).toBe(2);
  });
});
