---
name: web-search
version: 1.0.0
description: |
  Search the web across four backends (DuckDuckGo, Tavily, Firecrawl,
  Serper). Use only for things outside the app's local data — news,
  current prices, opening hours, recent events, places not in the
  destination catalog. The local catalog skills come first.
triggers:
  - "search the web"
  - "look up"
  - "what is the latest"
  - "current price of"
  - "recent reviews of"
  - "news about"
  - "opening hours"
tools:
  - search_duckduckgo
  - search_tavily
  - search_firecrawl
  - search_serper
mutating: false
---

# When to use

Call a search tool when:

- The user asks something time-sensitive (today's news, current prices,
  recent reviews, opening hours TODAY).
- The catalog skills can't answer (city not in `destination-catalog`,
  product not in `product-catalog`).
- The user explicitly says "search", "look up", "what is the latest".

Do NOT call when:

- A local skill covers the question (`destination-catalog`,
  `product-catalog`, `weather-forecast`). Try those first.
- The question is fully answerable from registered state or stable
  background knowledge.

# How to use: pick ONE backend per question

Default order of preference:

1. **`search_serper`** — general factual lookup (Google index, fast).
2. **`search_tavily`** — research-heavy questions where you want longer
   per-result context (multi-paragraph snippets).
3. **`search_firecrawl`** — when your next step will be to scrape a
   specific page (Firecrawl can search-then-scrape).
4. **`search_duckduckgo`** — fallback that needs no API key. Note: shared
   IPs hit CAPTCHAs occasionally; expect intermittent failures.

If a backend returns `{ ok: false, code: "missing_key" }` or
`{ ok: false, code: "rate_limited" }`, fall back to the next preferred
backend. Do NOT report the failure as if it were the answer; transparently
retry with the next option.

# Query craft

A good query is short, specific, and uses real-world terms.

- DO: `"lisbon airport metro hours 2026"`, `"best travel adapter europe usb-c 2026"`
- DON'T: `"can you search for the current operating hours of the metro at lisbon airport this year"`

Strip filler. Pin the year on time-sensitive queries.

# Output narration

- Quote the source domain inline ("per nytimes.com,..."). Don't paste raw
  URLs unless the user asks.
- Combine 2-3 results for any non-trivial claim.
- If sources disagree, flag the disagreement explicitly.
- If the freshest source is older than the question requires, say so.

# Anti-patterns

- Do NOT call a backend when a local catalog skill would answer.
- Do NOT call multiple backends in parallel "just in case".
- Do NOT return the raw `{ ok: false }` envelope to the user — fall back,
  then narrate the actual answer.
- Do NOT recommend a product / hotel / restaurant from a single search
  snippet without naming the source.
