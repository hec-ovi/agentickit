/**
 * Google Custom Search Engine (CSE) backend.
 *
 * Requires TWO env vars:
 *   GOOGLE_API_KEY  — a Google Cloud API key with "Custom Search API" enabled
 *   GOOGLE_CSE_ID   — the "cx" id of a Programmable Search Engine
 *
 * Free tier: 100 queries / day. Setup:
 *   1. Cloud console → enable "Custom Search API"
 *   2. APIs & Services → Credentials → create API key
 *   3. <https://programmablesearchengine.google.com> → create a search
 *      engine, set "Search the entire web" on, copy the "Search engine ID"
 *
 * Endpoint reference:
 *   GET https://www.googleapis.com/customsearch/v1?key=<key>&cx=<id>&q=<query>&num=<n>
 *
 * Response shape (only the fields we use):
 *   {
 *     items: [ { title, link, snippet } ]
 *   }
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://www.googleapis.com/customsearch/v1";

interface GoogleResponse {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: { message?: string; code?: number };
}

export function createGoogleBackend(options: { apiKey: string; cseId: string }): SearchBackend {
  if (!options.apiKey) throw new Error("google: apiKey is required");
  if (!options.cseId) throw new Error("google: cseId is required");
  const apiKey = options.apiKey;
  const cseId = options.cseId;
  return {
    id: "google",
    async search(query, opts) {
      const params = new URLSearchParams({
        key: apiKey,
        cx: cseId,
        q: query,
        // Google CSE caps `num` at 10. If the caller asked for more,
        // they get 10 (one query, no pagination).
        num: String(Math.min(10, Math.max(1, opts.limit))),
      });
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 403) throw new Error("google: forbidden (HTTP 403, key or quota issue)");
      if (res.status === 429) throw new Error("google: rate-limited (HTTP 429)");
      if (!res.ok) {
        // Try to surface the upstream error message; falls back to status.
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as GoogleResponse;
          if (body.error?.message) detail = body.error.message;
        } catch {
          // ignore JSON parse failures
        }
        throw new Error(`google: ${detail}`);
      }
      const json = (await res.json()) as GoogleResponse;
      const items = json.items ?? [];
      return items
        .filter((r) => r.title && r.link)
        .slice(0, opts.limit)
        .map(
          (r): SearchResult => ({
            title: (r.title ?? "").trim(),
            url: (r.link ?? "").trim(),
            snippet: (r.snippet ?? "").replace(/\s+/g, " ").trim(),
            source: "google",
          }),
        );
    },
  };
}
