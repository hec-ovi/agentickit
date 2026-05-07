import { describe, expect, it } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { createPilotHandler } from "./handler.js";

/**
 * Live integration tests against a running vLLM server.
 *
 * Gated on `VLLM_BASE_URL` (e.g. `http://127.0.0.1:8000/v1`). Without it the
 * whole describe is skipped, so CI without vLLM stays green and the skip is
 * visible in the run output. The mocked unit tests in `handler.test.ts` cover
 * the routing logic; this file proves the wire-level contract holds against
 * a real server.
 *
 * Three rules this file enforces for vLLM:
 *   1. Streaming on   - assertions read the SSE stream incrementally.
 *   2. Reasoning off  - injected via `chat_template_kwargs.enable_thinking`
 *                       through a custom `fetch` (matches the example).
 *   3. Responses only - models built with `client.responses(modelId)`; the
 *                       endpoint marker `providerMetadata.openai.itemId` is
 *                       checked in stream frames.
 *
 * Run:  VLLM_BASE_URL=http://127.0.0.1:8000/v1 pnpm test
 *       (optionally  VLLM_MODEL=Qwen3.6-27B-AWQ4)
 */

const VLLM_BASE_URL = process.env.VLLM_BASE_URL;
const VLLM_MODEL = process.env.VLLM_MODEL ?? "Qwen3.6-27B-AWQ4";
const TEST_TIMEOUT = 120_000;

interface UIFrame {
  type: string;
  [key: string]: unknown;
}

interface StreamCapture {
  frames: UIFrame[];
  byType: (type: string) => UIFrame[];
  raw: string;
}

async function readUIStream(res: Response): Promise<StreamCapture> {
  if (!res.body) throw new Error("Handler response had no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  const frames: UIFrame[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (data === "" || data === "[DONE]") continue;
      try {
        frames.push(JSON.parse(data) as UIFrame);
      } catch {
        // Non-JSON SSE payload, e.g. plain text heartbeats. Ignore.
      }
    }
  }
  return {
    frames,
    raw,
    byType: (type) => frames.filter((f) => f.type === type),
  };
}

/**
 * Build an OpenAI client wired at the running vLLM server, with a custom
 * fetch that injects `chat_template_kwargs.enable_thinking=false` into every
 * /responses POST. Mirrors `examples/todo/server/index.ts` exactly.
 */
function buildVllmModel(): ReturnType<ReturnType<typeof createOpenAI>["responses"]> {
  if (!VLLM_BASE_URL) throw new Error("VLLM_BASE_URL is required for buildVllmModel()");
  const client = createOpenAI({
    baseURL: VLLM_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY ?? "vllm-ignores-this",
    fetch: async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isResponses = url.endsWith("/responses") || url.includes("/responses?");
      if (!isResponses || !init?.body) return fetch(input, init);
      try {
        const body = JSON.parse(init.body as string);
        if (!("chat_template_kwargs" in body)) {
          body.chat_template_kwargs = { enable_thinking: false };
        } else if (
          body.chat_template_kwargs &&
          typeof body.chat_template_kwargs === "object" &&
          !("enable_thinking" in body.chat_template_kwargs)
        ) {
          body.chat_template_kwargs.enable_thinking = false;
        }
        return fetch(input, { ...init, body: JSON.stringify(body) });
      } catch {
        return fetch(input, init);
      }
    },
  });
  return client.responses(VLLM_MODEL);
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/pilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const describeLive = describe.skipIf(!VLLM_BASE_URL);

describeLive("live vLLM @ /v1/responses (gated by VLLM_BASE_URL)", () => {
  it(
    "raw vLLM /responses streams reasoning by default — proves the injection is load-bearing",
    async () => {
      // Negative control. Without `chat_template_kwargs.enable_thinking=false`
      // the model emits `response.reasoning_part.added` before any text. If
      // this assertion fails (no reasoning frame), either vLLM changed defaults
      // or the model isn't a thinking model — either way the rest of this
      // file's "reasoning is off" assertions become uninformative.
      const res = await fetch(`${VLLM_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer vllm-ignores-this",
        },
        body: JSON.stringify({
          model: VLLM_MODEL,
          stream: true,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: "Reply with exactly: ok" }],
            },
          ],
        }),
      });
      expect(res.ok).toBe(true);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let captured = "";
      let sawReasoning = false;
      const start = Date.now();
      while (Date.now() - start < 30_000) {
        const { done, value } = await reader.read();
        if (done) break;
        captured += decoder.decode(value, { stream: true });
        if (captured.includes("response.reasoning_part.added")) {
          sawReasoning = true;
          break;
        }
        if (captured.includes("response.completed")) break;
      }
      reader.cancel().catch(() => undefined);
      expect(sawReasoning).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "text-only turn streams text-delta frames, no reasoning frames, finish=stop, /responses path",
    async () => {
      const handler = createPilotHandler({ model: buildVllmModel() });
      const res = await handler(
        makeRequest({
          id: "live-text",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "Reply with exactly the word: ok" }],
            },
          ],
          trigger: "submit-message",
          messageId: "m1",
        }),
      );
      expect(res.status).toBe(200);
      const stream = await readUIStream(res);

      // Reasoning is off: no reasoning-* frames in the UI stream.
      const reasoningFrames = stream.frames.filter((f) =>
        typeof f.type === "string" && f.type.startsWith("reasoning"),
      );
      expect(reasoningFrames).toEqual([]);

      // The Responses API path stamps `providerMetadata.openai.itemId` on
      // text-start. If we ever silently regress to chat-completions, this
      // assertion goes red.
      const textStarts = stream.byType("text-start");
      expect(textStarts.length).toBeGreaterThan(0);
      const meta = (textStarts[0] as { providerMetadata?: { openai?: { itemId?: string } } })
        .providerMetadata;
      expect(meta?.openai?.itemId).toBeTruthy();

      // Text actually streamed in.
      const deltas = stream.byType("text-delta");
      expect(deltas.length).toBeGreaterThan(0);
      const concatenated = deltas
        .map((f) => (f as { delta?: string }).delta ?? "")
        .join("")
        .toLowerCase();
      expect(concatenated).toContain("ok");

      // Stream terminated cleanly with reason=stop (no tool calls).
      const finish = stream.byType("finish")[0] as { finishReason?: string } | undefined;
      expect(finish?.finishReason).toBe("stop");
    },
    TEST_TIMEOUT,
  );

  it(
    "tool-calling turn fires tool-input-available with parsed input, finish=tool-calls",
    async () => {
      // The bug the old chat-completions shim was working around: vLLM's
      // Responses API used to stream tool-input deltas without ever emitting
      // the marker `useChat` waits on, leaving the call stuck in 'preparing'.
      // This test asserts the marker IS emitted on the current vLLM build.
      const handler = createPilotHandler({ model: buildVllmModel() });
      const res = await handler(
        makeRequest({
          id: "live-tool",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Call the add_todo tool with text 'buy milk'. Then stop.",
                },
              ],
            },
          ],
          trigger: "submit-message",
          messageId: "m1",
          tools: {
            add_todo: {
              description: "Append a todo to the list.",
              parameters: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            },
          },
        }),
      );
      expect(res.status).toBe(200);
      const stream = await readUIStream(res);

      // The lifecycle marker. Without this, useChat hangs forever — that's
      // the original bug. If it's missing, do NOT switch back to /responses.
      const toolReady = stream.byType("tool-input-available");
      expect(toolReady.length).toBeGreaterThan(0);

      const ready = toolReady[0] as {
        toolName?: string;
        input?: { text?: string };
        providerMetadata?: { openai?: { itemId?: string } };
      };
      expect(ready.toolName).toBe("add_todo");
      // The model can phrase the input however it wants, but the parsed
      // payload must satisfy the JSON schema we declared.
      expect(typeof ready.input?.text).toBe("string");
      expect(ready.input?.text).toMatch(/milk/i);
      // Responses API marker survived through to the finished tool input.
      expect(ready.providerMetadata?.openai?.itemId).toBeTruthy();

      // Tool-input streamed in deltas (real streaming, not buffered).
      expect(stream.byType("tool-input-start").length).toBeGreaterThan(0);
      expect(stream.byType("tool-input-delta").length).toBeGreaterThan(0);

      // No reasoning leakage even on tool-calling turns.
      const reasoningFrames = stream.frames.filter((f) =>
        typeof f.type === "string" && f.type.startsWith("reasoning"),
      );
      expect(reasoningFrames).toEqual([]);

      // Step terminates with reason=tool-calls, ready for the client to run
      // the tool and submit the result back.
      const finish = stream.byType("finish")[0] as { finishReason?: string } | undefined;
      expect(finish?.finishReason).toBe("tool-calls");
    },
    TEST_TIMEOUT,
  );

  it(
    "two-turn round trip: client feeds tool result back, model produces final text + finish=stop",
    async () => {
      // Turn 1 produces the tool call. Turn 2 simulates what useChat does:
      // re-POST with the assistant message (containing the completed tool
      // call + result) appended. The model should then emit closing text and
      // finish with reason=stop. This is the lifecycle the chat-shim was
      // bypassing; if /responses can't complete it, the new default breaks
      // tool loops in the wild.
      const handler = createPilotHandler({ model: buildVllmModel() });

      const turn1 = await handler(
        makeRequest({
          id: "live-roundtrip",
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Call add_todo with text 'buy milk', then briefly confirm.",
                },
              ],
            },
          ],
          trigger: "submit-message",
          messageId: "u1",
          tools: {
            add_todo: {
              description: "Append a todo to the list.",
              parameters: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            },
          },
        }),
      );
      const stream1 = await readUIStream(turn1);
      const toolReady = stream1.byType("tool-input-available")[0] as
        | {
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
            providerMetadata?: { openai?: { itemId?: string } };
          }
        | undefined;
      expect(toolReady).toBeDefined();
      const toolCallId = toolReady!.toolCallId!;

      // Build turn 2's body: the original user message + the assistant
      // message containing the completed tool call (with output filled in,
      // mirroring what useChat sends after running the handler client-side).
      const assistantParts: unknown[] = [
        {
          type: "tool-add_todo",
          state: "output-available",
          toolCallId,
          input: toolReady!.input,
          output: { ok: true },
          ...(toolReady!.providerMetadata
            ? { providerMetadata: toolReady!.providerMetadata }
            : {}),
        },
      ];

      const turn2 = await handler(
        makeRequest({
          id: "live-roundtrip",
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Call add_todo with text 'buy milk', then briefly confirm.",
                },
              ],
            },
            { id: "a1", role: "assistant", parts: assistantParts },
          ],
          trigger: "submit-message",
          messageId: "u1",
        }),
      );
      const stream2 = await readUIStream(turn2);

      // Final turn: model should produce text and finish with stop, not
      // another tool call.
      const finish = stream2.byType("finish")[0] as { finishReason?: string } | undefined;
      expect(finish?.finishReason).toBe("stop");
      const concatenated = stream2
        .byType("text-delta")
        .map((f) => (f as { delta?: string }).delta ?? "")
        .join("");
      expect(concatenated.length).toBeGreaterThan(0);

      // Reasoning still off across the round trip.
      const reasoningFrames = stream2.frames.filter((f) =>
        typeof f.type === "string" && f.type.startsWith("reasoning"),
      );
      expect(reasoningFrames).toEqual([]);
    },
    TEST_TIMEOUT * 2,
  );
});
