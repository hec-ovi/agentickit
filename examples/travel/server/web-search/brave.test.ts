/**
 * Brave Search backend tests.
 *
 *   - Hermetic unit tests stub `globalThis.fetch` and assert on (a) the
 *     outgoing request shape (URL, X-Subscription-Token header) and
 *     (b) the parsed result shape from a captured-style JSON response.
 *   - Live integration test runs only when `BRAVE_API_KEY` is in env.
 *     Hits the real Brave API and asserts the response is at least
 *     well-formed (non-empty results, https URLs).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBraveBackend } from "./brave.js";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("createBraveBackend (hermetic)", () => {
  it("rejects construction without an apiKey", () => {
    expect(() => createBraveBackend({ apiKey: "" })).toThrow(/apiKey is required/i);
  });

  it("sends the correct request (URL + X-Subscription-Token header)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const backend = createBraveBackend({ apiKey: "test-key" });
    await backend.search("portugal weather", { limit: 7 });

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.search.brave.com/res/v1/web/search");
    expect(url).toContain("q=portugal+weather");
    expect(url).toContain("count=7");
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Subscription-Token"]).toBe("test-key");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("parses results into the canonical shape", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Lisbon — Wikipedia",
                url: "https://en.wikipedia.org/wiki/Lisbon",
                description: "Lisbon is the capital of <b>Portugal</b>.",
              },
              { title: "Visit Lisboa", url: "https://www.visitlisboa.com/", description: "" },
              // No title → filtered out.
              { title: "", url: "https://bad" },
            ],
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const backend = createBraveBackend({ apiKey: "k" });
    const results = await backend.search("lisbon", { limit: 5 });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Lisbon — Wikipedia",
      url: "https://en.wikipedia.org/wiki/Lisbon",
      // <b>...</b> stripped.
      snippet: "Lisbon is the capital of Portugal.",
      source: "brave",
    });
    expect(results[1]!.snippet).toBe("");
  });

  it("maps 401 to a clear 'invalid API key' error", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const backend = createBraveBackend({ apiKey: "bad" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid API key.*401/i);
  });

  it("maps 429 to a 'rate-limited' error", async () => {
    globalThis.fetch = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const backend = createBraveBackend({ apiKey: "k" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/rate-limited.*429/i);
  });

  it("caps limit at 20 (Brave's max)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const backend = createBraveBackend({ apiKey: "k" });
    await backend.search("x", { limit: 999 });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("count=20");
  });
});

describe.skipIf(!process.env.BRAVE_API_KEY)("createBraveBackend live", () => {
  beforeEach(() => {
    // Restore real fetch for the live test (the suite's afterEach already
    // restores, but if a hermetic test happens to run first in this
    // describe scope this guarantees it).
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it(
    "returns real, well-formed results against the live Brave API",
    async () => {
      const backend = createBraveBackend({ apiKey: process.env.BRAVE_API_KEY ?? "" });
      const results = await backend.search("lisbon portugal capital", { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.source).toBe("brave");
      }
    },
    30_000,
  );
});
