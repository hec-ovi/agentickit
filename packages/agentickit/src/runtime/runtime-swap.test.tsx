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
import { type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotChatView } from "../components/pilot-chat-view.js";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
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

// ----------------------------------------------------------------------
// Scripted-runtime user-flow tests.
//
// The seam tests above call the runtime's onToolCall callback directly,
// which is fine for proving the contract (provider's dispatcher receives
// runtime-emitted calls and resolves them via output/outputError). They
// don't, however, exercise the path a real user takes: type, send,
// the runtime drives a tool call, the modal/HITL appears, the user
// clicks, the result lands.
//
// `makeScriptedRuntime` is a test-only PilotRuntime that, on every
// sendMessage(text), runs through a scripted sequence of steps:
//   - tool-call: invokes config.onToolCall and waits for output()
//   - text: appends an assistant text message to the runtime's state
//
// No fetch, no SSE, no API credit. Tests interact with real <Pilot>
// chrome via fireEvent; the runtime drives the seam in response.
// ----------------------------------------------------------------------

type ScriptStep =
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "text"; text: string };

interface ScriptedRecord {
  /** sendMessage texts the user (or the chat-driver button) submitted. */
  readonly sentMessages: string[];
  /** Tool outputs that came back from the provider, in order. */
  readonly toolOutputs: Array<
    | { kind: "output"; toolCallId: string; value: unknown }
    | { kind: "error"; toolCallId: string; errorText: string }
  >;
}

function makeScriptedRuntime(
  scripts: ReadonlyArray<ReadonlyArray<ScriptStep>>,
  record: ScriptedRecord,
  options: { simulateError?: Error } = {},
): PilotRuntime {
  return {
    useRuntime(config: PilotRuntimeConfig): PilotChatContextValue {
      const [messages, setMessages] = useState<unknown[]>([]);
      const [status, setStatus] = useState<"ready" | "streaming">("ready");
      const scriptIndexRef = useRef(0);
      // Capture-by-ref so the dispatcher closure inside the runtime sees
      // the latest provider-supplied handleToolCall.
      const onToolCallRef = useRef(config.onToolCall);
      onToolCallRef.current = config.onToolCall;

      const sendMessage = useCallback(async (text: string): Promise<void> => {
        const idx = scriptIndexRef.current++;
        record.sentMessages.push(text);
        const script = scripts[idx];
        if (!script) return;

        setStatus("streaming");
        // Append the user's message first so the suggestion-chip-hidden
        // path matches a real conversation (PilotChatView hides chips
        // once messages.length > 0).
        setMessages((m) => [
          ...m,
          { id: `u${idx}`, role: "user", parts: [{ type: "text", text }] },
        ]);

        for (const step of script) {
          if (step.type === "tool-call") {
            // Invoke the dispatcher and wait for it to settle the call
            // via output() or outputError(). The Promise wrapper makes
            // the fire-and-forget callbacks awaitable.
            await new Promise<void>((resolve) => {
              void onToolCallRef.current({
                toolName: step.toolName,
                toolCallId: step.toolCallId,
                input: step.input,
                output: (value) => {
                  record.toolOutputs.push({
                    kind: "output",
                    toolCallId: step.toolCallId,
                    value,
                  });
                  // Mirror the AI SDK 6 wire format: an assistant message
                  // with a `dynamic-tool` part in `output-available`.
                  setMessages((m) => [
                    ...m,
                    {
                      id: `t${step.toolCallId}`,
                      role: "assistant",
                      parts: [
                        {
                          type: "dynamic-tool",
                          toolName: step.toolName,
                          toolCallId: step.toolCallId,
                          state: "output-available",
                          input: step.input,
                          output: value,
                        },
                      ],
                    },
                  ]);
                  resolve();
                },
                outputError: (errorText) => {
                  record.toolOutputs.push({
                    kind: "error",
                    toolCallId: step.toolCallId,
                    errorText,
                  });
                  setMessages((m) => [
                    ...m,
                    {
                      id: `t${step.toolCallId}`,
                      role: "assistant",
                      parts: [
                        {
                          type: "dynamic-tool",
                          toolName: step.toolName,
                          toolCallId: step.toolCallId,
                          state: "output-error",
                          input: step.input,
                          errorText,
                        },
                      ],
                    },
                  ]);
                  resolve();
                },
              });
            });
          } else if (step.type === "text") {
            setMessages((m) => [
              ...m,
              {
                id: `a${idx}-${m.length}`,
                role: "assistant",
                parts: [{ type: "text", text: step.text }],
              },
            ]);
          }
        }

        setStatus("ready");
      }, []);

      return {
        messages,
        status,
        error: options.simulateError,
        isLoading: status === "streaming",
        sendMessage,
        stop: async () => {},
      };
    },
  };
}

/**
 * Test driver: a button that calls `chat.sendMessage(text)` when clicked.
 * Lets us exercise the user flow ("user types and sends") without
 * routing through the composer's autosize textarea (which would force
 * us to also drive keyboard events, an orthogonal concern to the
 * runtime-swap path under test).
 */
function ChatDriver(props: { text: string; testId?: string }): ReactNode {
  const chat = useContext(PilotChatContext);
  if (!chat) return null;
  return (
    <button
      type="button"
      data-testid={props.testId ?? "user-send"}
      onClick={() => void chat.sendMessage(props.text)}
    >
      send
    </button>
  );
}

describe("<Pilot runtime={...}> user flows", () => {
  it("user clicks send, scripted runtime emits a tool call, action handler runs, model replies", async () => {
    const record: ScriptedRecord = { sentMessages: [], toolOutputs: [] };
    const runtime = makeScriptedRuntime(
      [
        [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "lookup",
            input: { q: "weather" },
          },
          { type: "text", text: "It's sunny." },
        ],
      ],
      record,
    );

    const handlerSpy = vi.fn(() => ({ result: "sunny, 72F" }));
    function Widget() {
      usePilotAction({
        name: "lookup",
        description: "look something up",
        parameters: z.object({ q: z.string() }),
        handler: handlerSpy,
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
        <ChatDriver text="What's the weather?" />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    fireEvent.click(screen.getByTestId("user-send"));

    // Final assistant text appears after the tool call resolves.
    await waitFor(() => {
      expect(screen.queryByText("It's sunny.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledWith({ q: "weather" });
    expect(record.sentMessages).toEqual(["What's the weather?"]);
    expect(record.toolOutputs).toEqual([
      { kind: "output", toolCallId: "c1", value: { result: "sunny, 72F" } },
    ]);
  });

  it("mutating action: confirm modal gates the user flow under a custom runtime", async () => {
    const record: ScriptedRecord = { sentMessages: [], toolOutputs: [] };
    const runtime = makeScriptedRuntime(
      [
        [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "delete_thing",
            input: { id: "abc" },
          },
          { type: "text", text: "Deleted." },
        ],
      ],
      record,
    );

    const handlerSpy = vi.fn(() => ({ ok: true }));
    function Widget() {
      usePilotAction({
        name: "delete_thing",
        description: "danger",
        parameters: z.object({ id: z.string() }),
        handler: handlerSpy,
        mutating: true,
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
        <ChatDriver text="please delete abc" />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    // User sends. Confirm modal mounts; handler has not yet run.
    fireEvent.click(screen.getByTestId("user-send"));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    expect(handlerSpy).not.toHaveBeenCalled();

    // User approves. Handler runs, scripted runtime emits the next step,
    // assistant text lands.
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => {
      expect(screen.queryByText("Deleted.")).not.toBeNull();
    });
    expect(handlerSpy).toHaveBeenCalledWith({ id: "abc" });
    expect(record.toolOutputs[0]).toEqual({
      kind: "output",
      toolCallId: "c1",
      value: { ok: true },
    });
  });

  it("mutating action: declining the confirm modal short-circuits the dispatch", async () => {
    const record: ScriptedRecord = { sentMessages: [], toolOutputs: [] };
    const runtime = makeScriptedRuntime(
      [
        [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "delete_thing",
            input: { id: "xyz" },
          },
          { type: "text", text: "OK, leaving it alone." },
        ],
      ],
      record,
    );

    const handlerSpy = vi.fn();
    function Widget() {
      usePilotAction({
        name: "delete_thing",
        description: "danger",
        parameters: z.object({ id: z.string() }),
        handler: handlerSpy,
        mutating: true,
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
        <ChatDriver text="delete xyz" />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    fireEvent.click(screen.getByTestId("user-send"));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText("OK, leaving it alone.")).not.toBeNull();
    });
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(record.toolOutputs[0]).toEqual({
      kind: "output",
      toolCallId: "c1",
      value: { ok: false, reason: "User declined." },
    });
  });

  it("renderAndWait: HITL UI mounts mid-flow, user picks a value, conversation continues", async () => {
    const record: ScriptedRecord = { sentMessages: [], toolOutputs: [] };
    const runtime = makeScriptedRuntime(
      [
        [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "pick_letter",
            input: { prompt: "Pick A or B" },
          },
          { type: "text", text: "Got it: A." },
        ],
      ],
      record,
    );

    function Widget() {
      usePilotAction({
        name: "pick_letter",
        description: "ask user",
        parameters: z.object({ prompt: z.string() }),
        handler: () => null as never,
        renderAndWait: ({ input, respond, cancel }) => (
          <div data-testid="hitl">
            <span>{(input as { prompt: string }).prompt}</span>
            <button
              type="button"
              data-testid="hitl-pick-a"
              onClick={() => respond({ letter: "A" })}
            >
              A
            </button>
            <button
              type="button"
              data-testid="hitl-cancel"
              onClick={() => cancel("user-skipped")}
            >
              skip
            </button>
          </div>
        ),
      });
      return null;
    }

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <Widget />
        <ChatDriver text="please ask" />
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    fireEvent.click(screen.getByTestId("user-send"));
    await waitFor(() => {
      expect(screen.queryByTestId("hitl")).not.toBeNull();
    });
    expect(screen.getByText("Pick A or B")).toBeDefined();

    fireEvent.click(screen.getByTestId("hitl-pick-a"));
    await waitFor(() => {
      expect(screen.queryByText("Got it: A.")).not.toBeNull();
    });
    expect(record.toolOutputs[0]).toEqual({
      kind: "output",
      toolCallId: "c1",
      value: { letter: "A" },
    });
    // HITL unmounts after respond.
    expect(screen.queryByTestId("hitl")).toBeNull();
  });

  it("scripted runtime returns chat.error: error banner surfaces in PilotChatView", () => {
    const record: ScriptedRecord = { sentMessages: [], toolOutputs: [] };
    const runtime = makeScriptedRuntime([], record, {
      simulateError: new Error("scripted-runtime-error"),
    });

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <PilotChatView autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );
    expect(screen.queryByText(/scripted-runtime-error/)).not.toBeNull();
  });
});
