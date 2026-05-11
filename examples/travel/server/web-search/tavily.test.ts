/**
 * Tavily backend tests. Same shape as the Brave tests: hermetic
 * fetch-stubbed unit tests + an env-gated live integration test.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTavilyBackend } from "./tavily.js";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("createTavilyBackend (hermetic)", () => {
  it("rejects construction without an apiKey", () => {
    expect(() => createTavilyBackend({ apiKey: "" })).toThrow(/apiKey is required/i);
  });

  it("POSTs the right body shape (api_key + query + max_results + search_depth)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const backend = createTavilyBackend({ apiKey: "tvly-test" });
    await backend.search("lisbon things to do", { limit: 4 });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.api_key).toBe("tvly-test");
    expect(body.query).toBe("lisbon things to do");
    expect(body.max_results).toBe(4);
    expect(body.search_depth).toBe("basic");
  });

  it("trims long Tavily content to 320 chars and collapses whitespace", async () => {
    const longContent = `${"  word  ".repeat(60)}END`; // ~480 chars with multi-spaces
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { title: "Topic", url: "https://example.com/topic", content: longContent },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createTavilyBackend({ apiKey: "k" });
    const [result] = await backend.search("x", { limit: 1 });
    expect(result!.snippet.length).toBeLessThanOrEqual(320);
    expect(result!.snippet).not.toContain("  "); // double-spaces collapsed
  });

  it("filters items missing title or url", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { title: "Good", url: "https://example.com", content: "ok" },
            { title: "", url: "https://example.com/bad" },
            { url: "https://example.com/no-title", content: "" },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createTavilyBackend({ apiKey: "k" });
    const results = await backend.search("x", { limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Good");
  });

  it("maps 401 to 'invalid API key'", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const backend = createTavilyBackend({ apiKey: "bad" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid API key.*401/i);
  });
});

describe.skipIf(!process.env.TAVILY_API_KEY)("createTavilyBackend live", () => {
  it(
    "returns real, well-formed results against the live Tavily API",
    async () => {
      const backend = createTavilyBackend({ apiKey: process.env.TAVILY_API_KEY ?? "" });
      const results = await backend.search("lisbon portugal capital", { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.source).toBe("tavily");
      }
    },
    30_000,
  );
});
