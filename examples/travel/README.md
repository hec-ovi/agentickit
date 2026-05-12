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

The travel app already wires every framework primitive by hand. If you're starting your own app and want the same shape, the CLI generates the boilerplate for you:

```bash
npx agentickit init                        # create .pilot/RESOLVER.md + one example skill
npx agentickit add-skill <name>            # add a skill that teaches YOUR app's rules to its own agent
npx agentickit list-tools                  # see stock tool plugins (web-search ships today)
npx agentickit add-tool web-search         # scaffold the four-backend search plugin straight into your repo
npx agentickit list-agents                 # see stock agent templates (chat, observational)
npx agentickit add-agent <name> --type T   # scaffold a chat or observational agent
```

The travel example does NOT call these (it hand-codes everything so you can read the source), but the templates produce the same shape its `plugins/` and `server/` use.

## Known gap: no `.pilot/` folder yet

Travel is currently missing the `.pilot/` skills folder. This is a regression, not a deliberate choice. The previous showcase at `examples/todo` (deleted on 2026-05-11 in commit d9e92e5 when travel replaced it) shipped a `.pilot/` with six consumer-app skills. The clearest one was `skills/chart/SKILL.md`: a panel hidden by default, paired with `show_chart` / `hide_chart` tools, with trigger phrases like "show me stats" / "visualize" / "I'm done with it". The agent learned the WHEN from markdown; the React component owned the HOW.

When travel was built we ported the wiring (hooks, surfaces, plugins) but not the spirit (skills). The system prompt currently lives inline in `server/index.ts` instead of as editable markdown under `.pilot/skills/`. The framework's headline differentiator is therefore invisible from the showcase a new user looks at first.

What this should look like (planned for the next release):

```
examples/travel/.pilot/
├── RESOLVER.md
└── skills/
    ├── propose-flight/SKILL.md     # paired with the propose_flight renderAndWait action
    ├── propose-hotel/SKILL.md      # paired with propose_hotel
    ├── add-day-item/SKILL.md       # paired with add_day_item
    ├── pack-checklist/SKILL.md     # paired with the packing route's actions
    ├── trip-style-guide/SKILL.md   # tone, currency rules, seasonality assumptions
    └── escalate-to-specialist/SKILL.md   # when the concierge should hand off
```

If you're building a real app on agentickit today, do NOT copy travel's pattern of inline `system: "..."` strings. Run `npx agentickit init` and ship a `.pilot/` folder. See the package README for the full pattern.
