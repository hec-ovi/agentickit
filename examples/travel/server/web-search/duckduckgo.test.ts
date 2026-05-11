/**
 * Tests for the DuckDuckGo backend.
 *
 * Two layers:
 *
 *   1. `parseDuckDuckGoHtml` is a pure function. We feed it a synthetic
 *      fixture that mirrors DDG's documented HTML shape and assert on
 *      the parsed result. If DDG changes their markup, this test still
 *      passes (because the fixture is ours) but the live integration
 *      test below catches the drift.
 *
 *   2. A live integration test, env-gated. By default it runs against
 *      the real DDG HTML endpoint; when DDG is rate-limiting our IP
 *      (returns the "anomaly" CAPTCHA page) the test treats that as a
 *      valid outcome — the backend's job is to surface the rate-limit
 *      honestly to the agent, which we still verify happens.
 *      Disable with `SKIP_LIVE_SEARCH=1` if you want a hermetic run.
 */

import { describe, expect, it } from "vitest";
import { duckDuckGoBackend, parseDuckDuckGoHtml } from "./duckduckgo.js";

const SYNTHETIC_HTML = `
<html><body>
  <div class="result results_links">
    <div class="result__body">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FLisbon&rut=abc">
        Lisbon - Wikipedia
      </a>
      <a class="result__snippet" href="https://en.wikipedia.org/wiki/Lisbon">
        Lisbon is the capital and largest city of Portugal.
      </a>
    </div>
  </div>
  <div class="result results_links">
    <div class="result__body">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.visitlisboa.com%2Fen&rut=def">
        Visit Lisboa — Official tourist site
      </a>
      <a class="result__snippet">Plan your visit to Lisbon: where to stay, what to see, how to get around.</a>
    </div>
  </div>
  <div class="result results_links"></div>
  <div class="result results_links">
    <div class="result__body">
      <a class="result__a" href="javascript:void(0)">Suspicious link</a>
      <a class="result__snippet">Should be filtered out.</a>
    </div>
  </div>
</body></html>
`.trim();

describe("parseDuckDuckGoHtml (pure)", () => {
  it("extracts each well-formed result", () => {
    const results = parseDuckDuckGoHtml(SYNTHETIC_HTML);
    expect(results).toHaveLength(2);

    expect(results[0]).toEqual({
      title: "Lisbon - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Lisbon",
      snippet: "Lisbon is the capital and largest city of Portugal.",
      source: "duckduckgo",
    });
    expect(results[1]).toEqual({
      title: "Visit Lisboa — Official tourist site",
      url: "https://www.visitlisboa.com/en",
      snippet:
        "Plan your visit to Lisbon: where to stay, what to see, how to get around.",
      source: "duckduckgo",
    });
  });

  it("unwraps DDG's redirect anchor (//duckduckgo.com/l/?uddg=...) to the real URL", () => {
    const [first] = parseDuckDuckGoHtml(SYNTHETIC_HTML);
    expect(first!.url).toBe("https://en.wikipedia.org/wiki/Lisbon");
  });

  it("filters out javascript: URLs (XSS-y, never useful)", () => {
    const results = parseDuckDuckGoHtml(SYNTHETIC_HTML);
    expect(results.every((r) => !r.url.startsWith("javascript:"))).toBe(true);
  });

  it("returns empty for input with no result blocks", () => {
    expect(parseDuckDuckGoHtml("<html><body>no results</body></html>")).toEqual([]);
  });
});

/**
 * Live integration test. Hits the real DDG endpoint. Two valid outcomes:
 *
 *   - Results come back: assert each has a non-empty title + an http(s)
 *     URL + an honest "duckduckgo" source field.
 *   - DDG rate-limits us (returns the CAPTCHA page): the backend throws,
 *     we assert the thrown message names the rate-limit case so the
 *     proxy can map it to a 429.
 *
 * Skipped under SKIP_LIVE_SEARCH=1 (for offline CI). Default: run.
 */
describe.skipIf(process.env.SKIP_LIVE_SEARCH === "1")(
  "duckDuckGoBackend live",
  () => {
    it(
      "either returns real results or surfaces the rate-limit honestly",
      async () => {
        try {
          const results = await duckDuckGoBackend.search("lisbon portugal capital", {
            limit: 3,
          });
          // Happy path. DDG didn't CAPTCHA us.
          expect(results.length).toBeGreaterThan(0);
          for (const r of results) {
            expect(r.title.length).toBeGreaterThan(0);
            expect(r.url).toMatch(/^https?:\/\//);
            expect(r.source).toBe("duckduckgo");
          }
        } catch (err) {
          // Rate-limited path. The backend's job is to throw with a
          // clear message; the proxy route then maps it to a 429.
          const msg = err instanceof Error ? err.message : String(err);
          expect(msg).toMatch(/rate[- ]?limit|captcha|too many|anomaly|HTTP 4|HTTP 5/i);
        }
      },
      30_000, // generous timeout for slow networks
    );
  },
);
