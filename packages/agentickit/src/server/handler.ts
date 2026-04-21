import {
  type LanguageModel,
  type ToolSet,
  type UIMessage,
  convertToModelMessages,
  dynamicTool,
  stepCountIs,
  streamText,
} from "ai";
import { z } from "zod";

/**
 * Extract the exact `providerOptions` parameter type that `streamText` expects
 * without importing it directly from `@ai-sdk/provider-utils` (which is a
 * transitive dep — not in our direct `package.json`). This keeps us honest
 * about our dependency graph while still giving callers a precise type.
 */
type StreamTextProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;

/**
 * Supported provider prefixes for v0.1.
 *
 * We intentionally allow-list these rather than forwarding arbitrary strings
 * to the Vercel AI Gateway so consumers get a clear error at handler-creation
 * time when they mistype a provider (`opnai/gpt-4o`) rather than a cryptic
 * 401 from the gateway on the first chat message.
 */
const SUPPORTED_PROVIDER_PREFIXES = ["openai/", "anthropic/", "groq/"] as const;

type SupportedProviderPrefix = (typeof SUPPORTED_PROVIDER_PREFIXES)[number];

/**
 * Options accepted by {@link createPilotHandler}.
 *
 * Kept intentionally small — this package is a thin shim over AI SDK 6, so
 * the handler delegates to `streamText` and only wraps it with a validated
 * request contract, CORS, and a stable error envelope.
 */
export interface CreatePilotHandlerOptions {
  /**
   * System prompt prepended to every turn. Typically composed at init time
   * from .pilot/RESOLVER.md + conventions.
   */
  system?: string;
  /**
   * Default model ID in the Vercel AI SDK v6 gateway format
   * (`"openai/gpt-4o"`, `"anthropic/claude-sonnet-4-5"`, `"groq/llama-3.3-70b"`).
   *
   * Must start with one of the supported provider prefixes.
   *
   * When requests are routed through `streamText`, the AI SDK resolves the
   * string via the Vercel AI Gateway provider (authenticated with the
   * `AI_GATEWAY_API_KEY` environment variable or an OIDC token on Vercel).
   */
  model: string;
  /**
   * Called for every incoming request. Returns provider-specific options that
   * are forwarded verbatim to `streamText({ providerOptions })`. Useful for
   * per-request tuning (e.g., caching hints, thinking budgets). API keys must
   * never be returned here — they live in environment variables.
   */
  getProviderOptions?: () => Record<string, unknown>;
}

/**
 * Stable JSON shape returned for every non-streaming error response.
 *
 * Kept narrow so downstream consumers can pattern-match on `code` in their
 * UI without parsing free-form messages.
 */
export interface PilotErrorBody {
  error: string;
  code: "invalid_request" | "unsupported_provider" | "internal_error" | "method_not_allowed";
}

/**
 * Zod schema for a single client-declared tool definition.
 *
 * Tools sent by `useChat` from the browser are *forward declarations*: they
 * carry a name, optional description, and an input schema expressed as a
 * JSON Schema object. The model produces tool-call inputs, the AI SDK streams
 * them back over the UI-message stream, and the browser executes the tool
 * locally. We never execute these on the server — doing so would defeat the
 * "client-side action" design.
 */
const clientToolSchema = z.object({
  description: z.string().optional(),
  inputSchema: z.unknown(),
});

/**
 * Zod schema for a single UI message. Kept narrow on purpose: we only check
 * structural shape here — the AI SDK performs detailed part validation when
 * it runs `convertToModelMessages`.
 */
const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.unknown()),
  metadata: z.unknown().optional(),
});

/**
 * Zod schema for the POST body produced by AI SDK 6's `DefaultChatTransport`
 * (the default transport used by `useChat` / `@ai-sdk/react`).
 *
 * Reference: `DefaultChatTransport.sendMessages` in `ai@6` sends
 * `{ id, messages, trigger, messageId, ...body }` with `Content-Type: application/json`.
 * We accept the known fields and allow additional pass-through keys so
 * consumers can inject custom body via the `body` option of `useChat` without
 * us needing to update this schema.
 */
const requestBodySchema = z
  .object({
    id: z.string().optional(),
    messages: z.array(uiMessageSchema),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
    messageId: z.string().optional(),
    /**
     * Optional per-request model override. When provided, must still match a
     * supported provider prefix.
     */
    model: z.string().optional(),
    /**
     * Optional map of client-declared tools. Keys are tool names.
     */
    tools: z.record(clientToolSchema).optional(),
  })
  .passthrough();

type RequestBody = z.infer<typeof requestBodySchema>;

/**
 * Permissive CORS headers for v0.1. Consumers who need tighter policy can
 * wrap the handler in their own middleware.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

/**
 * Returns `true` when `model` starts with one of the supported provider
 * prefixes.
 */
function isSupportedModel(model: string): model is `${SupportedProviderPrefix}${string}` {
  return SUPPORTED_PROVIDER_PREFIXES.some((prefix) => model.startsWith(prefix));
}

/**
 * Builds a JSON error response with CORS headers set.
 */
function errorResponse(status: number, body: PilotErrorBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Converts the client-declared tool map from a request body into an AI SDK
 * `ToolSet` that can be passed to `streamText`.
 *
 * We wrap every entry with `dynamicTool` and omit `execute` — this tells the
 * AI SDK to stream tool-call inputs back to the client without invoking
 * anything server-side. The client registers matching handlers via
 * `usePilotAction` / `addToolResult`.
 */
function buildClientToolSet(tools: RequestBody["tools"] | undefined): ToolSet | undefined {
  if (!tools || Object.keys(tools).length === 0) {
    return undefined;
  }
  const entries = Object.entries(tools).map(([name, definition]) => {
    return [
      name,
      dynamicTool({
        description: definition.description,
        // The client ships a JSON-Schema-like object; the AI SDK accepts it as
        // a FlexibleSchema at runtime. We cast through `unknown` because the
        // schema shape is user-supplied and only meaningful to the model.
        inputSchema: definition.inputSchema as never,
        // Intentionally a no-op: client-side tools run in the browser. If the
        // model ever calls us without the client having registered a handler,
        // `addToolResult` from the client completes the loop.
        execute: async () => {
          throw new Error(
            `Tool "${name}" is declared client-side and must be executed by the browser.`,
          );
        },
      }),
    ] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * Factory for a Next.js App Router POST handler (also works in any
 * Web-Fetch-compatible runtime — Cloudflare Workers, Bun, edge runtimes).
 *
 * Target usage:
 *   // app/api/pilot/route.ts
 *   import { createPilotHandler } from "agentickit/server";
 *   export const POST = createPilotHandler({ model: "openai/gpt-4o" });
 *
 * Behavior:
 *   - Validates the request body against the AI SDK 6 `useChat` contract.
 *   - Delegates streaming to `streamText` with the resolved model, system
 *     prompt, and any client-declared tools.
 *   - Returns the AI-SDK-native UI-message stream via
 *     `result.toUIMessageStreamResponse()`, so `useChat` reassembles tool
 *     parts, reasoning, and text deltas without any custom decoder.
 *   - On validation failure returns 400 with `{error, code: "invalid_request"}`.
 *   - On unexpected failure returns 500 with `{error, code: "internal_error"}`
 *     and never leaks stack traces.
 *
 * Model strings must start with one of: `openai/`, `anthropic/`, `groq/`.
 * Under the hood they're resolved by the Vercel AI Gateway, so the consumer
 * only needs to set `AI_GATEWAY_API_KEY` (or deploy on Vercel with OIDC).
 *
 * Throws synchronously at handler-creation time if `options.model` has an
 * unsupported provider prefix — surfacing misconfiguration during startup
 * rather than on the first request.
 */
export function createPilotHandler(
  options: CreatePilotHandlerOptions,
): (request: Request) => Promise<Response> {
  if (!isSupportedModel(options.model)) {
    throw new Error(
      `agentickit: unsupported model prefix in "${options.model}". ` +
        `Expected one of: ${SUPPORTED_PROVIDER_PREFIXES.join(", ")}.`,
    );
  }

  return async function handler(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return errorResponse(405, {
        error: `Method ${request.method} not allowed. Use POST.`,
        code: "method_not_allowed",
      });
    }

    // --- Parse + validate body ------------------------------------------------
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, {
        error: "Request body is not valid JSON.",
        code: "invalid_request",
      });
    }

    const parsed = requestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(400, {
        error: `Invalid request body: ${parsed.error.message}`,
        code: "invalid_request",
      });
    }
    const body = parsed.data;

    // Per-request model override is allowed, but must still pass the
    // prefix check — otherwise the caller could bypass our allow-list by
    // injecting arbitrary strings into the request body.
    const model = body.model ?? options.model;
    if (!isSupportedModel(model)) {
      return errorResponse(400, {
        error: `Unsupported model "${model}". Expected prefix in: ${SUPPORTED_PROVIDER_PREFIXES.join(", ")}.`,
        code: "unsupported_provider",
      });
    }

    // --- Dispatch to streamText ----------------------------------------------
    try {
      const modelMessages = await convertToModelMessages(body.messages as UIMessage[]);
      const clientTools = buildClientToolSet(body.tools);
      // The public option type is intentionally loose (`Record<string, unknown>`)
      // to avoid leaking AI SDK internal types through agentickit's API. We
      // cast once here to satisfy `streamText`'s stricter shape.
      const providerOptions = options.getProviderOptions?.() as
        | StreamTextProviderOptions
        | undefined;

      const result = streamText({
        model: model as LanguageModel,
        system: options.system,
        messages: modelMessages,
        ...(clientTools ? { tools: clientTools } : {}),
        ...(providerOptions ? { providerOptions } : {}),
        // Permit the model to iterate up to 5 times so tool-calling loops
        // (call → result → follow-up) can complete in a single request.
        stopWhen: stepCountIs(5),
      });

      const response = result.toUIMessageStreamResponse();
      // Merge CORS headers into the streamed response without touching the
      // body. We copy into a fresh Headers so we don't mutate a shared object.
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      // Never leak stack traces. Log server-side for debugging; return a
      // stable envelope to the client.
      console.error("agentickit handler error:", error);
      const message = error instanceof Error ? error.message : "Unknown server error.";
      return errorResponse(500, {
        error: message,
        code: "internal_error",
      });
    }
  };
}
