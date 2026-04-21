# `@agentickit/example-todo`

A minimal todo-list app demonstrating [`agentickit`](../../packages/agentickit):
three hooks, one sidebar, working end-to-end with any supported provider —
set `GROQ_API_KEY` or `OPENROUTER_API_KEY` (both free, no credit card) and
the handler auto-detects which to use.

It's built with Next.js 14 (App Router), TypeScript strict mode, and zero UI
dependencies beyond React + `agentickit`.

---

## What it demonstrates

| Capability | Where |
| --- | --- |
| Expose state to the model | `usePilotState({ name: "todos", ... })` |
| Whole-list overwrite tool (auto) | `setValue` on `usePilotState` |
| AI-callable tools | `usePilotAction` for `add_todo`, `toggle_todo`, `remove_todo` |
| Confirmation on destructive actions | `mutating: true` on `remove_todo` |
| Emergent "read the list" | The model summarizes because state is in its context |

`usePilotForm` is skipped here — the checkout example covers it.

---

## Run it in 60 seconds

From the monorepo root (so the workspace resolves `agentickit`):

```bash
pnpm install
pnpm --filter @agentickit/example-todo build   # sanity check
cp examples/todo/.env.local.example examples/todo/.env.local
# Set any ONE key in examples/todo/.env.local — the route auto-detects.
# Free-tier options (no credit card):
#   - GROQ_API_KEY (https://console.groq.com/keys) — fastest inference
#   - OPENROUTER_API_KEY (https://openrouter.ai/keys)
pnpm --filter @agentickit/example-todo dev
```

Open <http://localhost:3001>, click the copilot button, and try:

- *"What's still pending?"*
- *"Add 'buy milk' to my list"*
- *"Mark the gym todo as done"*
- *"Remove the milk one"* — triggers the confirmation gate

---

## Environment

**Set any one key — the route auto-detects the provider.** The handler omits
the `model` option in `app/api/pilot/route.ts`, so at startup it walks this
priority list and picks the first env var present:

1. `GROQ_API_KEY` → `groq/llama-3.3-70b-versatile` (free tier, fastest)
2. `OPENROUTER_API_KEY` → `openrouter/qwen/qwen3-coder:free` (free tier, no credit card)
3. `ANTHROPIC_API_KEY` → `anthropic/claude-haiku-4-5`
4. `OPENAI_API_KEY` → `openai/gpt-4o-mini`
5. `GOOGLE_GENERATIVE_AI_API_KEY` → `google/gemini-2.5-flash`
6. `MISTRAL_API_KEY` → `mistral/mistral-small-latest`
7. `AI_GATEWAY_API_KEY` → `openai/gpt-4o-mini` via the Vercel AI Gateway

Every default model supports tool calling, so the todo actions work without
further tweaking. The two free-tier options (Groq, OpenRouter) are
uncommented in `.env.local.example` for easy copy-paste.

Want a specific model? Edit `app/api/pilot/route.ts` and pass
`model: "<provider>/<model-id>"` — or a `LanguageModel` instance (Ollama,
Azure, Bedrock, …). See the root README's "Server handler" section for the
full spec.

---

## Layout

```
examples/todo/
├── app/
│   ├── api/pilot/route.ts   # createPilotHandler — one line
│   ├── globals.css          # app design tokens (also theme the sidebar)
│   ├── layout.tsx           # root layout
│   └── page.tsx             # the three hooks in one file
├── .env.local.example
├── next.config.js
├── package.json
└── tsconfig.json
```

All hooks live in `app/page.tsx` so you can grep for the hook names and see
every integration point in under 250 lines.
