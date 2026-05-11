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
- **Product catalog**: "show me the highest-rated luggage under $200" or "what's in stock right now". Backed by a small read-only product database (luggage, electronics, comfort, toiletries, apparel). The assistant can join, aggregate, filter — just SQL, but with a strict read-only validator so it can never write.

## What if I don't have a vLLM server?

The main chat works against any provider you set in `.env.local`.
The Agents page's specialists are tuned for vLLM specifically; without it they show a friendly "specialists need vLLM" message and stay disabled. Everything else still works.

## Layout

```
examples/travel/
├── server/index.ts          back-end: the chat endpoint + four specialist endpoints + a weather proxy
├── src/
│   ├── app.tsx              wires up theme, toast, agent registry, the chat provider, and the routes
│   ├── routes/              one file per page in the table above
│   ├── widgets/             the new-trip wizard (a form the assistant can fill in)
│   ├── components/          buttons, cards, badges, the chat-confirm modal, etc.
│   ├── plugins/             tools the assistant can call (weather, currency, destinations, today's date)
│   ├── data/                local catalogs and the localStorage-backed trip store
│   └── lib/                 small helpers: formatters, toast bar, the booking and packing helpers
└── README.md                this file
```
