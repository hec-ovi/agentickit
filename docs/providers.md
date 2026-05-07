# Providers

The handler routes string model identifiers to the matching `@ai-sdk/<provider>` adapter. You install only the adapter(s) you need; the rest stay optional peer deps.

## Supported providers

| Prefix | Env var | Peer package | Default model the handler picks if you don't specify |
| --- | --- | --- | --- |
| `openai/` | `OPENAI_API_KEY` | `@ai-sdk/openai` | `openai/gpt-4o-mini` |
| `anthropic/` | `ANTHROPIC_API_KEY` | `@ai-sdk/anthropic` | `anthropic/claude-haiku-4-5` |
| `groq/` | `GROQ_API_KEY` | `@ai-sdk/groq` | `groq/llama-3.3-70b-versatile` |
| `openrouter/` | `OPENROUTER_API_KEY` | `@openrouter/ai-sdk-provider` | `openrouter/qwen/qwen3-coder:free` |
| `google/` | `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` | `google/gemini-2.5-flash` |
| `mistral/` | `MISTRAL_API_KEY` | `@ai-sdk/mistral` | `mistral/mistral-small-latest` |
| any of the above | `AI_GATEWAY_API_KEY` | none (uses Vercel AI Gateway) | `openai/gpt-4o-mini` |

Resolution order at handler creation:

1. Per-provider key present (`OPENAI_API_KEY`, etc.) → load that adapter and use it directly.
2. Otherwise `AI_GATEWAY_API_KEY` set → route through Vercel AI Gateway, with the same string identifier.
3. Otherwise → throw at first request with a clear "no provider configured" error.

## Picking a model at request time

The client can override the model per-request by passing it in the body:

```tsx
chat.sendMessage("hello", { body: { model: "anthropic/claude-haiku-4-5" } });
```

The handler accepts the override only if it's a known prefix and the corresponding adapter is installed.

## Custom OpenAI-compatible servers

Anything speaking the OpenAI HTTP wire (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra, etc.) works via `OPENAI_BASE_URL`:

```bash
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_API_KEY=anything-the-server-doesnt-validate
export PILOT_MODEL=openai/Qwen3.6-27B-AWQ4
```

The handler defaults to the **Responses API** for the `openai/*` prefix even when `OPENAI_BASE_URL` is set. To opt into Chat Completions for legacy OSS Responses servers that misbehave, set:

```bash
export AGENTICKIT_OPENAI_PROTOCOL=chat
```

This is the only knob; no other value enables the fallback. Real OpenAI users (no `OPENAI_BASE_URL`) are unaffected.

## vLLM specifics (live-verified)

vLLM's `/v1/responses` is more strict than real OpenAI's. Four shape adaptations are required for the AI SDK 6 OpenAI Responses adapter to work end-to-end with multi-turn tool calling. They live in [`examples/todo/server/index.ts`](../examples/todo/server/index.ts) and are mirrored in the live test harness.

Build the model with a custom `fetch` and pass the instance to the handler instead of using a string:

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { createPilotHandler } from "@hec-ovi/agentickit/server";

function buildVllmModel(modelId: string, baseURL: string) {
  const client = createOpenAI({
    baseURL,
    apiKey: process.env.OPENAI_API_KEY ?? "vllm-ignores-this",
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input
        : input instanceof URL ? input.href : input.url;
      const isResponses = url.endsWith("/responses");
      if (!isResponses || !init?.body) return fetch(input, init);

      const body = JSON.parse(init.body as string);

      // 1. Reasoning OFF. The standard `reasoning: null` is ignored on
      //    Qwen3 vLLM; only this top-level kwarg actually disables thinking.
      body.chat_template_kwargs ??= {};
      body.chat_template_kwargs.enable_thinking ??= false;

      // 2. Normalize assistant-text history. vLLM rejects the AI SDK's loose
      //    `{role:"assistant", content:[{output_text}]}` shape; the
      //    Responses Pydantic union wants the full ResponseOutputMessage.
      if (Array.isArray(body.input)) {
        body.input = body.input.map(normalizeVllmInputItem);
      }

      return fetch(input, { ...init, body: JSON.stringify(body) });
    },
  });
  return client.responses(modelId);
}

function normalizeVllmInputItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const it = item as Record<string, unknown>;
  if (it.role === "assistant" && Array.isArray(it.content)) {
    const out = { ...it };
    if (typeof out.type !== "string") out.type = "message";
    if (typeof out.id !== "string")
      out.id = `msg_compat_${Math.random().toString(36).slice(2, 12)}`;
    if (typeof out.status !== "string") out.status = "completed";
    out.content = (it.content as unknown[]).map((part) => {
      if (!part || typeof part !== "object") return part;
      const p = part as Record<string, unknown>;
      if (p.type === "output_text" && !Array.isArray(p.annotations)) {
        return { ...p, annotations: [] };
      }
      return part;
    });
    return out;
  }
  // 4. Sanitize malformed function_call.arguments. vLLM 400s if the
  //    arguments string isn't a valid JSON object literal; real OpenAI
  //    tolerates it so the SDK's error-recovery loop runs.
  if (it.type === "function_call" && typeof it.arguments === "string") {
    try {
      const parsed = JSON.parse(it.arguments);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return item;
    } catch {}
    return { ...it, arguments: "{}" };
  }
  return item;
}

const handler = createPilotHandler({
  model: buildVllmModel("Qwen3.6-27B-AWQ4", "http://localhost:8000/v1"),

  // 3. Disable Responses-API server-side response storage so the AI SDK
  //    inlines prior assistant outputs instead of emitting unresolvable
  //    `item_reference` items vLLM can't dereference (chat-parser KeyError).
  //    parallelToolCalls=false reduces the chance Qwen3 truncates the
  //    Nth call mid-stream when emitting many calls in one turn.
  getProviderOptions: () => ({
    openai: { store: false, parallelToolCalls: false },
  }),
});
```

### The four vLLM strictness issues, explained

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Streamed reasoning tokens flood the response | Qwen3 chat template defaults to thinking-on; OpenAI's `reasoning` field is ignored | Inject `chat_template_kwargs.enable_thinking=false` at top level |
| HTTP 500 with `KeyError: 'role'` on multi-turn requests | SDK emits `item_reference` items; vLLM can't dereference and falls through to chat parser | Set `providerOptions.openai.store=false` so the SDK inlines prior outputs |
| HTTP 400 with 200+ Pydantic validation errors after first text turn | SDK emits the loose `{role:"assistant", content:[output_text]}` shape; vLLM wants the full `ResponseOutputMessage` (`type:"message"`, `id`, `status`, `annotations`) | Normalize the shape at the network shim |
| HTTP 400 "Can only get item pairs from a mapping" | Model emitted bad JSON for `function_call.arguments`; vLLM enforces it must be a JSON object | Sanitize bad arguments to `"{}"` so the SDK's error-recovery turn can complete |

None of these shimming concerns leak into the agentickit library. They live entirely at the example's transport layer, exactly where adapters belong.

### Streaming on, reasoning off, /responses only

This is the rule for vLLM in this repo. The bundled example, the [live protocol tests](./testing.md#live-protocol-tests), and the [live UI tests](./testing.md#live-ui-tests) all commit to it. If you need reasoning, route to a different provider; if you need chat-completions on vLLM, opt in with `AGENTICKIT_OPENAI_PROTOCOL=chat`.

## Anthropic with extended thinking

```ts
createPilotHandler({
  model: "anthropic/claude-haiku-4-5",
  getProviderOptions: () => ({
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 4000 },
    },
  }),
});
```

The reasoning blocks come back as separate UI parts and render in the sidebar's collapsed `<details>` element.

## Headers and proxying

For any provider that needs a custom header (e.g., `OpenRouter-Referer`, `OpenAI-Project`), build the client yourself and pass the `LanguageModel` instance:

```ts
import { createOpenAI } from "@ai-sdk/openai";

const client = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  headers: { "OpenAI-Project": "proj_..." },
});

createPilotHandler({ model: client("gpt-4o-mini") });
```

## When to use Vercel AI Gateway

If you want one auth surface for many providers, prefer it. Set `AI_GATEWAY_API_KEY` and use any prefix in your model strings; the handler routes through the gateway transparently. The gateway also handles per-route fallbacks, observability, and key rotation. See https://vercel.com/docs/ai-gateway.
