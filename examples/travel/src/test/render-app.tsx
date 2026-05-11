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
import type { PilotRuntime, PilotRuntimeConfig } from "@hec-ovi/agentickit";
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
}

export function renderApp(ui: ReactNode, options: RenderAppOptions = {}): RenderedApp {
  const sendSpy = vi.fn(async (..._args: unknown[]) => {});

  // Stub runtime: same shape the real `localRuntime` uses (it's a
  // PilotRuntime impl), no network involved. Tests that need to assert on
  // the user's chat actions can read `getSendCalls()`.
  const runtime: PilotRuntime = {
    useRuntime(_config: PilotRuntimeConfig) {
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

  return {
    rtl,
    getSendCalls: () => sendSpy.mock.calls.map((call) => call[0]),
  };
}
