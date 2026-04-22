---
name: choose-provider
version: 1.0.0
description: |
  Pick a model provider for a consumer's app. Covers auto-detection, the
  six allow-listed prefixes (openai, anthropic, groq, openrouter, google,
  mistral), the Vercel AI Gateway fallback, and the escape hatch for
  non-registered providers (Ollama, Azure, Bedrock). Use when the question
  is "which model string / which env var / which adapter".
triggers:
  - "which provider"
  - "which model"
  - "Groq"
  - "OpenAI"
  - "OpenRouter"
  - "Anthropic"
  - "Gemini"
  - "Mistral"
  - "auto-detect"
  - "Vercel Gateway"
  - "Ollama"
  - "Bedrock"
tools:
  - read_env
  - edit_file
mutating: false
---

# Choose Provider

## Contract

By the end of this skill the consumer knows:

- Whether auto-detection covers them (the common case) or they need an
  explicit `model` argument.
- The exact env var and adapter package for their chosen provider.
- That "bring your own adapter" is supported for providers outside the
  built-in registry (Ollama, Azure, AWS Bedrock, etc.).
- The Vercel AI Gateway fallback option: no adapter package, one key.

## Iron Law: one env var per provider

The server handler resolves strings through a fixed registry (see
`PROVIDER_ADAPTERS` in `packages/agentickit/src/server/handler.ts` lines
56-71). Each prefix maps to exactly one env var and one adapter package.
Auto-detection walks `AUTO_DETECT_ORDER` (lines 150-160) and stops on the
first env var present. **Setting multiple direct-provider keys will work,
but auto-detect becomes deterministic and non-obvious; the first in
priority order wins. Be explicit if the order matters for your case.**

## Phases

### Phase 1: the happy path, let it auto-detect

Set one env var, install the matching adapter, omit `model`:

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "agentickit/server";
export const POST = createPilotHandler({});
```

Auto-detection walks this order (from `AUTO_DETECT_ORDER`):

| Priority | Env var | Default model | Why this default |
|----------|---------|---------------|------------------|
| 1 | `GROQ_API_KEY` | `groq/llama-3.3-70b-versatile` | Fastest inference; free tier |
| 2 | `OPENROUTER_API_KEY` | `openrouter/qwen/qwen3-coder:free` | Free tier, no credit card |
| 3 | `ANTHROPIC_API_KEY` | `anthropic/claude-haiku-4-5` | Cheapest Claude with tool-use |
| 4 | `OPENAI_API_KEY` | `openai/gpt-4o-mini` | Cheapest OpenAI with tools |
| 5 | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-flash` | Current price-perf Flash |
| 6 | `MISTRAL_API_KEY` | `mistral/mistral-small-latest` | Mistral price-perf |
| 7 | `AI_GATEWAY_API_KEY` | `openai/gpt-4o-mini` | Fallback via Vercel Gateway |

If no key is set, the handler factory throws immediately with a message
listing every supported env var (see `noProviderConfiguredError()` at
lines 206-215).

### Phase 2: the explicit path, pass a model string

When you want a specific model:

```ts
createPilotHandler({ model: "anthropic/claude-sonnet-4-5" });
createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" });
createPilotHandler({ model: "groq/llama-3.3-70b-versatile" });
```

Supported prefixes (from `SUPPORTED_PROVIDER_PREFIXES`, line 29-36):
`openai`, `anthropic`, `groq`, `openrouter`, `google`, `mistral`.

The handler resolves in this order:

1. **Direct provider key present** (`OPENAI_API_KEY` for `openai/*`, etc.)
   + the matching `@ai-sdk/*` adapter installed → direct adapter.
2. **No direct key but `AI_GATEWAY_API_KEY` set** → raw string passed to
   `streamText`, resolved by the Vercel AI Gateway at call time.
3. **Neither** → throw at handler creation (lines 581-583) with a message
   telling the consumer exactly which env var or package is missing.

### Phase 3: the Gateway-only path

Set `AI_GATEWAY_API_KEY` (or run on Vercel with `VERCEL_OIDC_TOKEN`).
Install NO adapter packages. Pass any supported prefix string:

```ts
createPilotHandler({ model: "openai/gpt-4o" });
```

The Gateway handles provider routing and billing. Works for every supported
prefix. See Vercel's docs for Gateway setup; agentickit has no Gateway-
specific configuration.

### Phase 4: the bring-your-own-adapter path

For providers NOT in the built-in list (Ollama, Azure OpenAI, AWS Bedrock,
Groq through a different SDK, custom gateways):

```ts
import { createOllama } from "ai-sdk-ollama";
const ollama = createOllama();
export const POST = createPilotHandler({ model: ollama("llama3.3") });
```

Any object that's a valid AI SDK v2 or v3 `LanguageModel` instance is
accepted. It's sniffed via `isLanguageModelInstance` (lines 380-392),
which checks for the `specificationVersion` + `provider` + `modelId`
triad every adapter exposes. Prefix validation is skipped for instances.

You can also pass a thunk for lazy / async setup:

```ts
createPilotHandler({
  model: async () => {
    const creds = await fetchCreds();
    return customAdapter(creds, "model-x");
  },
});
```

The thunk runs exactly once at handler creation (lines 710-722).

### Phase 5: per-request override from the client

`<Pilot model="openai/gpt-4o-mini">` forwards the string into every
request's body. The server handler re-validates the prefix against the
same allow-list (lines 841-853), so a compromised client cannot inject an
arbitrary string. Overrides are only honored when the handler's default
`model` is also a string (lines 854-860); if you passed a `LanguageModel`
instance or thunk server-side, the client override is a 400.

## Anti-Patterns

- Installing every adapter "to be safe". Peer deps are optional; shipping
  all of them bloats the consumer's bundle.
- Hard-coding the API key in the model string. Keys always come from
  `process.env`.
- Mixing `model` on `<Pilot>` and on `createPilotHandler`. The client
  value wins when both are strings; when they disagree, debugging is
  harder than it needs to be.
- Using `model: "auto"` as a magic string. It's supported (treated as
  equivalent to omitting `model`, lines 788-801) but less clear than
  just leaving the option out.

## Output Format

After the choice is made, report:

- The chosen provider (by name: "OpenRouter", "Groq", etc.).
- The env var the consumer needs to set.
- The adapter package the consumer needs to install (or "none, using
  the Vercel AI Gateway").
- The `model` argument in `createPilotHandler` (or "omitted, using
  auto-detection").

## Tools Used

- Read the consumer's `.env.local` to see what's already configured.
- Edit `app/api/pilot/route.ts` to pass the `model` option.
- Edit `package.json` / run `npm install <adapter>` as needed.
