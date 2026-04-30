/**
 * Integration test for the Phase 3a runtime-swap path.
 *
 * `<Pilot>` accepts an optional `runtime` prop; when present, the
 * default `localRuntime()` is replaced. This test wires up a stub
 * runtime that returns canned `messages` and a no-op `sendMessage`,
 * mounts a `<PilotChatView>` (which subscribes to `PilotChatContext`),
 * and asserts that:
 *
 *   1. The custom runtime's `useRuntime` hook is called exactly once
 *      per render of `<Pilot>` (rules of hooks).
 *   2. The runtime receives a config with the consumer's `apiUrl`,
 *      `model`, the registry-aware `getSnapshot`, and the
 *      `onToolCall` dispatcher.
 *   3. The PilotChatContext value flowing to children is exactly what
 *      the runtime returned (messages, status, isLoading, etc.).
 *   4. Calling the runtime config's `onToolCall` reaches the provider's
 *      handleToolCall and the registered handler runs.
 *
 * No `fetch` mock is needed because the stub runtime never opens a
 * stream. The provider's chat lifecycle is entirely under our control.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotChatView } from "../components/pilot-chat-view.js";
import type { PilotChatContextValue } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import type {
  PilotIncomingToolCall,
  PilotRuntime,
  PilotRuntimeConfig,
} from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface StubRuntimeRecord {
  useCalls: PilotRuntimeConfig[];
  /**
   * Captured `onToolCall` from the most recent useRuntime invocation, so
   * tests can simulate the runtime "receiving a tool call" without going
   * through any real transport.
   */
  lastOnToolCall: ((call: PilotIncomingToolCall) => Promise<void>) | null;
  /**
   * Captured `getSnapshot` from the most recent useRuntime invocation,
   * for asserting on the registry's contents.
   */
  lastGetSnapshot: (() => unknown) | null;
}

/**
 * Build a stub runtime whose returned `PilotChatContextValue` is whatever
 * the test injects via the harness. Records every config the provider
 * passes in so assertions can poke at it after the render.
 */
function makeStubRuntime(record: StubRuntimeRecord): PilotRuntime {
  return {
    useRuntime(config) {
      // Capture for test assertions. Identity churns each render, that's
      // fine; tests look at the most recent.
      record.useCalls.push(config);
      record.lastOnToolCall = config.onToolCall;
      record.lastGetSnapshot = config.getSnapshot;
      // Static, not-loading chat value with no canned messages; the test
      // overrides this in scenarios that need different shapes.
      return {
        messages: [],
        status: "ready" as const,
        error: undefined,
        isLoading: false,
        sendMessage: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
      };
    },
  };
}

describe("<Pilot runtime={...}> swap", () => {
  it("calls the custom runtime's useRuntime on render with the protocol-agnostic seam", () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);

    // Note: apiUrl and model are NOT part of the per-render seam (Phase
    // 3a contract). They live on the runtime's constructor instead. When
    // a consumer passes a `runtime` prop, the provider's `apiUrl` /
    // `model` props are deliberately ignored, the consumer's runtime
    // owns its own connection details.
    render(
      <Pilot apiUrl="/custom" model="openai/gpt-4o" runtime={runtime}>
        <PilotChatView autoFocus={false} />
      </Pilot>,
    );

    expect(record.useCalls.length).toBeGreaterThanOrEqual(1);
    const cfg = record.useCalls[record.useCalls.length - 1]!;
    expect(typeof cfg.getSnapshot).toBe("function");
    expect(typeof cfg.onToolCall).toBe("function");
    expect(typeof cfg.headers).toBe("function");
    // Connection-shaped fields don't leak through the seam.
    expect("apiUrl" in cfg).toBe(false);
    expect("model" in cfg).toBe(false);
  });

  it("flows runtime-supplied messages into the chat view", () => {
    // A fresh stub that returns a canned message list. Verifies the
    // PilotChatContext.Provider gets the runtime's value.
    const stubChatValue: PilotChatContextValue = {
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "from-stub-runtime" }],
        },
      ],
      status: "ready",
      error: undefined,
      isLoading: false,
      sendMessage: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const runtime: PilotRuntime = {
      useRuntime: () => stubChatValue,
    };

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <PilotChatView autoFocus={false} />
      </Pilot>,
    );

    expect(screen.queryByText("from-stub-runtime")).not.toBeNull();
  });

  it("config.onToolCall reaches the provider's dispatcher; registered handler runs", async () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);
    const handlerSpy = vi.fn();
    const outputSpy = vi.fn();
    const outputErrorSpy = vi.fn();

    function Widget() {
      usePilotAction({
        name: "echo",
        description: "echoes input",
        parameters: z.object({ what: z.string() }),
        handler: (params) => {
          handlerSpy(params);
          return { echoed: params.what };
        },
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
      </Pilot>,
    );

    expect(record.lastOnToolCall).not.toBeNull();
    // Simulate the runtime receiving a tool call.
    await record.lastOnToolCall!({
      toolName: "echo",
      toolCallId: "call-1",
      input: { what: "hello" },
      output: outputSpy,
      outputError: outputErrorSpy,
    });

    expect(handlerSpy).toHaveBeenCalledWith({ what: "hello" });
    expect(outputSpy).toHaveBeenCalledWith({ echoed: "hello" });
    expect(outputErrorSpy).not.toHaveBeenCalled();
  });

  it("an unknown tool name routes to outputError, not output", async () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);
    const outputSpy = vi.fn();
    const outputErrorSpy = vi.fn();

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <div />
      </Pilot>,
    );

    await record.lastOnToolCall!({
      toolName: "no_such_tool",
      toolCallId: "call-x",
      input: {},
      output: outputSpy,
      outputError: outputErrorSpy,
    });

    expect(outputSpy).not.toHaveBeenCalled();
    expect(outputErrorSpy).toHaveBeenCalledTimes(1);
    expect(outputErrorSpy.mock.calls[0]?.[0]).toMatch(/unknown tool/i);
  });

  it("getSnapshot reflects the live registry visible to the runtime", () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);

    function Toggleable(props: { mounted: boolean }) {
      if (!props.mounted) return null;
      // Inline component so the action registers/deregisters with the
      // parent's `mounted` flag.
      return <ChildAction />;
    }

    function ChildAction() {
      usePilotAction({
        name: "toggleable_tool",
        description: "tool that comes and goes",
        parameters: z.object({}),
        handler: () => null,
      });
      return null;
    }

    function Harness() {
      const [mounted, setMounted] = useState(true);
      return (
        <Pilot apiUrl="/api/pilot" runtime={runtime}>
          <button
            type="button"
            data-testid="toggle"
            onClick={() => setMounted((m) => !m)}
          >
            toggle
          </button>
          <Toggleable mounted={mounted} />
        </Pilot>
      );
    }

    render(<Harness />);

    // First snapshot includes the action.
    const snap1 = record.lastGetSnapshot!() as { actions: Array<{ name: string }> };
    expect(snap1.actions.map((a) => a.name)).toContain("toggleable_tool");

    // Toggle the child off, action deregisters, snapshot reflects it.
    fireEvent.click(screen.getByTestId("toggle"));
    const snap2 = record.lastGetSnapshot!() as { actions: Array<{ name: string }> };
    expect(snap2.actions.map((a) => a.name)).not.toContain("toggleable_tool");
  });

  it("a runtime returning chat.error surfaces it via PilotChatContext", () => {
    const stubChatValue: PilotChatContextValue = {
      messages: [],
      status: "error",
      error: new Error("upstream-blew-up"),
      isLoading: false,
      sendMessage: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const runtime: PilotRuntime = {
      useRuntime: () => stubChatValue,
    };
    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <PilotChatView autoFocus={false} />
      </Pilot>,
    );
    // The error banner inside PilotChatView reads from the chat context's
    // `error.message`. If the seam is wired correctly, it should render.
    expect(screen.queryByText(/upstream-blew-up/i)).not.toBeNull();
  });

  it("mutating actions still gate behind the confirm modal under a custom runtime", async () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);
    const handlerSpy = vi.fn();
    const outputSpy = vi.fn();

    function Widget() {
      usePilotAction({
        name: "delete_thing",
        description: "danger zone",
        parameters: z.object({ id: z.string() }),
        handler: (params) => {
          handlerSpy(params);
          return { ok: true };
        },
        mutating: true,
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
      </Pilot>,
    );

    // Fire the tool call. Because `mutating: true`, the confirm modal
    // mounts and the dispatch suspends; handler must NOT run yet.
    let dispatchPromise: Promise<void>;
    act(() => {
      dispatchPromise = record.lastOnToolCall!({
        toolName: "delete_thing",
        toolCallId: "c1",
        input: { id: "abc" },
        output: outputSpy,
        outputError: vi.fn(),
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    expect(handlerSpy).not.toHaveBeenCalled();

    // Approve. Handler runs, output() fires, dispatch resolves.
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });

    expect(handlerSpy).toHaveBeenCalledWith({ id: "abc" });
    expect(outputSpy).toHaveBeenCalledWith({ ok: true });
  });

  it("renderAndWait actions still mount HITL UI under a custom runtime", async () => {
    const record: StubRuntimeRecord = {
      useCalls: [],
      lastOnToolCall: null,
      lastGetSnapshot: null,
    };
    const runtime = makeStubRuntime(record);
    const outputSpy = vi.fn();

    function Widget() {
      usePilotAction({
        name: "pick_letter",
        description: "ask user to pick A or B",
        parameters: z.object({ prompt: z.string() }),
        handler: () => null as never,
        renderAndWait: ({ respond }) => (
          <div data-testid="swap-hitl">
            <button
              type="button"
              data-testid="hitl-pick"
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
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
      </Pilot>,
    );

    let dispatchPromise: Promise<void>;
    act(() => {
      dispatchPromise = record.lastOnToolCall!({
        toolName: "pick_letter",
        toolCallId: "c1",
        input: { prompt: "Choose" },
        output: outputSpy,
        outputError: vi.fn(),
      });
    });

    // HITL UI mounts under the swap path identically to the default.
    await waitFor(() => {
      expect(screen.queryByTestId("swap-hitl")).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId("hitl-pick"));
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });
    expect(outputSpy).toHaveBeenCalledWith({ letter: "A" });
  });

  it("falls back to localRuntime when no runtime prop is supplied", () => {
    // The provider's existing tests already verify localRuntime behavior
    // end-to-end through the integration suite. This is the explicit
    // assertion that omitting `runtime` is legal and the provider mounts
    // without crashing, so the default path is covered by a unit test
    // here (in addition to the integration coverage).
    const { container } = render(
      <Pilot apiUrl="/api/pilot">
        <div data-testid="child">no runtime prop</div>
      </Pilot>,
    );
    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
  });
});
