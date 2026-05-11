/**
 * Brave Search backend.
 *
 * Requires `BRAVE_API_KEY` in env. Free tier: ~2000 queries / month at
 * <https://brave.com/search/api/>. Brave's API is JSON, well-documented,
 * and the most reliable of the keyed options.
 *
 * Endpoint reference:
 *   GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<n>
 *   Header: X-Subscription-Token: <BRAVE_API_KEY>
 *   Header: Accept: application/json
 *
 * Response shape (only the fields we use):
 *   {
 *     web: {
 *       results: [
 *         { title, url, description, ...meta }
 *       ]
 *     }
 *   }
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

export function createBraveBackend(options: { apiKey: string }): SearchBackend {
  if (!options.apiKey) {
    throw new Error("brave: apiKey is required");
  }
  const apiKey = options.apiKey;
  return {
    id: "brave",
    async search(query, opts) {
      const params = new URLSearchParams({
        q: query,
        count: String(Math.min(20, Math.max(1, opts.limit))),
      });
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      });
      if (res.status === 401) throw new Error("brave: invalid API key (HTTP 401)");
      if (res.status === 429) throw new Error("brave: rate-limited (HTTP 429)");
      if (!res.ok) throw new Error(`brave: HTTP ${res.status}`);
      const json = (await res.json()) as BraveResponse;
      const items = json.web?.results ?? [];
      return items
        .filter((r) => r.title && r.url)
        .slice(0, opts.limit)
        .map(
          (r): SearchResult => ({
            title: (r.title ?? "").trim(),
            url: (r.url ?? "").trim(),
            snippet: (r.description ?? "").replace(/<[^>]+>/g, "").trim(),
            source: "brave",
          }),
        );
    },
  };
}
