/**
 * Test helpers for simulating the AI-SDK 6 UI-message stream.
 *
 * Real conversations produce a sequence of `data: <json>\n\n` chunks over
 * `text/event-stream`; `useChat` parses them into `UIMessage` parts. For
 * integration tests we want to drive the same parser deterministically
 * without running a model. The two helpers below together let a test:
 *
 *   1. Describe a conversation turn as a plain array of event objects.
 *   2. Swap `globalThis.fetch` for a script-driven mock that hands those
 *      events back to `useChat` as a real SSE response.
 *
 * Event shapes come straight from the live captures we recorded against
 * vLLM today. Keeping fixtures minimal — only the events `useChat`
 * actually reads — so a regression in an event name breaks the test
 * before it breaks a user.
 */

/**
 * One entry in a UI-message stream. The AI SDK's full union is much
 * larger, but only these variants appear in the scenarios we exercise.
 */
export type PilotStreamEvent =
  | { type: "start" }
  | { type: "finish" }
  | { type: "start-step" }
  | { type: "finish-step" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | {
      type: "tool-input-start";
      toolCallId: string;
      toolName: string;
      dynamic?: boolean;
    }
  | {
      type: "tool-input-delta";
      toolCallId: string;
      inputTextDelta: string;
    }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input: unknown;
      dynamic?: boolean;
    };

/**
 * Build a `Response` whose body is a `ReadableStream` of SSE frames, one
 * per event. We yield to the event loop between frames so `useChat`'s
 * parser sees them arrive incrementally (not all in one microtask burst)
 * — closer to real network behavior, and it surfaces race conditions
 * that a single-shot response would hide.
 *
 * Options:
 *   - `keepOpen`: when true, the stream emits `events` and then stays
 *     open indefinitely (no `[DONE]`, no `close()`). Needed to test the
 *     client's abort path (`chat.stop()`).
 *   - `delayMs`: per-frame delay (default 0, just a microtask yield).
 */
export function createSseResponse(
  events: ReadonlyArray<PilotStreamEvent>,
  options: { keepOpen?: boolean; delayMs?: number; signal?: AbortSignal } = {},
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // For keepOpen streams we also listen to the consumer's abort
      // signal (from fetch init.signal) so chat.stop() can actually
      // tear down the reader. Without this the parked promise keeps
      // the response "live" even after the client aborts.
      let aborted = false;
      const abortListener = () => {
        aborted = true;
        try {
          controller.error(new DOMException("aborted", "AbortError"));
        } catch {
          /* stream already closed */
        }
      };
      if (options.signal) {
        if (options.signal.aborted) abortListener();
        else options.signal.addEventListener("abort", abortListener, { once: true });
      }
      try {
        for (const event of events) {
          if (aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
          else await Promise.resolve();
        }
        if (options.keepOpen) {
          // Park until abort fires.
          await new Promise<void>((resolve) => {
            if (aborted) return resolve();
            if (options.signal) {
              options.signal.addEventListener("abort", () => resolve(), { once: true });
            }
            // Otherwise sit here forever; the test framework's timeout
            // will terminate us if the consumer never aborts.
          });
        } else {
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      } catch {
        // ReadableStream's start may receive a cancel signal; swallow so
        // vitest doesn't flag an unhandled rejection.
      }
    },
    cancel() {
      // Consumer aborted via reader.cancel() — we already propagate via
      // the signal listener, so nothing more to do here.
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

export interface MockPilotFetchController {
  /** Push the events a future POST will receive, in FIFO order. */
  push(events: ReadonlyArray<PilotStreamEvent>): void;
  /**
   * Push a response that streams its events then parks forever. Used to
   * test the abort / stop() path — the only way to end this is the
   * consumer calling `AbortController.abort()` on the fetch.
   */
  pushOpen(events: ReadonlyArray<PilotStreamEvent>): void;
  /** All intercepted calls so far. */
  readonly calls: ReadonlyArray<RecordedCall>;
  /** Clear both the response queue and the recorded calls. */
  reset(): void;
  /** Restore the original fetch. Call in `afterEach`. */
  restore(): void;
  /** Convenience: # of POST /api/pilot calls observed. */
  pilotPostCount(): number;
}

/**
 * Replace `globalThis.fetch` with a script-driven mock. Each intercepted
 * POST to `/api/pilot` drains one event list from the queue and returns
 * it as a streaming SSE response. Non-POSTs (or calls with an empty
 * queue) are rejected loudly so a test mistake never falls through to
 * a surprise real-network call.
 */
interface QueueEntry {
  readonly events: ReadonlyArray<PilotStreamEvent>;
  readonly keepOpen: boolean;
}

export interface RecordedCallWithHeaders extends RecordedCall {
  readonly headers: Record<string, string>;
}

export function installPilotFetchMock(options: { apiUrl?: string } = {}): MockPilotFetchController {
  const apiUrl = options.apiUrl ?? "/api/pilot";
  const queue: QueueEntry[] = [];
  const calls: RecordedCallWithHeaders[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const method =
      init?.method ?? (typeof input === "object" && input !== null ? (input as Request).method : "GET");
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const headers = flattenHeaders(init?.headers);
    calls.push({ url, method: method ?? "GET", body, headers });

    if (!url.endsWith(apiUrl) && !url.includes(`${apiUrl}?`)) {
      throw new Error(`installPilotFetchMock: unexpected fetch to ${url}`);
    }
    if (method !== "POST") {
      throw new Error(`installPilotFetchMock: expected POST, got ${method}`);
    }
    const entry = queue.shift();
    if (!entry) {
      throw new Error(
        `installPilotFetchMock: no scripted response for POST ${url} (call #${calls.length}). Push one before sending.`,
      );
    }
    return createSseResponse(entry.events, {
      keepOpen: entry.keepOpen,
      ...(init?.signal ? { signal: init.signal } : {}),
    });
  }) as typeof fetch;

  return {
    push(events) {
      queue.push({ events, keepOpen: false });
    },
    pushOpen(events) {
      queue.push({ events, keepOpen: true });
    },
    calls,
    reset() {
      queue.length = 0;
      calls.length = 0;
    },
    restore() {
      globalThis.fetch = original;
    },
    pilotPostCount() {
      return calls.filter((c) => c.method === "POST" && c.url.endsWith(apiUrl)).length;
    },
  };
}

function flattenHeaders(init: RequestInit["headers"] | undefined): Record<string, string> {
  if (!init) return {};
  const out: Record<string, string> = {};
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
  } else if (Array.isArray(init)) {
    for (const [k, v] of init) out[k.toLowerCase()] = String(v);
  } else {
    for (const [k, v] of Object.entries(init)) out[k.toLowerCase()] = String(v);
  }
  return out;
}

/**
 * Fixture: a tool-calling turn. Mirrors what vLLM's Responses API sent us
 * today after the `openai.chat()` shim landed — start/start-step,
 * tool-input-start, one delta carrying the full JSON input, tool-input-
 * available (the event that flips the part to executable), finish-step,
 * finish. Keeping it to a single delta makes the fixture readable; real
 * traffic streams the JSON character-by-character but `useChat` accepts
 * either.
 */
export function toolCallTurn(options: {
  toolCallId: string;
  toolName: string;
  input: unknown;
}): PilotStreamEvent[] {
  const inputJson = JSON.stringify(options.input);
  return [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-start",
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      dynamic: true,
    },
    {
      type: "tool-input-delta",
      toolCallId: options.toolCallId,
      inputTextDelta: inputJson,
    },
    {
      type: "tool-input-available",
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      input: options.input,
      dynamic: true,
    },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

/**
 * Fixture: a plain text reply turn.
 */
export function textReplyTurn(options: { id: string; text: string }): PilotStreamEvent[] {
  return [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: options.id },
    { type: "text-delta", id: options.id, delta: options.text },
    { type: "text-end", id: options.id },
    { type: "finish-step" },
    { type: "finish" },
  ];
}
