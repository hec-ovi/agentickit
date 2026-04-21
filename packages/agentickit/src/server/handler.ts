import { createRequire } from "node:module";
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
 * Supported provider prefixes for string `model` values.
 *
 * We allow-list these rather than forwarding arbitrary strings to an external
 * gateway so consumers get a clear error at handler-creation time when they
 * mistype a provider (`opnai/gpt-4o`) rather than a cryptic 401 from the
 * gateway on the first chat message.
 */
const SUPPORTED_PROVIDER_PREFIXES = [
  "openai",
  "anthropic",
  "groq",
  "openrouter",
  "google",
  "mistral",
] as const;

type SupportedProviderPrefix = (typeof SUPPORTED_PROVIDER_PREFIXES)[number];

/**
 * Static descriptor for how each prefix resolves to a provider adapter.
 *
 * `envKey` is the conventional environment variable the adapter reads to pick
 * up credentials (and, in our case, the signal that the consumer wants to use
 * direct keys rather than the Vercel AI Gateway). `pkg` is the adapter package
 * name. `export` identifies whether the package's default function export is
 * the provider factory (`openai`, `anthropic`, `groq`, `google`, `mistral`)
 * or we must call a factory constructor (`createOpenRouter`).
 */
interface ProviderAdapterDescriptor {
  readonly envKey: string;
  readonly pkg: string;
  readonly kind: "default" | "openrouter";
}

const PROVIDER_ADAPTERS: Readonly<Record<SupportedProviderPrefix, ProviderAdapterDescriptor>> = {
  openai: { envKey: "OPENAI_API_KEY", pkg: "@ai-sdk/openai", kind: "default" },
  anthropic: { envKey: "ANTHROPIC_API_KEY", pkg: "@ai-sdk/anthropic", kind: "default" },
  groq: { envKey: "GROQ_API_KEY", pkg: "@ai-sdk/groq", kind: "default" },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    pkg: "@openrouter/ai-sdk-provider",
    kind: "openrouter",
  },
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    pkg: "@ai-sdk/google",
    kind: "default",
  },
  mistral: { envKey: "MISTRAL_API_KEY", pkg: "@ai-sdk/mistral", kind: "default" },
};

/**
 * Shape of a first-party AI-SDK provider-adapter module once imported. Each
 * exposes a lowercase factory matching the provider name (`openai`,
 * `anthropic`, `groq`, `google`, `mistral`) that returns a `LanguageModel`
 * when called with a model ID and automatically reads its API key from the
 * conventional environment variable.
 */
interface FirstPartyAdapterModule {
  readonly openai?: (id: string) => LanguageModel;
  readonly anthropic?: (id: string) => LanguageModel;
  readonly groq?: (id: string) => LanguageModel;
  readonly google?: (id: string) => LanguageModel;
  readonly mistral?: (id: string) => LanguageModel;
}

/**
 * Shape of the community OpenRouter provider module. The adapter is
 * namespaced — we must call `createOpenRouter` with an explicit `{ apiKey }`
 * argument before it can produce models.
 */
interface OpenRouterAdapterModule {
  readonly createOpenRouter?: (config: { apiKey: string | undefined }) => (
    id: string,
  ) => LanguageModel;
}

/**
 * A spec describing the model to use for a handler.
 *
 * Accepts three shapes so consumers can pick their favorite level of control:
 *
 * 1. A `"provider/model"` string resolved via the internal provider registry
 *    (see {@link PROVIDER_ADAPTERS}) or, as a fallback, by the Vercel AI
 *    Gateway when `AI_GATEWAY_API_KEY` is set. The literal string `"auto"`
 *    is a synonym for omitting `model` entirely and triggers env-based
 *    auto-detection.
 * 2. A pre-built `LanguageModel` instance — used verbatim. This is the
 *    "bring your own provider" escape hatch for Ollama, Azure, Bedrock,
 *    or any other custom adapter.
 * 3. A thunk returning a `LanguageModel` (or a promise of one). Called once
 *    at handler creation so consumers can do async setup lazily.
 */
export type ModelSpec = string | LanguageModel | (() => LanguageModel | Promise<LanguageModel>);

/**
 * Auto-detection priority table.
 *
 * Order matters — the first env var present wins. The ordering was chosen to
 * prefer *free-tier-friendly* providers (Groq, OpenRouter) over paid direct
 * providers, with the Vercel AI Gateway last so consumers who have multiple
 * keys configured get the most forgiving provider by default. Each default
 * model string was verified (April 2026) to support tool-calling so the
 * auto-detect path never produces a broken handler.
 *
 * - **Groq `llama-3.3-70b-versatile`**: Groq confirms every hosted model
 *   supports tool-use; Llama 3.3 70B is explicitly in the parallel-tool-call
 *   table. Free tier, fastest inference.
 * - **OpenRouter `qwen/qwen3-coder:free`**: one of the free models confirmed
 *   to support tool calling (see `research-providers.md`). No credit card.
 * - **Anthropic `claude-haiku-4-5`**: current Haiku alias per Claude docs
 *   (April 2026). Cheapest Claude with full tool support.
 * - **OpenAI `gpt-4o-mini`**: cheapest OpenAI model with full function
 *   calling support; widely used as a default.
 * - **Google `gemini-2.5-flash`**: current price-performance Flash model
 *   (April 2026) with function calling; supersedes 2.0-flash.
 * - **Mistral `mistral-small-latest`**: tracks the latest Small release,
 *   confirmed function-calling-capable by Mistral docs.
 * - **Vercel AI Gateway → `openai/gpt-4o-mini`**: cheap default that works
 *   through the Gateway as long as the account has access to OpenAI models.
 */
interface AutoDetectEntry {
  /** Env var whose presence selects this entry. */
  readonly envKey: string;
  /** Full `<provider>/<model>` string to pass to the resolver on a hit. */
  readonly model: string;
}

const AUTO_DETECT_ORDER: ReadonlyArray<AutoDetectEntry> = [
  { envKey: "GROQ_API_KEY", model: "groq/llama-3.3-70b-versatile" },
  { envKey: "OPENROUTER_API_KEY", model: "openrouter/qwen/qwen3-coder:free" },
  { envKey: "ANTHROPIC_API_KEY", model: "anthropic/claude-haiku-4-5" },
  { envKey: "OPENAI_API_KEY", model: "openai/gpt-4o-mini" },
  { envKey: "GOOGLE_GENERATIVE_AI_API_KEY", model: "google/gemini-2.5-flash" },
  { envKey: "MISTRAL_API_KEY", model: "mistral/mistral-small-latest" },
  // Gateway last: any consumer with only `AI_GATEWAY_API_KEY` set still gets
  // a sensible out-of-the-box model routed through the Vercel AI Gateway.
  { envKey: "AI_GATEWAY_API_KEY", model: "openai/gpt-4o-mini" },
];

/**
 * Walks the auto-detection table and returns the first `<provider>/<model>`
 * string whose env var is present, or `null` when nothing is configured.
 *
 * Exposed for testing and for consumers who want to inspect what the handler
 * would pick without creating one.
 */
export function autoDetectModel(): string | null {
  for (const entry of AUTO_DETECT_ORDER) {
    if (process.env[entry.envKey]) {
      return entry.model;
    }
  }
  return null;
}

/**
 * Internal variant of {@link autoDetectModel} that also returns the env var
 * that triggered the match — useful for the dev-mode startup log.
 */
function autoDetectModelWithEnv(): { envKey: string; model: string } | null {
  for (const entry of AUTO_DETECT_ORDER) {
    if (process.env[entry.envKey]) {
      return { envKey: entry.envKey, model: entry.model };
    }
  }
  return null;
}

/**
 * True in development builds. Uses the same heuristic as the client-side
 * `isDev()` helper in `env.ts`: anything that isn't explicitly
 * `"production"` is treated as development.
 */
function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Human-friendly error thrown when auto-detection can't pick a provider.
 * Pulled out so tests (and the resolver's deferred-failure path) share one
 * canonical message.
 */
function noProviderConfiguredError(): Error {
  return new Error(
    [
      "agentickit: no model configured and no provider API key found in the environment.",
      "Set one of: OPENROUTER_API_KEY (free tier, no credit card — https://openrouter.ai/keys),",
      "GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY,",
      "MISTRAL_API_KEY, or AI_GATEWAY_API_KEY.",
      'Alternatively pass model: "<provider>/<model-id>" or a LanguageModel instance explicitly.',
    ].join("\n"),
  );
}

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
   * Default model for this handler. See {@link ModelSpec} for the three
   * accepted shapes.
   *
   * When **omitted** — or set to the literal string `"auto"` — the handler
   * auto-detects a provider by walking a priority list of well-known env
   * vars (in order: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
   * `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`,
   * `AI_GATEWAY_API_KEY`). Each provider pairs with a tool-calling-capable
   * default model (for example `groq/llama-3.3-70b-versatile` or
   * `openrouter/qwen/qwen3-coder:free`) so "set any supported key, it just
   * works". If no key is present the factory throws a clear error listing
   * every supported env var.
   *
   * Passing an explicit value bypasses auto-detection:
   *
   * - **String** (`"openai/gpt-4o"`, `"openrouter/qwen/qwen3-coder:free"`): resolved
   *   via the internal provider registry. If a direct provider key such as
   *   `OPENAI_API_KEY` is present along with the matching `@ai-sdk/*` peer
   *   package, the direct adapter is used. Otherwise, if `AI_GATEWAY_API_KEY`
   *   is set, the raw string is handed to `streamText` and routed through the
   *   Vercel AI Gateway. If neither is available, the factory throws a clear
   *   error listing the environment variables that would unblock the call.
   * - **`LanguageModel` instance**: used as-is. No prefix validation is run.
   * - **Thunk**: called exactly once at handler creation; the resolved value
   *   must be a `LanguageModel` instance.
   */
  model?: ModelSpec;
  /**
   * Called for every incoming request. Returns provider-specific options that
   * are forwarded verbatim to `streamText({ providerOptions })`. Useful for
   * per-request tuning (e.g., caching hints, thinking budgets). API keys must
   * never be returned here — they live in environment variables.
   */
  getProviderOptions?: () => Record<string, unknown>;
  /**
   * Maximum number of steps the model is allowed to take per request
   * (a "step" is one model call plus any tool calls it emits). Defaults
   * to 5 — enough for call → result → follow-up → polish loops without
   * letting a runaway agent burn the entire request budget.
   *
   * Raise this if your app has chained tools that legitimately need more
   * round-trips; lower it to cap cost.
   */
  maxSteps?: number;
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
     * Optional per-request model override. When provided as a string, must
     * still match a supported provider prefix — a compromised client cannot
     * bypass the server's allow-list by injecting arbitrary strings.
     */
    model: z.string().optional(),
    /**
     * Optional map of client-declared tools. Keys are tool names.
     */
    tools: z.record(clientToolSchema).optional(),
    /**
     * Optional client-derived system prompt fragment. Typically composed from
     * the consumer app's `.pilot/` manifest and the currently registered
     * skills. It is *appended* to the server-side `options.system` (never
     * replaces it) so server-owned instructions always take precedence.
     *
     * We cap the length so a compromised client can't balloon every request
     * with a megabyte of instructions.
     */
    system: z.string().max(16_000).optional(),
    /**
     * Optional map of registered-state snapshots. Each key is the state slice's
     * `name`; values carry a description and the current value. Serialized as
     * JSON and appended to the system prompt so the model can read live UI
     * state verbatim.
     */
    context: z.record(z.unknown()).optional(),
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
 * Returns `true` when `value` structurally looks like an AI-SDK `LanguageModel`
 * *instance* (v2 or v3) rather than a string ID. We check the stable triad
 * `specificationVersion` + `provider` + `modelId` that every first-party and
 * community adapter exposes.
 */
function isLanguageModelInstance(value: unknown): value is LanguageModel {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as {
    specificationVersion?: unknown;
    provider?: unknown;
    modelId?: unknown;
  };
  return (
    typeof candidate.specificationVersion === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.modelId === "string"
  );
}

/**
 * Extracts the prefix (the part before the first `/`) of a model string.
 * Returns `undefined` when the string has no slash.
 */
function modelPrefix(model: string): string | undefined {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

/**
 * Returns `true` when `prefix` is one of the allow-listed provider prefixes.
 */
function isSupportedPrefix(prefix: string | undefined): prefix is SupportedProviderPrefix {
  if (prefix === undefined) return false;
  return (SUPPORTED_PROVIDER_PREFIXES as ReadonlyArray<string>).includes(prefix);
}

/**
 * Returns `true` when the `AI_GATEWAY_API_KEY` (or a Vercel OIDC token) is
 * present in the environment. In either case the Vercel AI Gateway can
 * resolve a raw provider-prefix string passed to `streamText`.
 */
function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Result of a successful string-model resolution.
 *
 * Either `{ kind: "instance", model }` when a direct adapter produced an
 * instance, or `{ kind: "gateway", id }` when the raw string should be
 * handed to `streamText` so the Vercel AI Gateway resolves it at call time.
 */
type ResolvedModel = { kind: "instance"; model: LanguageModel } | { kind: "gateway"; id: string };

/**
 * A resolver closure created at factory time. Returns the concrete model to
 * hand to `streamText` for a given request's model string. The closure owns
 * any adapter instances that were eagerly imported at handler creation so we
 * never pay the `import()` cost on the request path.
 */
type StringModelResolver = (model: string) => ResolvedModel;

/**
 * Sync existence check for an optional peer-dep package.
 *
 * Dynamic `await import()` is what actually runs the adapter at request time,
 * but we want to surface a "missing peer dep" failure at handler-creation
 * time — not on the first chat message. `createRequire().resolve()` is the
 * cheapest synchronous signal: if the package resolves, `import()` will load
 * it; if it throws `MODULE_NOT_FOUND`, we know the consumer forgot to run
 * `npm install`.
 */
function canResolveModule(pkg: string): boolean {
  try {
    const require = createRequire(import.meta.url);
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lazy-loads the adapter package for a given prefix and returns a function
 * that accepts the remaining model ID (everything after the first `/`) and
 * produces a `LanguageModel`.
 */
async function loadAdapter(
  prefix: SupportedProviderPrefix,
): Promise<(modelId: string) => LanguageModel> {
  const descriptor = PROVIDER_ADAPTERS[prefix];
  // Store the package name in a variable so bundlers don't try to statically
  // resolve the optional peer dependency at build time.
  const pkg = descriptor.pkg;

  if (descriptor.kind === "openrouter") {
    const mod = (await import(pkg)) as OpenRouterAdapterModule;
    if (typeof mod.createOpenRouter !== "function") {
      throw new Error(
        `agentickit: "${descriptor.pkg}" was imported but does not export \`createOpenRouter\`. Please upgrade to a version compatible with AI SDK v6.`,
      );
    }
    const openrouter = mod.createOpenRouter({ apiKey: process.env[descriptor.envKey] });
    return (modelId: string) => openrouter(modelId);
  }

  // Narrow `prefix` away from the openrouter variant so it indexes cleanly
  // into the first-party factory shape.
  type FirstPartyPrefix = Exclude<SupportedProviderPrefix, "openrouter">;
  const firstPartyPrefix = prefix as FirstPartyPrefix;
  const mod = (await import(pkg)) as FirstPartyAdapterModule;
  const factory = mod[firstPartyPrefix];
  if (typeof factory !== "function") {
    throw new Error(
      `agentickit: "${descriptor.pkg}" was imported but does not export a \`${firstPartyPrefix}\` factory. Please upgrade to a version compatible with AI SDK v6.`,
    );
  }
  return (modelId: string) => factory(modelId);
}

/**
 * Build the string-model resolver for the handler.
 *
 * Performs all environment + peer-dependency probing *synchronously* so any
 * misconfiguration (missing env var, missing `@ai-sdk/*` package) throws at
 * handler creation. The actual adapter `import()` is kicked off eagerly but
 * the closure awaits the cached promise inside each request — first request
 * pays no extra latency versus any subsequent one.
 */
function buildStringModelResolver(
  initialModel: string | undefined,
): (model: string) => Promise<ResolvedModel> {
  // Per-prefix cache so two calls to the same provider share one `import()`.
  const adapterCache = new Map<
    SupportedProviderPrefix,
    Promise<(modelId: string) => LanguageModel>
  >();

  const ensureAdapter = (
    prefix: SupportedProviderPrefix,
  ): Promise<(modelId: string) => LanguageModel> => {
    const cached = adapterCache.get(prefix);
    if (cached) return cached;
    const loading = loadAdapter(prefix);
    adapterCache.set(prefix, loading);
    return loading;
  };

  /**
   * Plan how a single model string will be resolved. Runs synchronously and
   * fails fast on *configuration* errors that cannot possibly be recovered
   * at request time (invalid prefix, peer package missing for an explicitly
   * selected provider). Missing env vars are *not* fatal here — build-time
   * tooling (e.g. Next.js `collect page data`) loads the route before env is
   * available; we defer that check to the first request so the build
   * succeeds but a misconfigured runtime fails clearly on its first call.
   */
  const planResolution = (model: string): (() => Promise<ResolvedModel>) => {
    const prefix = modelPrefix(model);
    if (!isSupportedPrefix(prefix)) {
      const expected = SUPPORTED_PROVIDER_PREFIXES.map((p) => `${p}/`).join(", ");
      throw new Error(
        `agentickit: unsupported model prefix in "${model}". Expected one of: ${expected}.`,
      );
    }
    const descriptor = PROVIDER_ADAPTERS[prefix];
    const modelId = model.slice(prefix.length + 1);

    // 1. Direct provider key present → require the adapter package to be
    //    installed and hand off to it. Unambiguous choice — fail fast.
    if (process.env[descriptor.envKey]) {
      if (!canResolveModule(descriptor.pkg)) {
        throw new Error(
          `agentickit: model "${model}" requires either AI_GATEWAY_API_KEY (Vercel gateway) or ${descriptor.envKey} + the ${descriptor.pkg} package installed.\nRun: npm install ${descriptor.pkg}`,
        );
      }
      // Kick off the import eagerly so subsequent requests are hot.
      void ensureAdapter(prefix);
      return async () => {
        const adapter = await ensureAdapter(prefix);
        return { kind: "instance", model: adapter(modelId) };
      };
    }

    // 2. No direct key, but Gateway credentials are present → pass the raw
    //    string to `streamText` and let the Gateway handle it.
    if (hasGatewayCredentials()) {
      return async () => ({ kind: "gateway", id: model });
    }

    // 3. No environment configured at all. Defer the failure to request
    //    time — the env may be populated by the runtime (Vercel, Docker
    //    secrets, etc.) after module load. We re-probe on the first call.
    return async () => {
      if (process.env[descriptor.envKey]) {
        if (!canResolveModule(descriptor.pkg)) {
          throw new Error(
            `agentickit: model "${model}" requires either AI_GATEWAY_API_KEY (Vercel gateway) or ${descriptor.envKey} + the ${descriptor.pkg} package installed.\nRun: npm install ${descriptor.pkg}`,
          );
        }
        const adapter = await ensureAdapter(prefix);
        return { kind: "instance", model: adapter(modelId) };
      }
      if (hasGatewayCredentials()) {
        return { kind: "gateway", id: model };
      }
      throw new Error(
        `agentickit: model "${model}" cannot be served. Set one of: AI_GATEWAY_API_KEY (Vercel AI Gateway), or ${descriptor.envKey} with the ${descriptor.pkg} package installed, or pass a LanguageModel instance to createPilotHandler({ model }).`,
      );
    };
  };

  // Pre-plan the default model (if it was a string) so the factory fails
  // fast on misconfiguration for the handler's primary model.
  const planCache = new Map<string, () => Promise<ResolvedModel>>();
  const plan = (model: string): (() => Promise<ResolvedModel>) => {
    const cached = planCache.get(model);
    if (cached) return cached;
    const p = planResolution(model);
    planCache.set(model, p);
    return p;
  };
  if (initialModel !== undefined) {
    plan(initialModel);
  }

  return (model: string) => plan(model)();
}

/**
 * Merge the server-owned system prompt with any client-derived sections.
 *
 * Order is intentional: server instructions come first (they can't be
 * overridden or shadowed by a tampered client), then the client's derived
 * skills / conventions block, then a serialized snapshot of registered state.
 * Returns `undefined` when nothing is set so we don't pass an empty string
 * to `streamText`.
 */
function composeSystemPrompt(
  serverSystem: string | undefined,
  clientSystem: string | undefined,
  clientContext: Record<string, unknown> | undefined,
): string | undefined {
  const parts: string[] = [];
  if (serverSystem) parts.push(serverSystem);
  if (clientSystem) parts.push(clientSystem);
  if (clientContext && Object.keys(clientContext).length > 0) {
    // JSON-stringify with a label so the LLM can pattern-match on the block.
    parts.push(
      `## Current UI state\n\`\`\`json\n${JSON.stringify(clientContext, null, 2)}\n\`\`\``,
    );
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
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
 * Outcome of resolving the handler's `model` option at factory time.
 *
 * - `fixed`: a concrete `LanguageModel` instance that will be reused for
 *   every request (either supplied directly or returned by a sync thunk).
 * - `pending`: a promise that resolves to a `LanguageModel` instance — the
 *   thunk returned a promise. We kicked off awaiting at factory time; each
 *   request awaits the already-settled promise.
 * - `fromString`: the consumer supplied a string and each request is routed
 *   through the provider registry / Gateway.
 */
type FactoryResolvedModel =
  | { kind: "fixed"; model: LanguageModel }
  | { kind: "pending"; pending: Promise<LanguageModel> }
  | { kind: "fromString"; resolve: (model: string) => Promise<ResolvedModel> };

/**
 * Resolve the `model` option into a factory-time descriptor. Runs once at
 * handler creation so any synchronous misconfiguration (unsupported prefix,
 * missing env var, missing peer package) throws before the handler returns.
 */
function resolveModelSpec(
  spec: ModelSpec,
  stringResolver: (model: string) => Promise<ResolvedModel>,
): FactoryResolvedModel {
  if (typeof spec === "function") {
    // Invoke the thunk exactly once at handler creation so any async setup
    // (auth exchanges, pool construction) is amortized rather than paid per
    // request. The thunk must return a `LanguageModel` instance — strings
    // are not supported here because the thunk escape hatch exists precisely
    // to skip string-based resolution.
    const initialValue = spec();
    if (initialValue instanceof Promise) {
      // Pre-materialize the promise so the first request awaits an already
      // in-flight async job rather than starting one.
      const pending = initialValue.then((value) => {
        if (!isLanguageModelInstance(value)) {
          throw new Error(
            "agentickit: model thunk resolved to a value that is not a LanguageModel instance.",
          );
        }
        return value;
      });
      return { kind: "pending", pending };
    }
    if (!isLanguageModelInstance(initialValue)) {
      throw new Error(
        "agentickit: model thunk must return a LanguageModel instance (or a Promise of one).",
      );
    }
    return { kind: "fixed", model: initialValue };
  }
  if (isLanguageModelInstance(spec)) {
    return { kind: "fixed", model: spec };
  }
  if (typeof spec === "string") {
    return { kind: "fromString", resolve: stringResolver };
  }
  throw new Error(
    "agentickit: `model` must be a string, a LanguageModel instance, or a thunk returning one.",
  );
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
 *   - Resolves `options.model` into a concrete `LanguageModel` (see
 *     {@link ModelSpec}) — honoring direct provider keys when present,
 *     falling back to the Vercel AI Gateway when only `AI_GATEWAY_API_KEY`
 *     is set, and passing through pre-built instances verbatim.
 *   - Delegates streaming to `streamText` with the resolved model, system
 *     prompt, and any client-declared tools.
 *   - Returns the AI-SDK-native UI-message stream via
 *     `result.toUIMessageStreamResponse()`, so `useChat` reassembles tool
 *     parts, reasoning, and text deltas without any custom decoder.
 *   - On validation failure returns 400 with `{error, code: "invalid_request"}`.
 *   - On unexpected failure returns 500 with `{error, code: "internal_error"}`
 *     and never leaks stack traces.
 *
 * String models must start with one of: `openai/`, `anthropic/`, `groq/`,
 * `openrouter/`, `google/`, `mistral/`. Pass a `LanguageModel` instance (or a
 * thunk returning one) to sidestep the registry — useful for Ollama, Azure,
 * Bedrock, or any other provider not on the built-in list.
 *
 * Throws synchronously at handler-creation time when:
 * - `options.model` is a string with an unsupported provider prefix, or
 * - no direct provider key nor `AI_GATEWAY_API_KEY` is present for that
 *   prefix (so the handler has no way to resolve the model), or
 * - the matching `@ai-sdk/*` peer package is missing from `node_modules`.
 */
export function createPilotHandler(
  options: CreatePilotHandlerOptions,
): (request: Request) => Promise<Response> {
  // --- Auto-detect a provider when `model` is omitted or set to "auto" -----
  //
  // The factory must never return a handler that can't possibly serve a
  // request, so when the consumer relied on auto-detection we resolve the
  // env vars here and throw the canonical "no provider configured" error
  // synchronously. When a provider is found we log a single-line notice in
  // dev so developers can see exactly which key was picked up.
  let effectiveModel: ModelSpec;
  if (options.model === undefined || options.model === "auto") {
    const picked = autoDetectModelWithEnv();
    if (picked === null) {
      throw noProviderConfiguredError();
    }
    if (isDev()) {
      // Single-line, unconditional log — the author explicitly asked for it
      // so hobbyists can see the auto-pick in their terminal.
      console.log(`[agentickit] auto-detected ${picked.envKey} — using ${picked.model}`);
    }
    effectiveModel = picked.model;
  } else {
    effectiveModel = options.model;
  }

  const initialStringModel = typeof effectiveModel === "string" ? effectiveModel : undefined;
  const resolveString = buildStringModelResolver(initialStringModel);
  const resolved = resolveModelSpec(effectiveModel, resolveString);

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

    // --- Resolve the per-request model ---------------------------------------
    let resolvedModel: LanguageModel | string;
    try {
      if (body.model !== undefined) {
        // Per-request override. Validate the prefix here too — otherwise a
        // compromised client could bypass the allow-list by injecting
        // arbitrary strings into the body. Note: overrides are only honored
        // when the handler's default `options.model` is a string; otherwise
        // we'd have no resolver plumbed for them.
        const prefix = modelPrefix(body.model);
        if (!isSupportedPrefix(prefix)) {
          return errorResponse(400, {
            error: `Unsupported model "${body.model}". Expected prefix in: ${SUPPORTED_PROVIDER_PREFIXES.map((p) => `${p}/`).join(", ")}.`,
            code: "unsupported_provider",
          });
        }
        if (resolved.kind !== "fromString") {
          return errorResponse(400, {
            error:
              "Per-request model override requires the handler's default model to be a string.",
            code: "unsupported_provider",
          });
        }
        const outcome = await resolved.resolve(body.model);
        resolvedModel = outcome.kind === "instance" ? outcome.model : outcome.id;
      } else if (resolved.kind === "fixed") {
        resolvedModel = resolved.model;
      } else if (resolved.kind === "pending") {
        resolvedModel = await resolved.pending;
      } else {
        // resolved.kind === "fromString" + no override. We know
        // `effectiveModel` was a string because that is the only path that
        // produces `fromString`. Cast is safe.
        const defaultModel = effectiveModel as string;
        const outcome = await resolved.resolve(defaultModel);
        resolvedModel = outcome.kind === "instance" ? outcome.model : outcome.id;
      }
    } catch (error) {
      // Resolver errors at request time (e.g. body override hit an
      // unconfigured prefix) surface as a 400 rather than a 500.
      const message = error instanceof Error ? error.message : "Unknown model-resolution error.";
      return errorResponse(400, { error: message, code: "unsupported_provider" });
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

      // Compose the final system prompt. Server-owned `options.system`
      // always comes first so it can't be overridden by a compromised
      // client; client-derived sections (.pilot/ skills, registered state)
      // are appended.
      const system = composeSystemPrompt(options.system, body.system, body.context);

      const result = streamText({
        model: resolvedModel,
        ...(system ? { system } : {}),
        messages: modelMessages,
        ...(clientTools ? { tools: clientTools } : {}),
        ...(providerOptions ? { providerOptions } : {}),
        // Permit the model to iterate up to `maxSteps` times so tool-calling
        // loops (call → result → follow-up) can complete in a single request.
        stopWhen: stepCountIs(options.maxSteps ?? 5),
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
