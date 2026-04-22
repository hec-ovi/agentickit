/**
 * Small debug-logging facility used by `createPilotHandler` when `debug` or
 * `log` are enabled. Kept in its own module so the handler file stays focused
 * on request handling.
 *
 * Two sinks, both optional:
 *   - Console: plain `console.log` / `console.warn`.
 *   - File:    append-only text log at `./debug/agentickit-YYYY-MM-DD.log`
 *              (configurable directory). Opened via `node:fs/promises`, so
 *              it silently no-ops under edge runtimes that don't ship `fs`.
 *
 * Writes are fire-and-forget. The logger never throws — a full disk or a
 * denied path can't break a live chat. Secrets are never inspected or
 * logged; callers are expected to pass only presentational payloads.
 */

import { randomBytes } from "node:crypto";

export interface PilotLogger {
  /** A short 6-char hex id used to group lines from one request. */
  readonly requestId: string;
  /** Log a single line to all enabled sinks. */
  line(kind: LogKind, message: string): void;
  /** Child logger with the same sinks but a fresh request id. */
  forRequest(): PilotLogger;
}

export type LogKind = "in" | "out" | "step" | "done" | "err" | "info";

export interface LoggerConfig {
  console: boolean;
  /** Directory for append-only log files, or `null` to disable file output. */
  dir: string | null;
}

/**
 * Build a logger from the `debug` / `log` options passed to `createPilotHandler`.
 *
 * - `log === true`  → default directory `./debug`
 * - `log === "foo"` → directory `foo` (resolved relative to `process.cwd()`)
 * - `log === false` → no file output
 */
export function buildLoggerConfig(debug: boolean, log: boolean | string | undefined): LoggerConfig {
  const dir = log === true ? "debug" : typeof log === "string" && log.length > 0 ? log : null;
  return { console: Boolean(debug), dir };
}

/** Returns the noop logger when both sinks are disabled. */
export function createPilotLogger(cfg: LoggerConfig): PilotLogger {
  if (!cfg.console && cfg.dir === null) return NOOP_LOGGER;

  const fileSink = cfg.dir !== null ? createFileSink(cfg.dir) : null;

  const makeLogger = (requestId: string): PilotLogger => ({
    requestId,
    line(kind: LogKind, message: string): void {
      const prefix = `[agentickit:${requestId}]`;
      const symbol = KIND_SYMBOL[kind];
      const formatted = `${prefix} ${symbol} ${message}`;
      if (cfg.console) {
        if (kind === "err") console.warn(formatted);
        else console.log(formatted);
      }
      if (fileSink) {
        const stamp = new Date().toISOString();
        fileSink.append(`${stamp} ${formatted}\n`);
      }
    },
    forRequest(): PilotLogger {
      return makeLogger(shortId());
    },
  });

  return makeLogger(shortId());
}

const NOOP_LOGGER: PilotLogger = {
  requestId: "noop",
  line() {},
  forRequest() {
    return this;
  },
};

const KIND_SYMBOL: Record<LogKind, string> = {
  in: "→",
  out: "←",
  step: "·",
  done: "✓",
  err: "✗",
  info: "i",
};

function shortId(): string {
  return randomBytes(3).toString("hex");
}

/**
 * File sink that lazily opens `node:fs/promises`, resolves the log path, and
 * creates the directory on first write. Subsequent writes reuse the cached
 * module handle.
 *
 * Per-line writes use `appendFile` — slower than a long-lived stream but
 * safer across request handlers that can be hot-reloaded / torn down without
 * a chance to close file handles. The volume is "one line per model step",
 * which is negligible against the cost of an LLM call.
 */
function createFileSink(dir: string): { append: (line: string) => void } {
  type FsModule = typeof import("node:fs/promises");
  type PathModule = typeof import("node:path");

  let cached: Promise<{ fs: FsModule; path: PathModule; resolvedDir: string } | null> | null = null;
  const load = (): Promise<{ fs: FsModule; path: PathModule; resolvedDir: string } | null> => {
    if (cached) return cached;
    cached = (async (): Promise<{
      fs: FsModule;
      path: PathModule;
      resolvedDir: string;
    } | null> => {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const resolvedDir = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
        await fs.mkdir(resolvedDir, { recursive: true });
        return { fs, path, resolvedDir };
      } catch {
        return null;
      }
    })();
    return cached;
  };

  return {
    append(line: string): void {
      void load().then(async (mod) => {
        if (!mod) return;
        try {
          const day = new Date().toISOString().slice(0, 10);
          const file = mod.path.join(mod.resolvedDir, `agentickit-${day}.log`);
          await mod.fs.appendFile(file, line);
        } catch {
          // Swallow — logging must never break a live request.
        }
      });
    },
  };
}

/**
 * Compact transcript of a UI message for the log. Pulls out role + a short
 * representation of each content part (text is truncated; tool calls list
 * name + a stringified input; tool results list name + whether it errored).
 */
export function summarizeUiMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "<invalid>";
  const m = msg as { role?: unknown; parts?: unknown };
  const role = typeof m.role === "string" ? m.role : "?";
  const parts = Array.isArray(m.parts) ? m.parts : [];
  if (parts.length === 0) return `${role}: <empty>`;
  const summaries = parts.map(summarizePart).filter((s) => s.length > 0);
  return `${role}: ${summaries.join(" | ")}`;
}

function summarizePart(part: unknown): string {
  if (!part || typeof part !== "object") return "";
  const p = part as { type?: unknown };
  const type = typeof p.type === "string" ? p.type : "";

  if (type === "text") {
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" ? truncate(text, 160) : "";
  }
  if (type === "reasoning") {
    return "(reasoning)";
  }
  if (type.startsWith("tool-")) {
    const toolName = type === "dynamic-tool" ? String((part as { toolName?: unknown }).toolName ?? "?") : type.slice("tool-".length);
    const state = (part as { state?: unknown }).state;
    if (state === "output-available") {
      const output = truncate(safeJson((part as { output?: unknown }).output), 120);
      return `tool-result ${toolName} → ${output}`;
    }
    if (state === "output-error") {
      return `tool-error ${toolName}: ${truncate(String((part as { errorText?: unknown }).errorText ?? ""), 120)}`;
    }
    // Input-available / streaming states land here — log the input we saw.
    const input = (part as { input?: unknown }).input;
    return `tool-call ${toolName}(${truncate(safeJson(input), 120)})`;
  }
  return type || "";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function safeJson(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
