/**
 * Serper backend.
 *
 * Requires `SERPER_API_KEY` in env. Free tier: 2500 queries on signup at
 * <https://serper.dev>. Serper is a thin wrapper over Google search
 * results, so quality is essentially Google's, without the Cloud-console
 * setup that direct Google CSE requires.
 *
 * Endpoint reference:
 *   POST https://google.serper.dev/search
 *   Headers: X-API-KEY: <SERPER_API_KEY>, Content-Type: application/json
 *   Body: { q: <query>, num: <count> }
 *
 * Response shape (only the fields we use):
 *   {
 *     organic: [ { title, link, snippet }, ... ],
 *     ...other blocks we ignore
 *   }
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://google.serper.dev/search";

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
}

export function createSerperBackend(options: { apiKey: string }): SearchBackend {
  if (!options.apiKey) {
    throw new Error("serper: apiKey is required");
  }
  const apiKey = options.apiKey;
  return {
    id: "serper",
    async search(query, opts) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          q: query,
          num: Math.min(20, Math.max(1, opts.limit)),
        }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`serper: invalid API key (HTTP ${res.status})`);
      }
      if (res.status === 429) throw new Error("serper: rate-limited (HTTP 429)");
      if (!res.ok) throw new Error(`serper: HTTP ${res.status}`);
      const json = (await res.json()) as SerperResponse;
      const items = json.organic ?? [];
      return items
        .filter((r) => r.title && r.link)
        .slice(0, opts.limit)
        .map(
          (r): SearchResult => ({
            title: (r.title ?? "").trim(),
            url: (r.link ?? "").trim(),
            snippet: (r.snippet ?? "").replace(/\s+/g, " ").trim(),
            source: "serper",
          }),
        );
    },
  };
}
