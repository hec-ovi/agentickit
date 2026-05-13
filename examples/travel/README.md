# travel example

A trip-planner app where you can ask an assistant for everything: plan, edit, pack, book.
Every part of the agentickit toolkit shows up in one of the pages below.

## Run it

```bash
cp .env.example .env.local
pnpm install
pnpm dev
# open http://localhost:5174
```

The first time, you'll see five demo trips already loaded.
Open the chat (bottom-right) and try things. If something looks broken, try Preferences → "Restore demo seeds".

## What each page is for

| Page        | Try it                                            | What it shows                                                                                                                                |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Trips       | "plan a 5-day trip to Lisbon for two travelers"   | The assistant fills out a trip form for you. Submitting a brand-new trip skips the approval popup; once the trip exists, every change asks. |
| Trip detail | "what's the weather looking like for this trip?"  | The page tells the assistant which trip you're looking at, so it answers in context.                                                         |
| Itinerary   | "propose a flight from JFK on the start date"     | The assistant suggests options and the page shows them as cards. You pick one. You can also say "skip" and it moves on.                     |
| Packing     | "add 5 things for a rainy spring week"            | A small chat lives inside the page (no sidebar needed). The page also tells the assistant "we're talking about packing" so it stays focused. |
| Booking     | "book the cheapest flight"                        | Anything the assistant tries to book asks you to approve first. Cancel works, approve works, both are obvious.                              |
| Preferences | "set my home airport to LAX"                      | Long-term settings the assistant remembers across trips. Sensitive enough that every change has to be approved.                              |
| Agents      | switch to "Flights specialist" then say hi        | The assistant can be a generalist or one of four specialists. The picker reads the live list of registered agents.                          |
| Threads     | send a message in α, switch to β, switch back     | One chat panel, three independent conversations. Switching tabs keeps each one's history.                                                    |
| Lab         | open a popup, open a modal, push the sidebar      | A sandbox of every chat-surface variation: floating bubble, centered modal, side panel, chips-only mode, read-only mode.                     |

## What else can the assistant do

Beyond the page-specific tools above, the assistant has a few extras you can ask anytime:

- **Web search**: "search the web for the best travel adapter in 2026". Four search engines are wired in; the assistant defaults to Serper (Google index, fast), uses Tavily for research-heavy questions, Firecrawl when it'll likely want to follow up by reading a specific page, and DuckDuckGo as a no-key fallback. Free-tier API keys for the three keyed ones go in `.env.local`; DuckDuckGo just works.
- **Product catalog**: "show me the highest-rated luggage under $200" or "what's in stock right now". Backed by a small read-only product database (luggage, electronics, comfort, toiletries, apparel). The assistant can join, aggregate, filter: just SQL, but with a strict read-only validator so it can never write.

## What if I don't have a vLLM server?

The main chat works against any provider you set in `.env.local`.
The Agents page's specialists are tuned for vLLM specifically; without it they show a friendly "specialists need vLLM" message and stay disabled. Everything else still works.

## Layout

```
examples/travel/
├── server/
│   ├── index.ts             chat endpoint, four specialist endpoints, weather proxy, search proxy, SQL routes, health
│   ├── web-search/          DuckDuckGo, Tavily, Firecrawl, Serper backends behind /api/search?backend=
│   ├── sql/                 schema + seeds + read-only validator powering /api/sql/schema and /api/sql/query
│   └── agui-bridge.ts       AG-UI to AI SDK bridge for the specialist endpoints
├── src/
│   ├── app.tsx              wires theme, toast, agent registry, chat provider, routes
│   ├── routes/              one file per page in the table above
│   ├── widgets/             the new-trip wizard (a form the assistant can fill in)
│   ├── components/          buttons, cards, badges, the chat-confirm modal, etc.
│   ├── plugins/             tools the assistant can call. Ten plugins across seven files:
│   │                          weather, currency, destinations, today's date,
│   │                          four web-search backends, SQL describe + query
│   ├── data/                local catalogs and the localStorage-backed trip store
│   └── lib/                 small helpers: formatters, toast bar, booking, packing
└── README.md                this file
```

## Extending the example with the `agentickit` CLI

The travel app wires every framework primitive by hand so you can read the source. If you're starting your own app and want the same shape scaffolded for you, the CLI is skill-first: every CLI-scaffolded capability is a SKILL.md (the model-facing instructions) plus optional hook code, never a "tool" without instructions.

```bash
npx agentickit init                                  # create .pilot/RESOLVER.md + one example skill
npx agentickit list-skills                           # see stock skill templates you can install by name
npx agentickit add-skill web-search                  # install a stock skill (auto-detects + uses its declared --type)
npx agentickit add-skill <name>                      # scaffold a custom skill (defaults to --type text)
npx agentickit add-skill <name> --type server-tool   # SKILL.md + src/plugins/<name>.tsx + server/<name>/index.ts
npx agentickit add-skill <name> --type ui-component  # SKILL.md + src/plugins/<name>.tsx (show/hide actions + panel)
npx agentickit list-agents                           # stock agent templates (chat, observational)
npx agentickit add-agent <name> --type chat          # scaffold an agent (defaults to --type chat)
```

Stock skills shipped today: `web-search` (4 backends) and `chart` (inline panel with show/hide). Travel itself does NOT call these (it hand-codes everything for readability), but the same web-search code lives both in travel under `server/web-search/` and in the bundled template under `packages/agentickit/templates/skills/web-search/`.

## Where the agent's behavior actually lives

Travel ships its `.pilot/` folder at `examples/travel/.pilot/`. That folder IS the system prompt. `server/index.ts` no longer carries 30 lines of inline behavioral guidance: `createPilotHandler` auto-loads `.pilot/RESOLVER.md` plus every `.pilot/skills/<name>/SKILL.md` it references and composes the prompt at startup. Edit any markdown file, restart the dev server, behavior changes (no TypeScript touched, no rebuild).

```
examples/travel/.pilot/
├── RESOLVER.md                                  # trigger -> skill routing table
└── skills/
    ├── trip-style-guide/SKILL.md                # always-on tone, date format, multi-step rule
    ├── propose-flight/SKILL.md                  # paired with the propose_flight renderAndWait action
    ├── propose-hotel/SKILL.md                   # paired with propose_hotel
    ├── add-day-item/SKILL.md                    # paired with add_day_item
    ├── weather-forecast/SKILL.md                # paired with get_weather
    ├── currency-conversion/SKILL.md             # paired with convert_currency
    ├── destination-catalog/SKILL.md             # paired with list_destinations + describe_destination
    ├── product-catalog/SKILL.md                 # paired with the SQL describe_schema + query_products
    ├── web-search/SKILL.md                      # paired with the four search_* backends
    ├── packing-list/SKILL.md                    # paired with add/toggle/remove_packing_item
    └── preferences-management/SKILL.md          # paired with update_preferences
```

The hook code each skill names lives where build tools expect it: client React in `src/plugins/`, server endpoints in `server/`. The skill is the dispatch unit; the code is the substrate the skill invokes. If you want to change WHEN the agent uses a tool, edit the SKILL.md. If you want to change HOW the tool runs, edit the React or server code. Two layers, edited independently, locked together by tool name.

Want to scaffold this shape in your own app? `npx agentickit init` creates the folder, then `npx agentickit add-skill <name> --type [text|server-tool|ui-component]` adds each capability with the right hook stubs in the right places.

## Package capability map (where to look for what)

Every public surface in `@hec-ovi/agentickit` is exercised somewhere in this example. If you're trying to learn a specific feature, this is your jump table.

| Package surface | Where it's used in travel |
| --- | --- |
| `usePilotState({ value, schema })` (read-only context) | every route's `active_trip` / `booking_review` / `packing_list` registration (`src/routes/*.tsx`) |
| `usePilotState({ value, schema, setValue })` (auto-registers `update_<name>` mutating tool) | `src/routes/preferences.tsx` (the agent can change preferences via the auto-generated `update_preferences`) |
| `usePilotAction` non-mutating | every plugin under `src/plugins/` (weather, currency, destinations, date, sql, web-search) |
| `usePilotAction({ mutating: true })` (confirm-modal gate) | `src/routes/booking.tsx` (`book_flight`, `book_hotel`, `book_all_pending`); `src/routes/packing.tsx` |
| `usePilotAction({ renderAndWait })` (HITL picker) | `src/routes/itinerary.tsx` (`propose_flight`, `propose_hotel`) |
| `usePilotForm(form, { confirm: { submit: false } })` (per-form opt-out) | `src/widgets/new-trip-wizard.tsx` |
| `usePilotInstructions({ name, value })` (page-scoped prompt) | `src/routes/packing.tsx` |
| `<Pilot apiUrl renderConfirm runtime>` (custom confirm modal override) | `src/app.tsx` + `src/components/app-confirm.tsx` |
| `<PilotSidebar mode composer suggestions>` (overlay vs push, composer modes) | `src/app.tsx` (default), `src/routes/lab.tsx` (variants) |
| `<PilotPopup>` (floating bubble) | `src/routes/lab.tsx` |
| `<PilotModal>` (centered dialog) | `src/routes/lab.tsx` |
| `<PilotChatView>` (headless chat body for custom chrome) | `src/routes/packing.tsx`, `src/routes/threads.tsx`, `src/routes/lab.tsx` |
| `<PilotChatView composer="suggestions" \| "off">` | `src/routes/lab.tsx` |
| `<PilotAgentRegistry>` + `useRegisterAgent` + `useAgent` + `useAgents` (multi-agent) | `src/app.tsx` (registry) + `src/routes/agents.tsx` (specialist switcher) |
| `<PilotAgentStateView>` + `usePilotAgentState` + `usePilotAgentActivity` (live state HUD) | `src/routes/agents.tsx` |
| `localRuntime({ initialMessages, onMessagesChange })` (per-thread persistence) | `src/routes/threads.tsx` |
| `agUiRuntime({ agent })` + `HttpAgent` (AG-UI specialists) | `src/app.tsx` + `server/agui-bridge.ts` |
| `inspect_context` auto-tool (try: "look around and tell me what state you can see") | auto-registered by `<Pilot>`; works on every page |
| `createPilotHandler({ system })` AUTO-load from `.pilot/` | `server/index.ts` (no `system:` passed; loader composes from `.pilot/`) |
| `createPilotHandler({ log: true })` (per-day log file under `./debug/`) | `server/index.ts` (check `./debug/agentickit-YYYY-MM-DD.log` after a chat turn) |
| `loadPilotProtocol` (RESOLVER-driven) + orphan/missing warnings | exercised on every server start; pinned by `server/pilot-load.test.ts` |
| `parseResolver` / `parseSkill` (advanced protocol parsers) | not directly used here; only consumers building tooling on `.pilot/` need them |

## What the example deliberately does NOT demonstrate

- **`createPilotHandler({ debug: true })` and `onLogEvent` (structured per-event subscriber).** Travel uses `log: true` (file on disk) for simplicity. Wiring `onLogEvent` to an SSE endpoint for a live observability dashboard is a separate showcase worth doing once and would land as its own demo route.
- **CLI scaffolding (`init`, `add-skill`, `add-agent`).** These are one-shot commands run by a NEW user; impossible to demo from inside an already-built example. The README block above shows what to type; the bundled `web-search` skill template is a real reference of what the scaffold produces.
- **`<PilotConfirmModal>` re-export.** Travel writes its own confirm modal in `src/components/app-confirm.tsx` to demonstrate the `renderConfirm` override path; the package's default modal is what users get when they DON'T pass `renderConfirm`. Both shapes are tested at the package level.
