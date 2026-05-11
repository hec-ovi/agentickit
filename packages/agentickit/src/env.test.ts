/**
 * Tests for the package's single `isDev()` helper.
 *
 * Used by both the React side (every dev-only `console.warn` for
 * misconfigured hooks) and the server side (handler-level dev-only error
 * details, prompt-loader logging). Three independent code paths read the
 * function: React hooks, the server handler, the AG-UI runtime. If the
 * heuristic ever changes, all three should change in lockstep, and the
 * easiest way to enforce that is one helper plus one test file.
 */

import { afterEach, describe, expect, it } from "vitest";
import { isDev } from "./env.js";

const ORIGINAL = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL;
});

describe("isDev", () => {
  it("returns true when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    expect(isDev()).toBe(true);
  });

  it("returns true for 'development'", () => {
    process.env.NODE_ENV = "development";
    expect(isDev()).toBe(true);
  });

  it("returns true for 'test' (matches React's heuristic)", () => {
    process.env.NODE_ENV = "test";
    expect(isDev()).toBe(true);
  });

  it("returns false ONLY for the exact string 'production'", () => {
    process.env.NODE_ENV = "production";
    expect(isDev()).toBe(false);
  });

  it("treats unknown values as dev (anything not 'production')", () => {
    process.env.NODE_ENV = "staging";
    expect(isDev()).toBe(true);
    process.env.NODE_ENV = "PRODUCTION"; // case-sensitive
    expect(isDev()).toBe(true);
  });

  it("survives an environment with no `process` (browser bundles strip it)", () => {
    // The helper reads `process` off `globalThis` defensively for browser
    // bundles where the global isn't shimmed. We simulate by temporarily
    // stashing it.
    const stashed = (globalThis as { process?: unknown }).process;
    (globalThis as { process?: unknown }).process = undefined;
    try {
      expect(isDev()).toBe(true);
    } finally {
      (globalThis as { process?: unknown }).process = stashed;
    }
  });
});
