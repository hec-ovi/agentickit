/**
 * Tests for the debug logger. Covers the three sinks (console, file, event)
 * independently and together, plus the noop shortcut, meta-passing, and
 * the fail-safe path (subscriber that throws must not break the chain).
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLoggerConfig,
  createPilotLogger,
  type PilotLogEvent,
  summarizeUiMessage,
} from "./debug-logger.js";

describe("buildLoggerConfig", () => {
  it("disables both sinks when debug=false and log=false", () => {
    const cfg = buildLoggerConfig(false, false);
    expect(cfg.console).toBe(false);
    expect(cfg.dir).toBe(null);
  });

  it("enables console when debug=true", () => {
    const cfg = buildLoggerConfig(true, false);
    expect(cfg.console).toBe(true);
    expect(cfg.dir).toBe(null);
  });

  it("uses default ./debug directory when log=true", () => {
    const cfg = buildLoggerConfig(false, true);
    expect(cfg.dir).toBe("debug");
  });

  it("uses the string as-is when log is a custom directory", () => {
    const cfg = buildLoggerConfig(false, "my-logs");
    expect(cfg.dir).toBe("my-logs");
  });

  it("attaches the onEvent subscriber when passed", () => {
    const subscriber = vi.fn();
    const cfg = buildLoggerConfig(false, false, subscriber);
    expect(cfg.onEvent).toBe(subscriber);
  });

  it("treats empty-string log as disabled", () => {
    const cfg = buildLoggerConfig(false, "");
    expect(cfg.dir).toBe(null);
  });
});

describe("createPilotLogger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns a noop logger when every sink is disabled", () => {
    const logger = createPilotLogger({ console: false, dir: null });
    logger.line("info", "nothing should land anywhere");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("writes to the console when console=true", () => {
    const logger = createPilotLogger({ console: true, dir: null });
    logger.line("in", "hello");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const line = String(consoleSpy.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("[agentickit:");
    expect(line).toContain("→"); // kind=in symbol
    expect(line).toContain("hello");
  });

  it("routes err-kind lines to console.warn", () => {
    const logger = createPilotLogger({ console: true, dir: null });
    logger.line("err", "boom");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("emits a structured event on onEvent with ts, requestId, kind, message", () => {
    const events: PilotLogEvent[] = [];
    const logger = createPilotLogger({
      console: false,
      dir: null,
      onEvent: (event) => events.push(event),
    });
    logger.line("step", "did the thing", { finishReason: "stop" });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.kind).toBe("step");
    expect(event?.message).toBe("did the thing");
    expect(event?.requestId).toMatch(/^[a-f0-9]{6}$/);
    expect(event?.meta?.finishReason).toBe("stop");
    // ISO timestamp format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(event?.ts).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it("omits meta from the event when none is passed", () => {
    const events: PilotLogEvent[] = [];
    const logger = createPilotLogger({
      console: false,
      dir: null,
      onEvent: (e) => events.push(e),
    });
    logger.line("in", "plain");
    expect(events[0]?.meta).toBeUndefined();
  });

  it("survives a throwing subscriber without breaking later lines", () => {
    const events: PilotLogEvent[] = [];
    let callCount = 0;
    const logger = createPilotLogger({
      console: false,
      dir: null,
      onEvent: (event) => {
        callCount++;
        if (callCount === 1) throw new Error("subscriber exploded");
        events.push(event);
      },
    });
    // First call invokes the throwing branch; must not propagate.
    expect(() => logger.line("in", "first")).not.toThrow();
    // Second call still lands in the subscriber.
    logger.line("in", "second");
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe("second");
  });

  it("groups lines from one requestId; forRequest() yields a fresh id", () => {
    const events: PilotLogEvent[] = [];
    const base = createPilotLogger({
      console: false,
      dir: null,
      onEvent: (e) => events.push(e),
    });
    base.line("in", "a");
    base.line("in", "b");
    const child = base.forRequest();
    child.line("in", "c");

    expect(events).toHaveLength(3);
    expect(events[0]?.requestId).toBe(events[1]?.requestId);
    expect(events[2]?.requestId).not.toBe(events[0]?.requestId);
  });

  it("writes lines to a daily log file when dir is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentickit-log-"));
    try {
      const logger = createPilotLogger({ console: false, dir });
      logger.line("done", "flushed");
      // File writes are fire-and-forget; wait a tick for the promise chain.
      await new Promise((r) => setTimeout(r, 50));
      const files = readdirSync(dir);
      expect(files.length).toBeGreaterThan(0);
      const day = new Date().toISOString().slice(0, 10);
      const hit = files.find((f) => f === `agentickit-${day}.log`);
      expect(hit).toBeDefined();
      if (hit) {
        const contents = readFileSync(join(dir, hit), "utf-8");
        expect(contents).toContain("flushed");
        expect(contents).toContain("[agentickit:");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("summarizeUiMessage", () => {
  it("summarizes a text part with role + truncated text", () => {
    const msg = {
      role: "user",
      parts: [{ type: "text", text: "hello there" }],
    };
    expect(summarizeUiMessage(msg)).toBe("user: hello there");
  });

  it("labels tool-call parts with name and input", () => {
    const msg = {
      role: "assistant",
      parts: [
        {
          type: "tool-add_todo",
          state: "input-available",
          input: { text: "buy milk" },
        },
      ],
    };
    const summary = summarizeUiMessage(msg);
    expect(summary).toContain("tool-call add_todo");
    expect(summary).toContain("buy milk");
  });

  it("labels completed tool results with output", () => {
    const msg = {
      role: "assistant",
      parts: [
        {
          type: "tool-add_todo",
          state: "output-available",
          output: { id: "t1" },
        },
      ],
    };
    expect(summarizeUiMessage(msg)).toContain("tool-result add_todo");
  });

  it("marks error tool results", () => {
    const msg = {
      role: "assistant",
      parts: [
        {
          type: "tool-add_todo",
          state: "output-error",
          errorText: "nope",
        },
      ],
    };
    expect(summarizeUiMessage(msg)).toContain("tool-error add_todo");
  });

  it("handles empty parts array", () => {
    expect(summarizeUiMessage({ role: "user", parts: [] })).toBe("user: <empty>");
  });

  it("defaults the role to ? when missing", () => {
    expect(summarizeUiMessage({ parts: [{ type: "text", text: "hi" }] })).toContain("?:");
  });

  it("returns <invalid> for non-object input", () => {
    expect(summarizeUiMessage(null)).toBe("<invalid>");
    expect(summarizeUiMessage(42)).toBe("<invalid>");
  });
});
