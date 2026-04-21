# `@agentickit/example-todo`

A minimal todo-list app demonstrating [`agentickit`](../../packages/agentickit):
three hooks, one sidebar, working end-to-end against the OpenRouter free tier
(no credit card required — any supported provider also works).

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
# Add OPENROUTER_API_KEY to examples/todo/.env.local
# (grab a free key at https://openrouter.ai/keys — no credit card needed)
pnpm --filter @agentickit/example-todo dev
```

Open <http://localhost:3001>, click the copilot button, and try:

- *"What's still pending?"*
- *"Add 'buy milk' to my list"*
- *"Mark the gym todo as done"*
- *"Remove the milk one"* — triggers the confirmation gate

---

## Environment

The recommended variable is `OPENROUTER_API_KEY` (free tier, no credit card;
grab one at <https://openrouter.ai/keys>). The route's default model is
`openrouter/qwen/qwen3-coder:free`, which supports tool calling.

Alternatives — pick one and uncomment it in `.env.local`:

- Direct provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, or `MISTRAL_API_KEY` (swap the model string
  in `app/api/pilot/route.ts` to the matching `<provider>/<model>`).
- `AI_GATEWAY_API_KEY` — routes the default string through the Vercel AI
  Gateway. On Vercel deployments, `VERCEL_OIDC_TOKEN` is injected
  automatically.

Want a different model? Edit `app/api/pilot/route.ts`. Any `openai/*`,
`anthropic/*`, `groq/*`, `openrouter/*`, `google/*`, or `mistral/*` string
works — or pass a `LanguageModel` instance (Ollama, Azure, Bedrock, …).

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
