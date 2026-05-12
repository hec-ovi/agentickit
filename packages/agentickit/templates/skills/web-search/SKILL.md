---
name: web-search
version: 1.0.0
description: |
  Search the web for current information across four backends (DuckDuckGo,
  Tavily, Firecrawl, Serper). Each backend is its own tool. Use this skill
  whenever you need information you don't already have, anything time-
  sensitive (today's news, current prices, recent product reviews), or any
  fact you'd want to double-check before stating.
triggers:
  - "search the web"
  - "look up"
  - "what is the latest"
  - "current price of"
  - "recent reviews of"
  - "news about"
  - "find me information on"
tools:
  - search_duckduckgo
  - search_tavily
  - search_firecrawl
  - search_serper
mutating: false
---

# When to use

Call a search tool when:

- The user asks something time-sensitive (today's weather, today's news, current prices, recent reviews).
- The user asks for facts you'd want to verify rather than recite from memory.
- The user explicitly says "search", "look up", "find", "what is the latest".
- You're about to make a recommendation that hinges on a specific external fact you're not sure about.

Do NOT call a search tool when:

- The answer is fully knowable from the conversation context, the registered state, or your own training data on stable topics (math, definitions, well-known historical facts).
- The user is asking for an opinion, a creative output, or a step-by-step plan that doesn't depend on external facts.
- A specialist tool covers the question better (e.g. `get_weather`, `query_products`, an internal database tool).

# How to use: pick the right backend

The four backends differ in cost, freshness, depth, and whether they need an API key. Pick once per question; do NOT call multiple in parallel hoping one works.

| Backend | Cost | Freshness | Depth | Key | Pick this when... |
|---|---|---|---|---|---|
| `search_serper` | Free tier 2500 q | Very fresh (Google index) | Snippets | `SERPER_API_KEY` | DEFAULT for general queries. Fast, fresh, Google-quality results. |
| `search_tavily` | Free ~1000 q/mo | Very fresh, AI-tuned | Content-rich snippets | `TAVILY_API_KEY` | Research-heavy questions where you want longer per-result context (multi-paragraph snippets). |
| `search_firecrawl` | Free tier | Fresh | Search + ability to scrape full pages | `FIRECRAWL_API_KEY` | When you'll likely want to follow up by READING a specific page in full (Firecrawl can do search then scrape). |
| `search_duckduckgo` | Free, unlimited | Fresh | Snippets only | NONE | Fallback when other backends are unavailable, or when the user explicitly asks for DuckDuckGo. Note: shared-IP rate limits hit hard; expect occasional CAPTCHAs. |

## Default order of preference

1. **`search_serper`** for any general factual lookup.
2. **`search_tavily`** if you need richer snippets (you're going to summarize across multiple results).
3. **`search_firecrawl`** if your next step will be to scrape a specific page.
4. **`search_duckduckgo`** as the fallback that needs no key.

If a backend returns `{ ok: false, code: "missing_key" }` or `{ ok: false, code: "rate_limited" }`, fall back to the next preferred backend. Do NOT report the failure to the user as if it were the answer; transparently retry with the next option.

# How to use: query craft

A good search query is short, specific, and uses the same terms a human would type. Bad queries waste credits and return low-quality snippets.

- DO: `"react testing library 2026 best practices"`, `"openai gpt-5 release date"`, `"qwen3 awq quantization speed benchmark"`
- DON'T: `"can you tell me about the recent best practices for unit testing in react"`, `"please find me information about the latest release date of gpt-5"`

Strip filler words. Pin years on time-sensitive queries. Use exact product names.

If the user's question is ambiguous (e.g. "find a good camera"), ask one clarifying question before searching: `"For what use? Travel / studio / wildlife / phone replacement?"`. The clarification halves the result count and quadruples the relevance.

# Output shape

Each backend returns a normalized result envelope:

```json
{
  "ok": true,
  "results": [
    { "title": "...", "url": "...", "snippet": "...", "publishedAt": "2026-..." }
  ]
}
```

On failure:

```json
{ "ok": false, "code": "missing_key" | "rate_limited" | "network_error", "reason": "..." }
```

When you narrate results to the user:

- Quote the source domain inline (e.g. "per nytimes.com,..."). Do NOT paste raw URLs unless the user asks.
- Combine 2-3 sources for any non-trivial claim. A single source is a hint; two agreeing sources is the answer.
- If sources disagree, flag the disagreement explicitly. Do NOT silently pick one.
- If the freshest source is older than the question requires (e.g. user asked "today" but best result is from last week), say so.

# Anti-patterns

- Do NOT call a backend when the answer is in the registered state. Read the state first.
- Do NOT call multiple backends in parallel "just in case". One backend per question.
- Do NOT stuff every word of the user's prose into the search query. Distill to keywords.
- Do NOT report `{ ok: false }` envelopes to the user verbatim. Fall back, then narrate the actual answer.
- Do NOT recommend a product based on a single search snippet without acknowledging the source and freshness.
