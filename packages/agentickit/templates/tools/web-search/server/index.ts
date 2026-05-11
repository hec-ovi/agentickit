/**
 * Web-search proxy route.
 *
 * Single `GET /api/search` endpoint that dispatches to one of the five
 * backends based on the `?backend=` query parameter. The client plugin
 * never sees the backend modules; it just hits this proxy with the id
 * of the backend it was configured for.
 *
 * Why proxy through the server (instead of letting the React plugin
 * fetch the search host directly):
 *
 *   1. Most search hosts (DuckDuckGo, Brave, Tavily, Firecrawl, Google
 *      CSE) don't set CORS headers for browser callers. A direct fetch
 *      from the React app's origin would be blocked.
 *   2. API keys must NOT ship into the client bundle. The proxy reads
 *      them from process.env on the server.
 *
 * Each backend either always works (DuckDuckGo, no key) or surfaces a
 * 503 with a clear reason when its key isn't configured. The client
 * plugin maps the 503 to a `{ ok: false, reason }` tool result so the
 * agent can respond conversationally instead of throwing.
 */

import type { Context } from "hono";
import { duckDuckGoBackend } from "./duckduckgo.js";
import { createTavilyBackend } from "./tavily.js";
import { createFirecrawlBackend } from "./firecrawl.js";
import { createSerperBackend } from "./serper.js";
import type { SearchBackend, SearchError, SearchResponse } from "./types.js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY?.trim();
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY?.trim();
const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim();

// Build the table of available backends. Each entry is either a working
// `SearchBackend` instance (when its key is configured) or `null` (so
// the route can return a clear 503 instead of crashing on a missing
// key). DuckDuckGo is always available.
const BACKENDS: Record<string, SearchBackend | null> = {
  duckduckgo: duckDuckGoBackend,
  tavily: TAVILY_API_KEY ? createTavilyBackend({ apiKey: TAVILY_API_KEY }) : null,
  firecrawl: FIRECRAWL_API_KEY ? createFirecrawlBackend({ apiKey: FIRECRAWL_API_KEY }) : null,
  serper: SERPER_API_KEY ? createSerperBackend({ apiKey: SERPER_API_KEY }) : null,
};

const MISSING_KEY_REASON: Record<string, string> = {
  tavily: "Set TAVILY_API_KEY in .env.local. Free tier at https://tavily.com",
  firecrawl: "Set FIRECRAWL_API_KEY in .env.local. Free tier at https://firecrawl.dev",
  serper: "Set SERPER_API_KEY in .env.local. 2500 free queries on signup at https://serper.dev",
};

export async function webSearchRoute(c: Context): Promise<Response> {
  const query = (c.req.query("q") ?? "").trim();
  const backendId = (c.req.query("backend") ?? "duckduckgo").trim().toLowerCase();
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "5", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(20, Math.max(1, limitRaw)) : 5;

  if (!query) {
    return c.json<SearchError>(
      { error: "upstream_failed", reason: "missing 'q' query parameter" },
      400,
    );
  }

  if (!(backendId in BACKENDS)) {
    return c.json<SearchError>(
      {
        error: "backend_unavailable",
        reason: `unknown backend "${backendId}". Available: ${Object.keys(BACKENDS).join(", ")}`,
      },
      400,
    );
  }

  const backend = BACKENDS[backendId];
  if (!backend) {
    return c.json<SearchError>(
      {
        error: "missing_api_key",
        reason: MISSING_KEY_REASON[backendId] ?? `${backendId}: API key not configured.`,
      },
      503,
    );
  }

  try {
    const results = await backend.search(query, { limit });
    const body: SearchResponse = { query, results, backend: backendId };
    return c.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Heuristic: 429-ish messages → rate_limited, otherwise upstream_failed.
    const isRate = /rate[- ]?limit|429|captcha|too many/i.test(message);
    return c.json<SearchError>(
      { error: isRate ? "rate_limited" : "upstream_failed", reason: message },
      isRate ? 429 : 502,
    );
  }
}

/** Exposed for tests + the agents page so it can show which backends are live. */
export function listConfiguredBackends(): Array<{ id: string; configured: boolean }> {
  return Object.entries(BACKENDS).map(([id, b]) => ({ id, configured: b !== null }));
}
