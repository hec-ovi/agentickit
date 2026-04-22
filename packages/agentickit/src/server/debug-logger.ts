/**
 * Debug-logging facility used by `createPilotHandler` when `debug`, `log`, or
 * `onLogEvent` are set. Three sinks, all optional and independent:
 *
 *   - Console: plain `console.log` / `console.warn`.
 *   - File:    append-only text log at `./debug/agentickit-YYYY-MM-DD.log`
 *              (configurable directory). Opened via `node:fs/promises`, so
 *              it silently no-ops under edge runtimes that don't ship `fs`.
 *   - Event:   in-process callback invoked with a structured {@link PilotLogEvent}
 *              on every line. Consumers wire this to whatever transport they
 *              want — SSE, WebSocket, EventEmitter — to visualize the
 *              tool-calling loop live.
 *
 * Writes and callback invocations are fire-and-forget. The logger never
 * throws: a full disk, a denied path, or a subscriber that throws can't
 * break a live chat. Secrets are never inspected or logged; callers are
 * expected to pass only presentational payloads.
 */

import { randomBytes } from "node:crypto";

export type LogKind = "in" | "out" | "step" | "done" | "err" | "info";

/**
 * Structured log event emitted to the `onEvent` subscriber.
 *
 * `meta` is optional side-channel for richer payloads (tool call inputs,
 * usage counts). The `message` field is always present and is exactly what
 * the console / file sinks emit, so subscribers have a one-line fallback
 * when `meta` isn't known.
 */
export interface PilotLogEvent {
  /** ISO timestamp (millisecond precision). */
  readonly ts: string;
  /** 6-char hex id grouping lines from one request. */
  readonly requestId: string;
  readonly kind: LogKind;
  readonly message: string;
  readonly meta?: PilotLogEventMeta;
}

/**
 * Optional structured extras attached to a log event. The handler attaches
 * these for tool calls, usage summaries, and errors so a UI can render cards
 * instead of grep-ing free text.
 */
export interface PilotLogEventMeta {
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly toolOutput?: unknown;
  /** Names of client-declared tools advertised in the request. */
  readonly toolNames?: ReadonlyArray<string>;
  readonly finishReason?: string;
  readonly steps?: number;
  readonly usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  readonly text?: string;
  readonly errorMessage?: string;
  /** Compact shape of a UI message logged on the "in" path. */
  readonly uiMessage?: { readonly role: string; readonly summary: string };
  /** Number of messages in the request body, logged at request start. */
  readonly messageCount?: number;
  /** The `model` string sent with the request (per-request override, if any). */
  readonly model?: string;
}

export interface PilotLogger {
  /** A short 6-char hex id used to group lines from one request. */
  readonly requestId: string;
  /** Log a single line to all enabled sinks. */
  line(kind: LogKind, message: string, meta?: PilotLogEventMeta): void;
  /** Child logger with the same sinks but a fresh request id. */
  forRequest(): PilotLogger;
}

export interface LoggerConfig {
  console: boolean;
  /** Directory for append-only log files, or `null` to disable file output. */
  dir: string | null;
  /**
   * Optional structured-event subscriber. Called synchronously on every
   * `line()`. Exceptions thrown by the subscriber are swallowed so a faulty
   * integration can't crash the handler.
   */
  onEvent?: (event: PilotLogEvent) => void;
}

/**
 * Build a logger from the `debug` / `log` options passed to `createPilotHandler`.
 *
 * - `log === true`  → default directory `./debug`
 * - `log === "foo"` → directory `foo` (resolved relative to `process.cwd()`)
 * - `log === false` → no file output
 */
export function buildLoggerConfig(
  debug: boolean,
  log: boolean | string | undefined,
  onEvent?: (event: PilotLogEvent) => void,
): LoggerConfig {
  const dir = log === true ? "debug" : typeof log === "string" && log.length > 0 ? log : null;
  return { console: Boolean(debug), dir, onEvent };
}

/** Returns the noop logger when all sinks are disabled. */
export function createPilotLogger(cfg: LoggerConfig): PilotLogger {
  if (!cfg.console && cfg.dir === null && !cfg.onEvent) return NOOP_LOGGER;

  const fileSink = cfg.dir !== null ? createFileSink(cfg.dir) : null;

  const makeLogger = (requestId: string): PilotLogger => ({
    requestId,
    line(kind: LogKind, message: string, meta?: PilotLogEventMeta): void {
      const ts = new Date().toISOString();
      const prefix = `[agentickit:${requestId}]`;
      const symbol = KIND_SYMBOL[kind];
      const formatted = `${prefix} ${symbol} ${message}`;
      if (cfg.console) {
        if (kind === "err") console.warn(formatted);
        else console.log(formatted);
      }
      if (fileSink) {
        fileSink.append(`${ts} ${formatted}\n`);
      }
      if (cfg.onEvent) {
        try {
          cfg.onEvent({ ts, requestId, kind, message, ...(meta ? { meta } : {}) });
        } catch {
          // Subscriber must never break the handler.
        }
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
    const toolName =
      type === "dynamic-tool"
        ? String((part as { toolName?: unknown }).toolName ?? "?")
        : type.slice("tool-".length);
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
