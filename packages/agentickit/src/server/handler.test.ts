import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `createPilotHandler`.
 *
 * We mock `ai` so no real provider calls happen and so we can assert the
 * exact arguments `streamText` is invoked with. Every test gets a fresh
 * module graph via `beforeEach → vi.resetModules()` so no state leaks
 * between tests.
 *
 * The environment is cleared at the start of every test and restored in
 * `afterEach`, so each test can configure just the env vars relevant to the
 * scenario under test.
 */

type StreamTextMock = ReturnType<typeof vi.fn>;

interface LoadedMocks {
  streamText: StreamTextMock;
  convertToModelMessages: ReturnType<typeof vi.fn>;
  dynamicTool: ReturnType<typeof vi.fn>;
  stepCountIs: ReturnType<typeof vi.fn>;
}

/**
 * Optional extra mocks a caller can register — lets individual tests stub
 * out peer-dep adapter packages (e.g. `@ai-sdk/openai`) without polluting
 * every other test's module graph.
 */
interface ProviderMocks {
  openai?: ReturnType<typeof vi.fn>;
  anthropic?: ReturnType<typeof vi.fn>;
  groq?: ReturnType<typeof vi.fn>;
  google?: ReturnType<typeof vi.fn>;
  mistral?: ReturnType<typeof vi.fn>;
  openrouter?: ReturnType<typeof vi.fn>;
  createOpenRouter?: ReturnType<typeof vi.fn>;
}

/**
 * Wires up the `ai` module mock + any requested provider-adapter mocks and
 * dynamically imports the handler after the mocks are registered. Returns
 * the loaded handler factory + every spy.
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
  providerMocks: ProviderMocks = {},
): Promise<{
  createPilotHandler: typeof import("./handler.js").createPilotHandler;
  mocks: LoadedMocks;
  providerMocks: ProviderMocks;
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

  if (providerMocks.openai) {
    vi.doMock("@ai-sdk/openai", () => ({ openai: providerMocks.openai }));
  }
  if (providerMocks.anthropic) {
    vi.doMock("@ai-sdk/anthropic", () => ({ anthropic: providerMocks.anthropic }));
  }
  if (providerMocks.groq) {
    vi.doMock("@ai-sdk/groq", () => ({ groq: providerMocks.groq }));
  }
  if (providerMocks.google) {
    vi.doMock("@ai-sdk/google", () => ({ google: providerMocks.google }));
  }
  if (providerMocks.mistral) {
    vi.doMock("@ai-sdk/mistral", () => ({ mistral: providerMocks.mistral }));
  }
  if (providerMocks.createOpenRouter) {
    vi.doMock("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: providerMocks.createOpenRouter,
    }));
  }

  const mod = await import("./handler.js");
  return { createPilotHandler: mod.createPilotHandler, mocks, providerMocks };
}

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/pilot", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "OPTIONS" ? null : JSON.stringify(body),
  });
}

/**
 * Build a minimal object that structurally satisfies `LanguageModel` (v3).
 * We never actually dispatch to it — the mocked `streamText` captures it as
 * opaque data — but the triad field shape is what the handler uses to
 * distinguish an instance from a string.
 */
function fakeLanguageModel(
  modelId: string,
  provider = "test",
): {
  specificationVersion: "v3";
  provider: string;
  modelId: string;
} {
  return { specificationVersion: "v3", provider, modelId };
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

/**
 * Remove an environment variable. Tests need to clear `process.env` keys
 * entirely — assigning `undefined` would stringify to `"undefined"` on
 * subsequent reads. Wrapping the operation isolates Biome's `noDelete` rule
 * check to a single callsite.
 */
function unsetEnv(key: string): void {
  delete process.env[key];
}

/**
 * Snapshot of env vars we mutate. Restored in `afterEach` so one test's
 * configuration never bleeds into another.
 */
const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    unsetEnv(key);
  }
  // Default: the Gateway is configured so legacy behavior tests pass
  // unchanged. Individual tests override by deleting this line's effect.
  process.env.AI_GATEWAY_API_KEY = "gw-test";
});

afterEach(() => {
  vi.doUnmock("ai");
  vi.doUnmock("@ai-sdk/openai");
  vi.doUnmock("@ai-sdk/anthropic");
  vi.doUnmock("@ai-sdk/groq");
  vi.doUnmock("@ai-sdk/google");
  vi.doUnmock("@ai-sdk/mistral");
  vi.doUnmock("@openrouter/ai-sdk-provider");
  for (const key of ENV_KEYS) {
    const prior = savedEnv[key];
    if (prior === undefined) unsetEnv(key);
    else process.env[key] = prior;
  }
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

  it("accepts every allow-listed provider prefix", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    expect(() => createPilotHandler({ model: "openai/gpt-4o" })).not.toThrow();
    expect(() => createPilotHandler({ model: "anthropic/claude-sonnet-4-5" })).not.toThrow();
    expect(() => createPilotHandler({ model: "groq/llama-3.3-70b" })).not.toThrow();
    expect(() => createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" })).not.toThrow();
    expect(() => createPilotHandler({ model: "google/gemini-2.5-flash" })).not.toThrow();
    expect(() => createPilotHandler({ model: "mistral/mistral-large-latest" })).not.toThrow();
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

  it("returns 400 with unsupported_provider when the body overrides with a bad prefix", async () => {
    const { createPilotHandler } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(makeRequest({ ...validBody, model: "bogus/some-model" }));

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

  it("appends the client-derived system prompt after the server-owned one", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({
      model: "openai/gpt-4o",
      system: "SERVER INSTRUCTIONS.",
    });

    await handler(
      makeRequest({
        ...validBody,
        system: "CLIENT-DERIVED SKILLS.",
      }),
    );

    const call = mocks.streamText.mock.calls[0]?.[0] as { system?: string };
    expect(call?.system).toBeDefined();
    // Server-owned block must come first so a tampered client can't shadow it.
    expect(call?.system?.indexOf("SERVER INSTRUCTIONS.")).toBeLessThan(
      call?.system?.indexOf("CLIENT-DERIVED SKILLS.") ?? -1,
    );
  });

  it("rejects an absurdly large client system field without calling streamText", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    const response = await handler(
      makeRequest({
        ...validBody,
        system: "x".repeat(100_000),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("serializes registered state context into the system prompt", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    await handler(
      makeRequest({
        ...validBody,
        context: { count: { description: "current count", value: 42 } },
      }),
    );

    const call = mocks.streamText.mock.calls[0]?.[0] as { system?: string };
    expect(call?.system).toBeDefined();
    expect(call?.system).toContain("Current UI state");
    expect(call?.system).toContain('"count"');
    expect(call?.system).toContain("42");
  });

  it("honours a custom maxSteps and forwards it as stopWhen", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o", maxSteps: 12 });

    await handler(makeRequest(validBody));

    expect(mocks.stepCountIs).toHaveBeenCalledWith(12);
  });

  it("defaults to 5 steps when maxSteps is omitted", async () => {
    const { createPilotHandler, mocks } = await loadHandlerWithMocks();
    const handler = createPilotHandler({ model: "openai/gpt-4o" });

    await handler(makeRequest(validBody));

    expect(mocks.stepCountIs).toHaveBeenCalledWith(5);
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

  // -------------------------------------------------------------------------
  // Provider-flexibility — new tests
  // -------------------------------------------------------------------------

  describe("provider resolution", () => {
    it("passes the raw string to streamText when only AI_GATEWAY_API_KEY is set", async () => {
      // beforeEach already sets AI_GATEWAY_API_KEY; no direct key present.
      const { createPilotHandler, mocks } = await loadHandlerWithMocks();
      const handler = createPilotHandler({ model: "openai/gpt-4o" });

      await handler(makeRequest(validBody));

      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: string };
      expect(call?.model).toBe("openai/gpt-4o");
    });

    it("uses the @ai-sdk/openai adapter when OPENAI_API_KEY is present", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");
      process.env.OPENAI_API_KEY = "sk-test";

      const openaiModel = fakeLanguageModel("gpt-4o", "openai");
      const openai = vi.fn(() => openaiModel);

      const { createPilotHandler, mocks } = await loadHandlerWithMocks(undefined, {
        openai,
      });
      const handler = createPilotHandler({ model: "openai/gpt-4o" });

      await handler(makeRequest(validBody));

      expect(openai).toHaveBeenCalledWith("gpt-4o");
      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: unknown };
      expect(call?.model).toBe(openaiModel);
    });

    it("routes openrouter/* through createOpenRouter with the API key", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");
      process.env.OPENROUTER_API_KEY = "sk-or-test";

      const openrouterModel = fakeLanguageModel("qwen/qwen3-coder:free", "openrouter");
      // createOpenRouter returns a callable that returns a LanguageModel.
      const openrouterFactory = vi.fn(() => openrouterModel);
      const createOpenRouter = vi.fn(() => openrouterFactory);

      const { createPilotHandler, mocks } = await loadHandlerWithMocks(undefined, {
        createOpenRouter,
      });
      const handler = createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" });

      await handler(makeRequest(validBody));

      expect(createOpenRouter).toHaveBeenCalledWith({ apiKey: "sk-or-test" });
      // The remainder after `openrouter/` is the full OpenRouter model id,
      // including its inner slash.
      expect(openrouterFactory).toHaveBeenCalledWith("qwen/qwen3-coder:free");
      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: unknown };
      expect(call?.model).toBe(openrouterModel);
    });

    it("accepts a LanguageModel instance directly without prefix validation", async () => {
      // No env vars configured — only the gateway default (cleared here).
      unsetEnv("AI_GATEWAY_API_KEY");

      const { createPilotHandler, mocks } = await loadHandlerWithMocks();
      const instance = fakeLanguageModel("llama3.3", "ollama");
      const handler = createPilotHandler({ model: instance });

      await handler(makeRequest(validBody));

      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: unknown };
      expect(call?.model).toBe(instance);
    });

    it("calls a thunk once at handler creation and reuses the resolved model", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");

      const { createPilotHandler, mocks } = await loadHandlerWithMocks();
      const instance = fakeLanguageModel("custom-model", "custom");
      const thunk = vi.fn(() => instance);
      const handler = createPilotHandler({ model: thunk });

      await handler(makeRequest(validBody));
      await handler(makeRequest(validBody));

      expect(thunk).toHaveBeenCalledTimes(1);
      const firstModel = (mocks.streamText.mock.calls[0]?.[0] as { model?: unknown }).model;
      const secondModel = (mocks.streamText.mock.calls[1]?.[0] as { model?: unknown }).model;
      expect(firstModel).toBe(instance);
      expect(secondModel).toBe(instance);
    });

    it("awaits an async thunk and uses its resolved value", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");

      const { createPilotHandler, mocks } = await loadHandlerWithMocks();
      const instance = fakeLanguageModel("async-model", "custom");
      const thunk = vi.fn(async () => instance);
      const handler = createPilotHandler({ model: thunk });

      await handler(makeRequest(validBody));

      expect(thunk).toHaveBeenCalledTimes(1);
      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: unknown };
      expect(call?.model).toBe(instance);
    });

    it("returns 400 on the first request when no adapter, no gateway, and no instance can serve the model", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");
      // No provider keys either. The factory must *not* throw — build-time
      // tooling (e.g. Next.js `collect page data`) loads the route before
      // env is available; the failure is deferred to request time.

      const { createPilotHandler } = await loadHandlerWithMocks();
      const handler = createPilotHandler({ model: "openai/gpt-4o" });
      const response = await handler(makeRequest(validBody));
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; code: string };
      expect(body.code).toBe("unsupported_provider");
      expect(body.error).toMatch(/cannot be served/i);
    });

    it("throws a `run: npm install` error when the adapter package is missing", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");
      process.env.MISTRAL_API_KEY = "sk-test";

      // Simulate `@ai-sdk/mistral` not being installed by stubbing
      // `Module.prototype.require.resolve` — the call the handler uses to
      // probe peer-dep presence. `createRequire()` returns a require
      // function whose `.resolve` delegates to `Module._resolveFilename`;
      // we wrap that to throw MODULE_NOT_FOUND for the one package we want
      // to appear missing, then restore after the test.
      type ModuleCtor = {
        _resolveFilename: (id: string, parent: unknown, isMain: boolean, opts?: unknown) => string;
      };
      const nodeModule = (await import("node:module")) as unknown as {
        default?: ModuleCtor;
        _resolveFilename?: ModuleCtor["_resolveFilename"];
      };
      const ModuleCtor = (nodeModule.default ??
        (nodeModule as unknown as ModuleCtor)) as ModuleCtor;
      const original = ModuleCtor._resolveFilename;
      ModuleCtor._resolveFilename = ((id, parent, isMain, opts) => {
        if (id === "@ai-sdk/mistral") {
          const err = new Error(`Cannot find module '${id}'`) as NodeJS.ErrnoException;
          err.code = "MODULE_NOT_FOUND";
          throw err;
        }
        return original(id, parent, isMain, opts);
      }) as ModuleCtor["_resolveFilename"];

      try {
        const { createPilotHandler } = await loadHandlerWithMocks();
        expect(() => createPilotHandler({ model: "mistral/mistral-large-latest" })).toThrowError(
          /npm install @ai-sdk\/mistral/,
        );
      } finally {
        ModuleCtor._resolveFilename = original;
      }
    });

    it("honours per-request body.model overrides through the same resolver", async () => {
      unsetEnv("AI_GATEWAY_API_KEY");
      process.env.OPENAI_API_KEY = "sk-test";

      const model1 = fakeLanguageModel("gpt-4o", "openai");
      const model2 = fakeLanguageModel("gpt-4o-mini", "openai");
      const openai = vi.fn((id: string) => (id === "gpt-4o" ? model1 : model2));

      const { createPilotHandler, mocks } = await loadHandlerWithMocks(undefined, {
        openai,
      });
      const handler = createPilotHandler({ model: "openai/gpt-4o" });

      await handler(makeRequest({ ...validBody, model: "openai/gpt-4o-mini" }));

      const call = mocks.streamText.mock.calls[0]?.[0] as { model?: unknown };
      expect(call?.model).toBe(model2);
    });
  });
});
