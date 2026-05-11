/**
 * Test-render helper. Wraps a route subtree in the same context providers
 * the real app uses (Router + TripsContextProvider + Pilot) but with a
 * stub runtime so no real network calls fire during tests.
 *
 * The stub runtime returns the messages a test injects via `seedMessages`
 * (or an empty list) and exposes a `sendMessage` spy whose call args show
 * up via the `getSendCalls()` helper. That gives e2e tests enough to drive
 * the chat surface (suggestion chips, composer typing) without needing a
 * mocked fetch for the AI SDK 6 stream protocol.
 */

import { type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { Pilot } from "@hec-ovi/agentickit";
import type {
  PilotIncomingToolCall,
  PilotRuntime,
  PilotRuntimeConfig,
} from "@hec-ovi/agentickit";
import { TripsContextProvider } from "../shell-context";
import { ToastProvider } from "../lib/toast";

export interface RenderAppOptions {
  /** Path the MemoryRouter starts on. Defaults to `/`. */
  path?: string;
  /** Initial messages the stub runtime exposes (default: empty list). */
  seedMessages?: ReadonlyArray<unknown>;
}

export interface RenderedApp {
  rtl: RenderResult;
  /** Returns the args of every `sendMessage` call made via the stub runtime. */
  getSendCalls: () => Array<unknown>;
  /**
   * Dispatch a tool call through the framework registry, the same way
   * the runtime would. Returns `{ output }` on success or `{ error }`
   * if the dispatcher hit an error (e.g., tool not registered, handler
   * threw, Zod parse failed). Use this in integration tests to drive a
   * plugin without needing a real LLM.
   */
  fireToolCall: (call: {
    toolName: string;
    toolCallId?: string;
    input?: unknown;
  }) => Promise<{ output?: unknown; error?: string }>;
}

export function renderApp(ui: ReactNode, options: RenderAppOptions = {}): RenderedApp {
  const sendSpy = vi.fn(async (..._args: unknown[]) => {});

  // Captured by the stub runtime's useRuntime closure so tests can
  // synthesize a tool call through the same code path the real runtime
  // uses. Set once on the first useRuntime call; subsequent renders
  // re-use the same `onToolCall` reference via the provider.
  let capturedOnToolCall: ((c: PilotIncomingToolCall) => Promise<void>) | null = null;

  const runtime: PilotRuntime = {
    useRuntime(config: PilotRuntimeConfig) {
      capturedOnToolCall = config.onToolCall;
      return {
        messages: (options.seedMessages ?? []) as ReadonlyArray<never>,
        status: "ready" as const,
        error: undefined,
        isLoading: false,
        sendMessage: sendSpy,
        stop: vi.fn(async () => {}),
      };
    },
  };

  const rtl = render(
    <MemoryRouter initialEntries={[options.path ?? "/"]}>
      <TripsContextProvider>
        <ToastProvider>
          <Pilot runtime={runtime}>{ui}</Pilot>
        </ToastProvider>
      </TripsContextProvider>
    </MemoryRouter>,
  );

  const fireToolCall: RenderedApp["fireToolCall"] = async (call) => {
    if (!capturedOnToolCall) {
      throw new Error(
        "fireToolCall: stub runtime hasn't been mounted yet. Did the render run?",
      );
    }
    let output: unknown;
    let error: string | undefined;
    await capturedOnToolCall({
      toolName: call.toolName,
      toolCallId: call.toolCallId ?? `tc-${Math.random().toString(36).slice(2, 8)}`,
      input: call.input ?? {},
      output: (val) => {
        output = val;
      },
      outputError: (err) => {
        error = err;
      },
    });
    return error !== undefined ? { error } : { output };
  };

  return {
    rtl,
    getSendCalls: () => sendSpy.mock.calls.map((call) => call[0]),
    fireToolCall,
  };
}
