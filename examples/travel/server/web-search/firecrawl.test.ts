/**
 * Firecrawl backend tests. Hermetic fetch-stubbed + env-gated live.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirecrawlBackend } from "./firecrawl.js";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("createFirecrawlBackend (hermetic)", () => {
  it("rejects construction without an apiKey", () => {
    expect(() => createFirecrawlBackend({ apiKey: "" })).toThrow(/apiKey is required/i);
  });

  it("POSTs with Bearer auth + query + limit", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const backend = createFirecrawlBackend({ apiKey: "fc-test" });
    await backend.search("lisbon", { limit: 6 });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.firecrawl.dev/v1/search");
    expect(init.method).toBe("POST");
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fc-test");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.query).toBe("lisbon");
    expect(body.limit).toBe(6);
  });

  it("parses the `data` array into canonical results", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              title: "Lisbon",
              url: "https://en.wikipedia.org/wiki/Lisbon",
              description: "Capital of Portugal.",
            },
            { title: "Visit Lisboa", url: "https://www.visitlisboa.com/" },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createFirecrawlBackend({ apiKey: "k" });
    const results = await backend.search("x", { limit: 5 });
    expect(results).toHaveLength(2);
    expect(results[0]!.source).toBe("firecrawl");
  });

  it("surfaces `success: false` upstream errors", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ success: false, error: "quota exhausted" }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createFirecrawlBackend({ apiKey: "k" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/quota exhausted/i);
  });

  it("maps 401 to 'invalid API key'", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const backend = createFirecrawlBackend({ apiKey: "bad" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid API key.*401/i);
  });
});

describe.skipIf(!process.env.FIRECRAWL_API_KEY)("createFirecrawlBackend live", () => {
  it(
    "returns real, well-formed results against the live Firecrawl API",
    async () => {
      const backend = createFirecrawlBackend({ apiKey: process.env.FIRECRAWL_API_KEY ?? "" });
      const results = await backend.search("lisbon portugal capital", { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.source).toBe("firecrawl");
      }
    },
    30_000,
  );
});
