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
 */
export function createSseResponse(events: ReadonlyArray<PilotStreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        await Promise.resolve();
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
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
export function installPilotFetchMock(options: { apiUrl?: string } = {}): MockPilotFetchController {
  const apiUrl = options.apiUrl ?? "/api/pilot";
  const queue: Array<ReadonlyArray<PilotStreamEvent>> = [];
  const calls: RecordedCall[] = [];
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
    calls.push({ url, method: method ?? "GET", body });

    if (!url.endsWith(apiUrl) && !url.includes(`${apiUrl}?`)) {
      throw new Error(`installPilotFetchMock: unexpected fetch to ${url}`);
    }
    if (method !== "POST") {
      throw new Error(`installPilotFetchMock: expected POST, got ${method}`);
    }
    const events = queue.shift();
    if (!events) {
      throw new Error(
        `installPilotFetchMock: no scripted response for POST ${url} (call #${calls.length}). Push one before sending.`,
      );
    }
    return createSseResponse(events);
  }) as typeof fetch;

  return {
    push(events) {
      queue.push(events);
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
