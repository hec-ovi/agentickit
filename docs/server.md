# Server handler

`createPilotHandler` is the one-line server endpoint. It takes a model identifier (or instance), wires up AI SDK 6's `streamText`, validates the request body, runs the tool loop, and returns the UIMessage stream the client `useChat` reads.

## Minimum

```ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

const handler = createPilotHandler({
  model: "openrouter/qwen/qwen3-coder:free",
});

export const POST = (req: Request) => handler(req);
```

Works in any Web Fetch API runtime: Next.js App Router, Bun, Cloudflare Workers, Hono. The handler returns a `Response` with `text/event-stream` body.

## Configuration

```ts
createPilotHandler({
  model,                  // string | LanguageModel | () => LanguageModel
  maxSteps,               // default 5; how many tool-loop iterations per request
  system,                 // optional server-owned system prompt prefix
  pilot,                  // path to .pilot/ folder; default "./.pilot"
  loadPilotProtocol,      // disable protocol loading entirely with `false`
  debug,                  // log tool calls + step results to console
  log,                    // also write to ./debug/agentickit-YYYY-MM-DD.log
  onLogEvent,             // structured callback per log line (for SSE / custom sinks)
  getProviderOptions,     // returns providerOptions threaded into streamText
  renderConfirm,          // unused on server; pass on the client side
});
```

## Picking a model

Three forms.

**String.** The handler parses the prefix, loads the matching `@ai-sdk/<provider>` package, and calls `provider(modelId)`. Examples:

```
openai/gpt-4o-mini
anthropic/claude-haiku-4-5
groq/llama-3.3-70b-versatile
openrouter/qwen/qwen3-coder:free
google/gemini-2.5-flash
mistral/mistral-small-latest
```

If `AI_GATEWAY_API_KEY` is set and no per-provider key is, the handler routes the same string through Vercel AI Gateway. See [providers.md](./providers.md) for the full table and per-provider notes.

**LanguageModel instance.** Bypasses the prefix-routing logic entirely. Use when you need to construct the client yourself (custom `baseURL`, custom `fetch`, custom headers):

```ts
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({ baseURL: "http://localhost:8000/v1", apiKey: "..." });
const model = openai.responses("Qwen3.6-27B-AWQ4");

const handler = createPilotHandler({ model });
```

This is what the `examples/todo` server does for vLLM.

**Thunk.** A `() => LanguageModel`. Called once at handler creation; the result is reused for every request. Useful when you want to construct lazily.

## What the handler does per request

1. Parses + validates the request body (Zod). Returns 400 on shape errors.
2. Composes the system prompt: `options.system` first, then any auto-loaded `.pilot/` content, then the client-supplied state/skill context.
3. Builds the tool set from the client's `tools` map (registered hooks).
4. Calls `streamText({ model, messages, tools, ... })` with `stopWhen: stepCountIs(maxSteps)`.
5. Returns `result.toUIMessageStreamResponse()` so the client's `useChat` parses it natively.

The full envelope, including step-level callbacks, lives in [`packages/agentickit/src/server/handler.ts`](../packages/agentickit/src/server/handler.ts).

## The `.pilot/` skills protocol

Optional. Drop a `.pilot/` folder next to your handler entry; the handler loads it on cold start and threads its contents into the system prompt.

Layout:

```
.pilot/
├── AGENTS.md             # house rules + read order for any LLM agent
├── RESOLVER.md           # task-to-skill index ("when user says X, read SKILL Y")
├── conventions/          # cross-cutting standards (style, naming, etc.)
└── skills/
    ├── refund-order/
    │   └── SKILL.md      # one focused capability
    └── manage-todos/
        └── SKILL.md
```

The handler reads `RESOLVER.md` first (the routing index), then the matched `SKILL.md`, then the conventions referenced by either. Total budget capped to keep the system prompt sane.

Bootstrap with the CLI:

```bash
npx agentickit init
npx agentickit add-skill refund-order
```

Both commands write to `.pilot/` in the current directory, idempotently.

To turn the auto-load off (e.g., serverless cold-start latency matters more than the skills):

```ts
createPilotHandler({ model, loadPilotProtocol: false });
```

## Logging and debug

Three knobs:

```ts
createPilotHandler({
  model,
  debug: true,                  // pretty-prints to console
  log: true,                    // also writes ./debug/agentickit-YYYY-MM-DD.log
  onLogEvent: (event) => {      // structured callback per line
    broadcast(event);
  },
});
```

Each event is `{ kind, message, ts, ...detail }` where `kind` is one of `in`, `out`, `step`, `done`, `error`. The example app pipes `onLogEvent` to an SSE channel so the browser shows a live tail of the server's transcript.

## Provider options (advanced)

`getProviderOptions` returns the `providerOptions` object threaded into `streamText`. This is how you reach into provider-specific knobs the public API doesn't expose:

```ts
createPilotHandler({
  model,
  getProviderOptions: () => ({
    openai: { store: false, parallelToolCalls: false },
    anthropic: { thinking: { type: "enabled", budgetTokens: 4000 } },
  }),
});
```

The shape per provider matches whatever that provider's adapter expects. See [providers.md](./providers.md#vllm) for the specific knobs vLLM needs.

## Errors

The handler returns clean JSON envelopes for client-visible errors:

- `400` with `{ error: { kind: "validation", issues } }` for body-shape failures.
- `502` with `{ error: { kind: "provider", message } }` when the upstream provider blows up.
- `500` for everything else; `onLogEvent` gets the full stack.

The client `useChat` surfaces these as the `error` field; render them in the chat view error banner.
