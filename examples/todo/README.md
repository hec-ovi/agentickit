# agentickit · todo example

Minimal Vite + Hono demo of the three hooks, one sidebar, and the `.pilot/`
markdown protocol. Designed to be spun up in under a minute and poked at.

## What's in here

- **Tab 1 — Todos** (`src/widgets/todo.tsx`): `usePilotState` for the list,
  plus granular `usePilotAction`s for add / toggle / delete / bulk-clear.
- **Tab 2 — Contact form** (`src/widgets/contact.tsx`): `usePilotForm`
  binding a `react-hook-form` instance. Auto-registers
  `set_contact_field`, `submit_contact`, `reset_contact`.
- **Tab 3 — Preferences** (`src/widgets/preferences.tsx`): `usePilotState`
  with a setter (auto-generates `update_preferences`) plus a
  `mutating: true` `reset_preferences` action that triggers the confirm
  modal.
- **Tab 4 — Live log** (`src/log-panel.tsx`): subscribes to
  `/api/pilot-log`, an SSE endpoint the Hono server wires up from the
  package's new `onLogEvent` callback. Every request, step, tool call,
  usage summary, and error lands here in real time.

The `.pilot/` folder was scaffolded with `npx agentickit init` and three
`npx agentickit add-skill <name>` calls. It's plain markdown — no JSON, no
codegen, no TS system prompts embedded in route files.

## Run

```bash
# 1. Put your provider credentials in .env.local
cp .env.example .env.local     # if you haven't already

# 2. From the repo root (agentickit/), install + build the package
pnpm install
pnpm --filter agentickit build

# 3. From this folder, start the app
pnpm dev
```

`pnpm dev` runs two processes via `concurrently`:

- `vite` on `http://localhost:5173` serving the React app.
- `tsx watch --env-file=.env.local server/index.ts` on
  `http://127.0.0.1:8787` serving the Hono API. Vite proxies `/api/*` to it.

Open `http://localhost:5173`. The sidebar is open by default — try the
suggested chips or type your own request. The **Live log** tab shows the
structured event stream as the model works.

## Providers

Defaults to `openai/gpt-oss-120b` on a local vLLM server. Any
OpenAI-compatible endpoint works — point `OPENAI_BASE_URL` at it and set
`OPENAI_API_KEY` (vLLM ignores the value, but the SDK requires it to be
non-empty).

Prefer a hosted provider? Unset `OPENAI_BASE_URL`, set e.g.
`OPENAI_API_KEY=sk-...` and `PILOT_MODEL=openai/gpt-4o-mini`, restart. Or
drop `PILOT_MODEL` entirely and let the handler's auto-detection pick
whichever `*_API_KEY` you have in the environment.

## Debugging

File logs land in `debug/agentickit-YYYY-MM-DD.log` — tail them with
`tail -f debug/*.log` for the full stream. The in-app log panel shows the
same events with tool-call args expanded.
