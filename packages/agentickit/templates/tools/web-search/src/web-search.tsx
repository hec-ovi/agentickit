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

import type { ReactNode } from "react";
import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";

/**
 * Minimal local definition of the plugin shape, so this file works
 * without depending on a project-level `src/plugins/index.tsx`. If your
 * project already exports a `PilotPlugin` type, replace this with an
 * import.
 */
interface PilotPlugin {
  id: string;
  description?: string;
  component: () => ReactNode;
}

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
  /** Backend id ("duckduckgo", "tavily", "firecrawl", "serper"). */
  backend: string;
  /** Display name shown to the model in the tool description. */
  label: string;
  /**
   * Per-backend guidance that goes INTO the tool description the model
   * sees. Should explain "use THIS backend when..." so the model picks
   * the right one in the mixed-deployment case.
   */
  pickWhen: string;
}

/**
 * Shared base description used by every search tool. Captures the
 * decision rules that should govern ANY web-search call. Per-backend
 * `pickWhen` text is appended so the model also knows which one to
 * prefer when several are mounted.
 *
 * Phrased in agent-facing voice (second person to the model) and lists
 * concrete WHEN / WHEN-NOT / QUERY rules so the agent doesn't have to
 * reason from scratch every turn.
 */
const BASE_DESCRIPTION = `
Search the open web and return ranked results (title, URL, snippet).

WHEN TO USE
- The user asks about something that depends on real-world, current
  data the local app cannot answer: news, prices, opening hours,
  reviews, events, places NOT in this app's destinations catalog.
- You need to verify a fact you are unsure about, or quote a source.

WHEN NOT TO USE
- The answer is already in another registered tool — do not search the
  web for a destination's official activities (use describe_destination),
  a weather forecast (use get_weather), a currency conversion
  (use convert_currency), today's date (use get_current_date), or
  arithmetic on dates (use compute_relative_date).
- The user is making conversation or asking your opinion. Answer
  directly; don't burn a search quota on small talk.

QUERY CRAFT
- Be specific. "Lisbon best pastel de nata 2026" beats "Lisbon food".
- Include the year (or "current", "today") for time-sensitive queries.
- Spell place names how locals do ("Reykjavik", not "Reykjaviki").
- Use the destination name, not a pronoun, so the search sees context.

OUTPUT
- Each result has a title (page title), url (absolute link, suitable
  for citation), snippet (short summary; verify before quoting).
- If results look stale or irrelevant, retry with a sharper query
  before giving up. Don't fabricate results that weren't returned.
- If the call returns { ok: false }, the backend failed. Read the
  \`reason\` field and either retry on a different search_* backend
  (if mounted) or tell the user the lookup failed.
`.trim();

function makeWebSearchPlugin(config: WebSearchPluginConfig): PilotPlugin {
  const { backend, label, pickWhen } = config;
  const toolName = `search_${backend}`;
  const description = `${BASE_DESCRIPTION}\n\nBACKEND: ${label}.\nPICK THIS WHEN: ${pickWhen}`;

  function Component() {
    usePilotAction({
      name: toolName,
      description,
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Plain-English search query. Include year + place name; avoid pronouns.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .optional()
          .describe(
            "Max results to return (default 5). Use 3 for fact-checks, 8-10 for research.",
          ),
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

/**
 * DuckDuckGo: no API key, privacy-friendly, but can rate-limit on
 * shared IPs. Use as fallback when keyed backends are unavailable, or
 * when the user explicitly prefers a privacy-oriented option.
 */
export const duckDuckGoPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "duckduckgo",
  label: "DuckDuckGo",
  pickWhen:
    "no other search backend is mounted, or you want privacy-friendly results. " +
    "Note: shared IPs can hit CAPTCHA; if the call returns { ok: false } with a " +
    "rate-limit reason, retry on another backend.",
});

/**
 * Tavily: AI-tuned. Snippets are longer (~320 chars) and more
 * content-rich than typical SERP descriptions, so synthesizing across
 * multiple results requires fewer follow-up fetches.
 */
export const tavilyPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "tavily",
  label: "Tavily (AI-tuned, content-rich)",
  pickWhen:
    "the user wants a research-style answer that synthesizes multiple sources " +
    "(comparisons, recommendations, 'best X for Y'). Tavily snippets contain " +
    "enough context to answer directly without scraping each page.",
});

/**
 * Firecrawl: search + scrape stack. The search endpoint returns
 * lighter metadata; Firecrawl shines if you also wire its scrape tool
 * so the agent can fetch full markdown of a specific result.
 */
export const firecrawlPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "firecrawl",
  label: "Firecrawl (search + scrape)",
  pickWhen:
    "you'll likely follow up with a deeper fetch on a specific URL (official " +
    "tourism site, restaurant detail page, etc.). Returns metadata; the agent " +
    "can then ask a scrape tool to extract the full page content.",
});

/**
 * Serper: a wrapper over Google's search index. Fastest reliable
 * option for general-purpose queries. The default to reach for when
 * you have it.
 */
export const serperPlugin: PilotPlugin = makeWebSearchPlugin({
  backend: "serper",
  label: "Serper (Google index, fast)",
  pickWhen:
    "you need Google-quality results fast: fact-checking, news, recency, " +
    "anything where Google's ranking helps. This is the default to reach for " +
    "when multiple search backends are mounted.",
});
