/**
 * Client-side web-search plugins.
 *
 * Each function returns a `PilotPlugin` that registers ONE tool wired to
 * the server's `/api/search` proxy with a fixed `backend` id. The model
 * sees them as distinct tools (`search_duckduckgo`, `search_brave`,
 * etc.) so it can pick consciously: "DuckDuckGo for general queries",
 * "Tavily for AI-friendly content snippets", etc.
 *
 * If you want only one to be available, mount only one. The agent only
 * knows about tools that are mounted.
 *
 * For API-key setup see each backend's docstring on the server side
 * (`server/web-search/<name>.ts`).
 */

import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import type { PilotPlugin } from "./index";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  backend: string;
}

interface SearchError {
  error: string;
  reason: string;
}

/** Fetch the proxy. Returns either the response body or a typed error. */
async function callSearchProxy(
  backend: string,
  query: string,
  limit: number,
): Promise<SearchResponse | SearchError> {
  const params = new URLSearchParams({ backend, q: query, limit: String(limit) });
  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    const body = (await res.json()) as SearchResponse | SearchError;
    if (!res.ok) return body as SearchError;
    return body;
  } catch (err) {
    return {
      error: "upstream_failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

interface WebSearchPluginConfig {
  /** Backend id ("duckduckgo", "brave", "tavily", "firecrawl", "google"). */
  backend: string;
  /** Display name shown to the model in the tool description. */
  label: string;
  /** Optional flavor text appended to the tool description. */
  hint?: string;
}

function makeWebSearchPlugin(config: WebSearchPluginConfig): PilotPlugin {
  const { backend, label, hint } = config;
  const toolName = `search_${backend}`;

  function Component() {
    usePilotAction({
      name: toolName,
      description:
        `Search the web via ${label} and return up to N results (title, URL, snippet). ` +
        `Use this when the user asks something the local trip catalog can't answer ` +
        `(news, recent events, things outside the five seeded cities).${hint ? ` ${hint}` : ""}`,
      parameters: z.object({
        query: z.string().min(1).max(200).describe("Search query, plain English."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .optional()
          .describe("Max results to return. Defaults to 5."),
      }),
      handler: async ({ query, limit }) => {
        const result = await callSearchProxy(backend, query, limit ?? 5);
        if ("error" in result) {
          return { ok: false, reason: result.reason, code: result.error };
        }
        return {
          ok: true,
          backend: result.backend,
          query: result.query,
          results: result.results,
        };
      },
    });
    return null;
  }

  return {
    id: `web-search-${backend}`,
    description: `Web search via ${label}.`,
    component: Component,
  };
}

/** DuckDuckGo. No API key required. Best-effort HTML scrape; can be rate-limited. */
export const duckDuckGoPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "duckduckgo",
  label: "DuckDuckGo",
  hint: "No API key needed. May rate-limit under heavy use.",
});

/** Brave Search. Requires BRAVE_API_KEY. Reliable, 2000/month free. */
export const bravePlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "brave",
  label: "Brave Search",
  hint: "Reliable general-purpose results.",
});

/** Tavily. Requires TAVILY_API_KEY. Tuned for LLM ingestion (longer snippets). */
export const tavilyPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "tavily",
  label: "Tavily",
  hint: "AI-friendly: longer, more informative snippets per hit.",
});

/** Firecrawl. Requires FIRECRAWL_API_KEY. Search + scrape; here used in search mode. */
export const firecrawlPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "firecrawl",
  label: "Firecrawl",
  hint: "Returns search results; the agent can follow up to scrape one URL in detail.",
});

/** Google Custom Search Engine. Requires GOOGLE_API_KEY + GOOGLE_CSE_ID. 100/day free. */
export const googleSearchPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "google",
  label: "Google",
  hint: "Custom Search Engine. Free tier caps at 100 queries/day.",
});
