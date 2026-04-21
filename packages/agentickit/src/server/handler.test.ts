import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `createPilotHandler`.
 *
 * We mock `ai` so no real provider calls happen and so we can assert the exact
 * arguments `streamText` is invoked with. Every test gets a fresh mock via
 * `beforeEach` → `vi.resetModules()` so leaks between tests are impossible.
 */

type StreamTextMock = ReturnType<typeof vi.fn>;

interface LoadedMocks {
  streamText: StreamTextMock;
  convertToModelMessages: ReturnType<typeof vi.fn>;
  dynamicTool: ReturnType<typeof vi.fn>;
  stepCountIs: ReturnType<typeof vi.fn>;
}

/**
 * Wires up the `ai` module mock and dynamically imports the handler after
 * the mock is registered. Returns the loaded handler factory + the spies.
 */
async function loadHandlerWithMocks(
  streamTextImpl: (args: unknown) => {
    toUIMessageStreamResponse: () => Response;
  } = () => ({
    toUIMessageStreamResponse: () =>
      new Response("data: fake\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  }),
): Promise<{
  createPilotHandler: typeof import("./handler.js").createPilotHandler;
  mocks: LoadedMocks;
}> {
  const mocks: LoadedMocks = {
    streamText: vi.fn(streamTextImpl),
    convertToModelMessages: vi.fn(async (msgs: unknown) => msgs),
    dynamicTool: vi.fn((def: unknown) => ({ __mockTool: true, def })),
    stepCountIs: vi.fn((n: number) => ({ __stopWhen: n })),
  };

  vi.doMock("ai", () => ({
    streamText: mocks.streamText,
    convertToModelMessages: mocks.convertToModelMessages,
    dynamicTool: mocks.dynamicTool,
    stepCountIs: mocks.stepCountIs,
  }));

  const mod = await import("./handler.js");
  return { createPilotHandler: mod.createPilotHandler, mocks };
}

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/pilot", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "OPTIONS" ? null : JSON.stringify(body),
  });
}

const validBody = {
  id: "chat-1",
  messages: [
    {
      id: "msg-1",
      role: "user" as const,
      parts: [{ type: "text", text: "hello" }],
    },
  ],
  trigger: "submit-message" as const,
  messageId: "msg-1",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.doUnmock("ai");
});

describe("createPilotHandler", () => {
  it("returns a function", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });
    expect(typeof handler).toBe("function");
  });

  it("throws synchronously when the model prefix is unsupported", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    expect(() => createPilotHandler({ model: "cohere/command-r-plus" })).toThrowError(
      /unsupported model prefix/i,
    );
  });

  it("accepts all three supported provider prefixes", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    expect(() => createPilotHandler({ model: "openai/gpt-4o" })).not.toThrow();
    expect(() => createPilotHandler({ model: "anthropic/claude-sonnet-4-5" })).not.toThrow();
    expect(() => createPilotHandler({ model: "groq/llama-3.3-70b" })).not.toThrow();
  });

  it("returns a 200 streaming response for a valid POST body", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
  });

  it("forwards the system prompt to streamText", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({
      model: "openai/gpt-4o",
      system: "You are a pilot.",
    });

    await handler(makeRequest(validBody));

    const call = mocks.streamText.mock.calls[0]?.[0] as {
      system?: string;
      model?: string;
    };
    expect(call?.system).toBe("You are a pilot.");
    expect(call?.model).toBe("openai/gpt-4o");
  });

  it("wraps client-declared tools via dynamicTool and forwards them", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    await handler(
      makeRequest({
        ...validBody,
        tools: {
          create_task: {
            description: "Create a task",
            inputSchema: { type: "object", properties: {} },
          },
        },
      }),
    );

    expect(mocks.dynamicTool).toHaveBeenCalledTimes(1);
    const call = mocks.streamText.mock.calls[0]?.[0] as {
      tools?: Record<string, unknown>;
    };
    expect(call?.tools).toBeDefined();
    expect(Object.keys(call?.tools ?? {})).toEqual(["create_task"]);
  });

  it("returns 400 with invalid_request when body is not JSON", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(
      new Request("http://localhost/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json{{{",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("invalid_request");
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 with invalid_request when body fails schema validation", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest({ not: "valid" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("invalid_request");
  });

  it("returns 400 with unsupported_provider when the body overrides with a bad model", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest({ ...validBody, model: "mistral/mixtral-8x7b" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("unsupported_provider");
  });

  it("returns 405 for non-POST, non-OPTIONS methods", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(null, "GET"));

    expect(response.status).toBe(405);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("method_not_allowed");
  });

  it("responds to OPTIONS with 204 and CORS headers (preflight)", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(null, "OPTIONS"));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("sets CORS headers on the streamed response too", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(validBody));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 500 with internal_error when streamText throws and does not leak the Error.stack", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const providerError = new Error("boom from provider");
    // Attach a realistic stack so we can assert it is NOT returned to the client.
    providerError.stack =
      "Error: boom from provider\n    at internalProvider (/internal/secret/path.ts:42:10)\n    at streamText (/node_modules/ai/dist/index.mjs:1234:5)";

    const { createPilotHandler } = await loadHandlerWithMocks(() => {
      throw providerError;
    });
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(validBody));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("internal_error");
    // We return `error.message`, never `error.stack`. No file paths or frame
    // lines should appear in the response body.
    expect(body.error).toBe("boom from provider");
    expect(body.error).not.toContain("/internal/secret/path.ts");
    expect(body.error).not.toContain("node_modules/ai");
    spy.mockRestore();
  });

  it("returns a generic 500 message when streamText throws a non-Error value", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPilotHandler } = await loadHandlerWithMocks(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "raw string blow-up";
    });
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest(validBody));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("internal_error");
    expect(body.error).toBe("Unknown server error.");
    spy.mockRestore();
  });

  it("calls getProviderOptions once per request and forwards the value", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const getProviderOptions = vi.fn(() => ({
      anthropic: { cacheControl: { type: "ephemeral" } },
    }));
    const handler = createPilotHandler({
      model: "anthropic/claude-sonnet-4-5",
      getProviderOptions,
    });

    await handler(makeRequest(validBody));

    expect(getProviderOptions).toHaveBeenCalledTimes(1);
    const call = mocks.streamText.mock.calls[0]?.[0] as {
      providerOptions?: Record<string, unknown>;
    };
    expect(call?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });
});
