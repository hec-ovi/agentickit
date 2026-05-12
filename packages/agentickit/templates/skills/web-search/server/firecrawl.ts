/**
 * Firecrawl backend.
 *
 * Requires `FIRECRAWL_API_KEY` in env. Free tier available at
 * <https://firecrawl.dev>. Firecrawl returns search results AND can
 * scrape each hit's full page content as markdown. We use the search
 * endpoint (no scraping per result) for parity with the other backends;
 * the agent can call a follow-up tool to scrape one specific URL if it
 * needs more detail.
 *
 * Endpoint reference:
 *   POST https://api.firecrawl.dev/v1/search
 *   Header: Authorization: Bearer <FIRECRAWL_API_KEY>
 *   Body: { query, limit }
 *
 * Response shape (only the fields we use):
 *   {
 *     success: true,
 *     data: [ { title, url, description, ... } ]
 *   }
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://api.firecrawl.dev/v1/search";

interface FirecrawlResponse {
  success?: boolean;
  data?: Array<{
    title?: string;
    url?: string;
    description?: string;
  }>;
  error?: string;
}

export function createFirecrawlBackend(options: { apiKey: string }): SearchBackend {
  if (!options.apiKey) {
    throw new Error("firecrawl: apiKey is required");
  }
  const apiKey = options.apiKey;
  return {
    id: "firecrawl",
    async search(query, opts) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          limit: Math.min(20, Math.max(1, opts.limit)),
        }),
      });
      if (res.status === 401) throw new Error("firecrawl: invalid API key (HTTP 401)");
      if (res.status === 429) throw new Error("firecrawl: rate-limited (HTTP 429)");
      if (!res.ok) throw new Error(`firecrawl: HTTP ${res.status}`);
      const json = (await res.json()) as FirecrawlResponse;
      if (json.success === false) throw new Error(`firecrawl: ${json.error ?? "unknown error"}`);
      const items = json.data ?? [];
      return items
        .filter((r) => r.title && r.url)
        .slice(0, opts.limit)
        .map(
          (r): SearchResult => ({
            title: (r.title ?? "").trim(),
            url: (r.url ?? "").trim(),
            snippet: (r.description ?? "").trim(),
            source: "firecrawl",
          }),
        );
    },
  };
}
