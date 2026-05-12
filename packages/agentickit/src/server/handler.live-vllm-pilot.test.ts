/**
 * Live integration test for the .pilot/-driven system prompt path.
 *
 * Gated on `VLLM_BASE_URL`. Builds a temp `.pilot/` folder with a
 * RESOLVER + a couple of SKILL.md files, points `createPilotHandler` at
 * it, and verifies:
 *   1. `loadPilotProtocol` returns a string composing both skill bodies.
 *   2. The composed prompt actually steers the real model — we plant a
 *      unique secret phrase inside one SKILL.md's body and ask the model
 *      to recite it. If the prompt is wired, the model returns the
 *      secret. If the prompt is NOT wired (regression), the model has no
 *      way to know it.
 *   3. A tool-call turn still streams the right frames when the prompt
 *      came from `.pilot/` instead of an inline `system: "..."` string.
 *
 * The mocked unit tests in `pilot-protocol-loader.test.ts` cover the
 * RESOLVER-driven loader logic; this file proves the wire-level
 * contract holds against a real model.
 *
 * Run:  VLLM_BASE_URL=http://127.0.0.1:8000/v1 pnpm test
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { createPilotHandler } from "./handler.js";
import { loadPilotProtocol } from "./pilot-protocol-loader.js";

const VLLM_BASE_URL = process.env.VLLM_BASE_URL;
const VLLM_MODEL = process.env.VLLM_MODEL ?? "Qwen3.6-27B-AWQ4";
const TEST_TIMEOUT = 120_000;

interface UIFrame {
  type: string;
  [key: string]: unknown;
}

async function readUIStream(res: Response): Promise<{ frames: UIFrame[]; raw: string }> {
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
        // Non-JSON payload, ignore.
      }
    }
  }
  return { frames, raw };
}

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

// A unique, model-uncomputable token. The whole point of planting it
// inside a SKILL.md body is that the model has NO way to produce it
// unless the .pilot/ loader actually wired the body into the prompt.
const SECRET_TOKEN = "BANANA-7Q4Z-ECHO-2026";

describeLive("live vLLM @ /v1/responses + .pilot/ loader (gated by VLLM_BASE_URL)", () => {
  let tmpRoot: string;
  let pilotDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agentickit-pilot-live-"));
    pilotDir = join(tmpRoot, ".pilot");
    mkdirSync(join(pilotDir, "skills", "secret-recall"), { recursive: true });
    mkdirSync(join(pilotDir, "skills", "polite-reply"), { recursive: true });

    writeFileSync(
      join(pilotDir, "RESOLVER.md"),
      [
        "# Test Resolver",
        "",
        "You are a test agent. Read every SKILL.md before responding.",
        "",
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| recall the secret | `skills/secret-recall/SKILL.md` |",
        "| greet politely | `skills/polite-reply/SKILL.md` |",
      ].join("\n"),
    );

    writeFileSync(
      join(pilotDir, "skills", "secret-recall", "SKILL.md"),
      [
        "---",
        "name: secret-recall",
        "description: Recall the unique secret token from this skill body when asked.",
        "triggers:",
        '  - "what is the secret token"',
        '  - "recall the secret"',
        "tools: []",
        "mutating: false",
        "---",
        "",
        "# When to use",
        "",
        `The secret token is: ${SECRET_TOKEN}`,
        "",
        "If the user asks for the secret token, reply with EXACTLY this string,",
        "in uppercase, on its own line, with no surrounding prose.",
      ].join("\n"),
    );

    writeFileSync(
      join(pilotDir, "skills", "polite-reply", "SKILL.md"),
      [
        "---",
        "name: polite-reply",
        "description: Greet the user politely.",
        "triggers:",
        '  - "hello"',
        "tools: []",
        "mutating: false",
        "---",
        "",
        "Always greet politely if the user opens with hello.",
      ].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("loadPilotProtocol composes both SKILL.md bodies into the prompt", () => {
    const warnings: string[] = [];
    const result = loadPilotProtocol({
      cwd: tmpRoot,
      onWarn: (m) => warnings.push(m),
    });
    expect(result).not.toBeNull();
    const text = result as string;
    expect(text).toContain("## Skill: secret-recall");
    expect(text).toContain("## Skill: polite-reply");
    expect(text).toContain(SECRET_TOKEN);
    expect(warnings).toEqual([]);
  });

  it(
    "model returns the SECRET planted inside SKILL.md (proves .pilot/ is wired into the system prompt)",
    async () => {
      const handler = createPilotHandler({
        model: buildVllmModel(),
        pilotDir, // absolute path; loader skips the cwd resolve
      });
      const res = await handler(
        makeRequest({
          id: "live-pilot-secret",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "What is the secret token?" }],
            },
          ],
          trigger: "submit-message",
          messageId: "m1",
        }),
      );
      expect(res.status).toBe(200);
      const stream = await readUIStream(res);

      // Concatenate every text-delta payload the model streamed. The
      // assertion is intentionally lenient: the model must have surfaced
      // the secret token SOMEWHERE in its reply. The model has no way to
      // know SECRET_TOKEN unless the .pilot/ loader injected it.
      const fullText = stream.frames
        .filter((f) => f.type === "text-delta")
        .map((f) => String((f as { delta?: unknown }).delta ?? ""))
        .join("");

      expect(
        fullText,
        `Model reply did NOT contain the planted SECRET_TOKEN. The .pilot/ loader path is not wired to createPilotHandler. Reply was: ${fullText}`,
      ).toContain(SECRET_TOKEN);
    },
    TEST_TIMEOUT,
  );

  it(
    "tool-call path still works when the prompt came from .pilot/ (regression sentinel)",
    async () => {
      const handler = createPilotHandler({
        model: buildVllmModel(),
        pilotDir,
      });
      // Inject a single client-side tool through the request body so the
      // handler advertises it to the model. The model is told (via the
      // user message) to call it; we then assert tool-call frames fire.
      const res = await handler(
        makeRequest({
          id: "live-pilot-tool",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Call the test_tool with input {\"value\": 42}. Do not reply with prose; just call the tool.",
                },
              ],
            },
          ],
          trigger: "submit-message",
          messageId: "m1",
          // Body schema: `tools` is a record keyed by tool name; each
          // entry is `{ description?, inputSchema }` (JSON Schema).
          tools: {
            test_tool: {
              description: "A test tool. Pass through the integer input.",
              inputSchema: {
                type: "object",
                properties: { value: { type: "integer" } },
                required: ["value"],
                additionalProperties: false,
              },
            },
          },
        }),
      );
      expect(res.status).toBe(200);
      const stream = await readUIStream(res);

      // The model called the tool. tool-input-available is the AI SDK 6
      // frame that signals "model picked a tool, here are the parsed
      // inputs, dispatch them". This is the load-bearing wire frame for
      // the client-side dispatch path.
      const toolFrames = stream.frames.filter((f) =>
        typeof f.type === "string" && f.type.startsWith("tool-"),
      );
      expect(
        toolFrames.length,
        `Expected at least one tool-* frame; got: ${stream.frames.map((f) => f.type).join(", ")}`,
      ).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );
});
