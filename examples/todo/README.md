# `@agentickit/example-todo`

A minimal todo-list app demonstrating [`agentickit`](../../packages/agentickit):
three hooks, one sidebar, working end-to-end against the Vercel AI Gateway.

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
# Add AI_GATEWAY_API_KEY to examples/todo/.env.local
pnpm --filter @agentickit/example-todo dev
```

Open <http://localhost:3001>, click the copilot button, and try:

- *"What's still pending?"*
- *"Add 'buy milk' to my list"*
- *"Mark the gym todo as done"*
- *"Remove the milk one"* — triggers the confirmation gate

---

## Environment

The only required variable is `AI_GATEWAY_API_KEY`. Get one at
<https://vercel.com/ai-gateway>. When deploying to Vercel with OIDC linked, no
key is needed — the platform injects `VERCEL_OIDC_TOKEN` automatically.

Want a different model? Edit `app/api/pilot/route.ts`. Any
`openai/*`, `anthropic/*`, or `groq/*` gateway string works.

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
