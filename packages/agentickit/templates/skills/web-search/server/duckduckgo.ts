/**
 * DuckDuckGo web-search backend.
 *
 * No API key required. Uses the `html.duckduckgo.com/html/` endpoint which
 * returns server-rendered HTML; we parse the result list with two narrow
 * regexes. Honest caveats:
 *
 *   - DuckDuckGo doesn't publish a stable search API. The HTML structure
 *     can (and occasionally does) change. If parsing returns zero hits
 *     after they ship a redesign, that's the parser breaking, not the
 *     backend being down.
 *   - Heavy use can trigger their CAPTCHA / rate-limit page (recognisable
 *     by the absence of the result anchors). We surface that as a
 *     `rate_limited` error rather than returning empty results so the
 *     agent can react.
 *   - The User-Agent matters: with a bare default UA they often return
 *     the CAPTCHA page. We send a realistic browser UA to reduce that.
 *
 * If reliability matters more than zero-key setup, use the Brave or
 * Tavily backends instead.
 */

import type { SearchBackend, SearchResult } from "./types.js";

const ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const duckDuckGoBackend: SearchBackend = {
  id: "duckduckgo",
  async search(query, opts) {
    const body = new URLSearchParams({ q: query, kl: "wt-wt" }).toString();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`duckduckgo: HTTP ${res.status}`);
    }
    const html = await res.text();
    const results = parseDuckDuckGoHtml(html);
    if (results.length === 0 && /anomaly|captcha|too many/i.test(html)) {
      // DuckDuckGo has rate-limited us. Surface explicitly so the agent
      // doesn't quietly think there are no results for the query.
      throw new Error("duckduckgo: rate-limited (CAPTCHA page returned)");
    }
    return results.slice(0, opts.limit);
  },
};

/**
 * Pure HTML-to-results parser. Exported separately so unit tests can
 * exercise it against captured fixtures without making network calls.
 *
 * The DDG HTML endpoint emits one `<div class="result results_links">`
 * block per hit. Inside, the title sits in `<a class="result__a" ...>`
 * and the snippet in `<a class="result__snippet">`. URLs are wrapped in
 * the DDG redirect (`//duckduckgo.com/l/?uddg=<encoded>`), which we
 * unwrap so the model gets the real destination.
 */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // Per-result block. The "result__body" container wraps both the title
  // anchor and the snippet anchor; we use non-greedy matching so each
  // iteration captures one block.
  const blockRe = /<div\s+class="result\s+results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;

  for (const blockMatch of html.matchAll(blockRe)) {
    const block = blockMatch[1] ?? "";

    const titleMatch = block.match(
      /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!titleMatch) continue;

    const snippetMatch = block.match(
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
    );

    const rawUrl = titleMatch[1] ?? "";
    const url = unwrapDdgRedirect(rawUrl);
    const title = stripTags(titleMatch[2] ?? "").trim();
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "").trim() : "";

    if (!title || !url || url.startsWith("javascript:")) continue;

    results.push({ title, url, snippet, source: "duckduckgo" });
  }
  return results;
}

/**
 * DuckDuckGo wraps every external link in `//duckduckgo.com/l/?uddg=...`
 * (URL-encoded destination). We unwrap to the real URL so the model
 * doesn't surface a meaningless redirect URL to the user. Falls back to
 * the raw input if the pattern doesn't match.
 */
function unwrapDdgRedirect(href: string): string {
  if (!href) return href;
  if (href.startsWith("//")) {
    try {
      const parsed = new URL(`https:${href}`);
      const target = parsed.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    } catch {
      // fall through
    }
  }
  return href;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
