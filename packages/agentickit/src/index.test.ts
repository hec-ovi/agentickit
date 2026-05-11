/**
 * Locks the package's public export surface.
 *
 * The package's public API is whatever `src/index.ts` re-exports; nothing
 * else is reachable from a published install. This test enumerates the
 * exact set of exported names so an accidental re-export (or a removal
 * during refactor) shows up as a failing test rather than silently
 * tightening or expanding the contract.
 *
 * The test only checks names, NOT shapes — type-level checks are TS's job
 * (`tsc --noEmit` runs alongside `vitest run`). The point of THIS file is
 * "the consumer-visible API surface is exactly N names today, and any
 * change to that count needs an explicit edit here, which forces the
 * author to think about CHANGELOG + semver implications."
 */

import { describe, expect, it } from "vitest";
import * as publicApi from "./index.js";

const EXPECTED_EXPORTS = [
  // Hooks
  "usePilotAction",
  "usePilotState",
  "usePilotForm",
  "usePilotInstructions",
  "useRegisterAgent",
  "useAgent",
  "useAgents",
  "usePilotAgentState",
  "usePilotAgentActivity",
  // Provider + chat surfaces
  "Pilot",
  "PilotSidebar",
  "PilotPopup",
  "PilotModal",
  "PilotChatView",
  // Generative UI + confirm modal + multi-agent registry
  "PilotAgentStateView",
  "PilotConfirmModal",
  "PilotAgentRegistry",
  // Runtimes
  "localRuntime",
  "agUiRuntime",
] as const;

describe("public API surface", () => {
  it("exports exactly the documented set of runtime values (no accidents, no surprise removals)", () => {
    const actual = Object.keys(publicApi).sort();
    const expected = [...EXPECTED_EXPORTS].sort();
    expect(actual).toEqual(expected);
  });

  it("does NOT export removed types (PilotMessage, PilotMessagePart) — those were vestigial Phase-0 placeholders", () => {
    expect((publicApi as Record<string, unknown>).PilotMessage).toBeUndefined();
    expect((publicApi as Record<string, unknown>).PilotMessagePart).toBeUndefined();
  });

  it("does NOT export internal helpers (formatJson, isDev, randomId, PilotSidebarStandalone)", () => {
    // These have been deliberately scoped to the package's interior. If
    // any of them appears here, a refactor accidentally widened the API.
    const internalNames = ["formatJson", "isDev", "randomId", "PilotSidebarStandalone"];
    for (const name of internalNames) {
      expect((publicApi as Record<string, unknown>)[name]).toBeUndefined();
    }
  });
});
