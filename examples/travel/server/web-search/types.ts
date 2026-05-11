/**
 * Shared types for the web-search server routes and backends.
 *
 * Each backend (DuckDuckGo, Brave, Tavily, Firecrawl, Google CSE) returns
 * the same canonical shape so the client plugin doesn't need to know
 * which one is wired in. Backends live server-side because (a) CORS
 * blocks browser-side fetches against most search hosts and (b) API
 * keys must not ship into the client bundle.
 */

export interface SearchResult {
  /** Display title for the result. */
  title: string;
  /** Absolute URL. */
  url: string;
  /** Short text summary. May be empty for some backends. */
  snippet: string;
  /** Backend name that produced this result (for traceability). */
  source: string;
}

export interface SearchResponse {
  /** The query as the agent passed it (echoed back for the chat UI). */
  query: string;
  /** Up to `limit` results, in the order the backend ranked them. */
  results: SearchResult[];
  /** Backend name (matches each result's `source` field). */
  backend: string;
}

export interface SearchBackend {
  /**
   * Unique id used by the client to pick a backend. Matches the
   * `?backend=` query parameter on the proxy route.
   */
  id: string;
  /**
   * Run a search. Implementations MUST honour `limit` and SHOULD trim
   * results that look like junk (empty titles, javascript: URLs).
   */
  search(query: string, opts: { limit: number }): Promise<SearchResult[]>;
}

/**
 * Standard error shape returned by the proxy when a backend can't
 * complete the request. The client plugin maps this into a `{ ok: false,
 * reason }` tool result so the agent can respond conversationally
 * instead of throwing.
 */
export interface SearchError {
  error: "backend_unavailable" | "missing_api_key" | "rate_limited" | "upstream_failed";
  reason: string;
}
