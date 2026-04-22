---
name: write-custom-backend
version: 1.0.0
description: |
  Configure `createPilotHandler` for a consumer's server. Covers the full
  options surface (`model`, `system`, `maxSteps`, `getProviderOptions`),
  how per-request model overrides work, the provider-flexibility patch,
  and the security envelope the handler returns on error.
triggers:
  - "createPilotHandler"
  - "server route"
  - "custom backend"
  - "system prompt"
  - "maxSteps"
  - "providerOptions"
  - "per-request model"
tools:
  - edit_file
  - read_source
mutating: true
---

# Write Custom Backend

## Contract

By the end of this skill the consumer has:

- A server route that exports a `POST` handler returned by
  `createPilotHandler`.
- A clear `model` argument in one of the three supported shapes
  (string, `LanguageModel` instance, thunk).
- A system prompt (server-owned; always prepended before client-derived
  instructions).
- A `maxSteps` chosen deliberately, not accepted blindly.
- (Optionally) `getProviderOptions` for per-request provider tuning
  (cache hints, thinking budgets).

## Iron Law: server-owned system prompt always wins

The handler composes the final system prompt as
`[options.system, body.system, body.context]` (see `composeSystemPrompt`
in `packages/agentickit/src/server/handler.ts` lines 613-628).
`options.system` is server-controlled and comes first; client-derived
sections (`.pilot/` skills, registered state) are appended. **If you
need guardrails the client cannot tamper with (tone, safety instructions,
tenant isolation), put them in `options.system`. A compromised client can
inject `body.system` but cannot shadow `options.system`.**

## Phases

### Phase 1: pick a runtime shape

`createPilotHandler` returns `(request: Request) => Promise<Response>`,
so it works anywhere the Web Fetch API is available:

- **Next.js App Router** (tested): `export const POST = createPilotHandler({...})`.
- **Bun**: pass into `Bun.serve({ fetch: POST })`.
- **Cloudflare Workers**: export as `export default { fetch: POST }`.
- **Hono**: `app.post("/api/pilot", (c) => POST(c.req.raw))`.

### Phase 2: write the minimal route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

export const POST = createPilotHandler({});
```

Auto-detects a provider from env. See `skills/choose-provider/SKILL.md`
for the priority order.

### Phase 3: the full options surface

```ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

export const POST = createPilotHandler({
  model: "anthropic/claude-sonnet-4-5",
  system: [
    "You are the support copilot for a kanban app.",
    "Always confirm destructive actions before invoking them.",
    "Never expose internal card IDs; reference cards by title.",
  ].join(" "),
  maxSteps: 5,
  getProviderOptions: () => ({
    anthropic: { cacheControl: { type: "ephemeral" } },
  }),
});
```

The verified options shape (from `CreatePilotHandlerOptions` in
`server/handler.ts` lines 224-275):

```ts
interface CreatePilotHandlerOptions {
  system?: string;
  model?: ModelSpec;                                // see Phase 4
  getProviderOptions?: () => Record<string, unknown>;
  maxSteps?: number;                                // default 5
}
```

### Phase 4: the three `ModelSpec` shapes

From the exported type (line 115):

```ts
type ModelSpec = string | LanguageModel | (() => LanguageModel | Promise<LanguageModel>);
```

**Shape 1: string**.

```ts
createPilotHandler({ model: "openai/gpt-4o" });
createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" });
createPilotHandler({ model: "auto" });   // synonym for omitting model
```

Resolution order (see `planResolution` in lines 532-585):

1. Direct provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) +
   matching `@ai-sdk/*` peer package installed → direct adapter.
2. No direct key but `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` set →
   string handed to `streamText` verbatim; the Vercel AI Gateway
   resolves it.
3. Neither → the handler factory throws at creation time with a clear
   error naming the missing env var and package.

Supported prefixes (line 29): `openai`, `anthropic`, `groq`, `openrouter`,
`google`, `mistral`. Anything else throws "unsupported model prefix" at
handler creation.

**Shape 2: `LanguageModel` instance**.

```ts
import { createOllama } from "ai-sdk-ollama";
const ollama = createOllama();
export const POST = createPilotHandler({ model: ollama("llama3.3") });
```

Detected via `isLanguageModelInstance` (lines 380-392). Prefix validation
is skipped. Use this for Ollama, Azure, Bedrock, or any custom adapter.

**Shape 3: thunk**.

```ts
createPilotHandler({
  model: async () => {
    const token = await refreshToken();
    return customAdapter(token, "model-id");
  },
});
```

Called exactly once at handler creation (lines 710-722). The resolved
value must be a `LanguageModel` instance; strings are rejected with a
clear error. Useful for async auth exchanges at startup.

### Phase 5: per-request model overrides

The client can pass `<Pilot model="openai/gpt-4o-mini">` and the string
is forwarded in the request body. The server re-validates the prefix
against the same allow-list (lines 841-853), so the client cannot inject
an arbitrary string.

Overrides are only honored when `options.model` is a string (lines
854-860); if the handler uses a `LanguageModel` instance or thunk, the
client override returns a `400 unsupported_provider`. This is deliberate:
the instance / thunk paths don't have a resolver plumbed.

### Phase 6: `maxSteps`

The handler passes `stopWhen: stepCountIs(options.maxSteps ?? 5)` to
`streamText` (line 907). A "step" is one model call plus any tool calls
it emits. Five is enough for `call → result → follow-up → polish`;
raise it to 10+ if your app has chained tools that legitimately need
more round-trips. Lower it to cap cost.

### Phase 7: `getProviderOptions`

Called for every request (line 888-891). Returns provider-specific
options forwarded verbatim to `streamText({ providerOptions })`. Use for:

- Anthropic cache control.
- OpenAI reasoning / thinking budgets.
- Groq tool-call retry settings.
- Per-provider temperature overrides.

Do NOT return API keys here; they live in env vars. The option's type is
intentionally loose (`Record<string, unknown>`) to avoid leaking AI SDK
internal types through the public API.

### Phase 8: the error envelope

All non-streaming errors return a narrow JSON envelope
(`PilotErrorBody`, lines 283-287):

```json
{ "error": "human-readable message", "code": "invalid_request" }
```

Codes (narrow, client-matchable):

- `invalid_request`: 400, body didn't parse.
- `unsupported_provider`: 400, model prefix not allowed.
- `internal_error`: 500, catchall.
- `method_not_allowed`: 405, not a POST.

Stack traces never leak (line 925: `console.error` server-side, sanitized
message to client).

### Phase 9: CORS

The handler emits permissive CORS headers by default (line 367-372).
Consumers who need tighter policy wrap the handler in their own
middleware. Don't modify the response headers from inside
`getProviderOptions` (they're applied after `streamText` returns).

## Anti-Patterns

- Putting the API key in `getProviderOptions`. Env vars, always.
- Returning `new Response()` from inside `getProviderOptions`. That hook
  feeds `streamText`, not the response pipeline.
- Parsing the request body yourself to inject state. The handler's Zod
  schema (lines 325-359) validates exactly what `useChat` sends; add a
  custom preprocessor by wrapping the handler in middleware, not by
  patching internals.
- Setting `maxSteps: 100`. At that point a runaway loop costs real money.
  If you need more steps, examine whether the chain is the right tool.
  A multi-step LLM loop is rarely the cheapest or most reliable path.
- Assuming `streamText` is called on the server for every tool. Client
  tools (declared via `usePilotAction`) stream back to the browser. The
  server wraps them with `dynamicTool` and a throwing `execute` that
  signals "this is client-side only" (lines 668-672).

## Output Format

After configuring, report:

- The runtime (Next.js / Bun / Workers / Hono).
- The `model` shape (string / instance / thunk) and the specific value.
- Whether `system` / `maxSteps` / `getProviderOptions` are set and why.
- A one-sentence description of the error-handling contract the consumer
  should expect.

## Tools Used

- Edit the server route file.
- Read `packages/agentickit/src/server/handler.ts` to verify the exact
  option shape and provider registry.
