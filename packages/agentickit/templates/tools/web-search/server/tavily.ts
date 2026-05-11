/**
 * Tavily Search backend.
 *
 * Requires `TAVILY_API_KEY` in env. Free tier: ~1000 queries / month at
 * <https://tavily.com>. Tavily is purpose-built for LLM agents: the
 * default "basic" depth is fast and the JSON shape is designed for
 * direct ingestion into prompts (content snippets are longer and more
 * informative than typical SERP descriptions).
 *
 * Endpoint reference:
 *   POST https://api.tavily.com/search
 *   Body: { api_key, query, max_results, search_depth: "basic" | "advanced", ... }
 *
 * Response shape (only the fields we use):
 *   {
 *     query,
 *     results: [ { title, url, content, score, ... } ]
 *   }
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://api.tavily.com/search";

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
}

export function createTavilyBackend(options: { apiKey: string }): SearchBackend {
  if (!options.apiKey) {
    throw new Error("tavily: apiKey is required");
  }
  const apiKey = options.apiKey;
  return {
    id: "tavily",
    async search(query, opts) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.min(20, Math.max(1, opts.limit)),
          search_depth: "basic",
          include_answer: false,
        }),
      });
      if (res.status === 401) throw new Error("tavily: invalid API key (HTTP 401)");
      if (res.status === 429) throw new Error("tavily: rate-limited (HTTP 429)");
      if (!res.ok) throw new Error(`tavily: HTTP ${res.status}`);
      const json = (await res.json()) as TavilyResponse;
      const items = json.results ?? [];
      return items
        .filter((r) => r.title && r.url)
        .slice(0, opts.limit)
        .map(
          (r): SearchResult => ({
            title: (r.title ?? "").trim(),
            url: (r.url ?? "").trim(),
            // Tavily returns long-form content for each hit; cap at a
            // reasonable length so a single search doesn't blow context.
            snippet: ((r.content ?? "").trim().slice(0, 320)).replace(/\s+/g, " "),
            source: "tavily",
          }),
        );
    },
  };
}
