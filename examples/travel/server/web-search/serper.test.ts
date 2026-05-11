/**
 * Serper backend tests. Hermetic fetch-stubbed + env-gated live.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSerperBackend } from "./serper.js";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("createSerperBackend (hermetic)", () => {
  it("rejects construction without an apiKey", () => {
    expect(() => createSerperBackend({ apiKey: "" })).toThrow(/apiKey is required/i);
  });

  it("POSTs the right body shape (X-API-KEY header, q + num in JSON body)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ organic: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const backend = createSerperBackend({ apiKey: "test-key" });
    await backend.search("lisbon weather", { limit: 4 });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://google.serper.dev/search");
    expect(init.method).toBe("POST");
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("test-key");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.q).toBe("lisbon weather");
    expect(body.num).toBe(4);
  });

  it("caps num at 20", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ organic: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const backend = createSerperBackend({ apiKey: "k" });
    await backend.search("x", { limit: 999 });
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.num).toBe(20);
  });

  it("parses the `organic` array into canonical results", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          organic: [
            {
              title: "Lisbon - Wikipedia",
              link: "https://en.wikipedia.org/wiki/Lisbon",
              snippet: "Lisbon  is\nthe\ncapital  of Portugal.",
            },
            { title: "Visit Lisboa", link: "https://www.visitlisboa.com/" },
            { title: "", link: "https://nope" }, // filtered
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createSerperBackend({ apiKey: "k" });
    const results = await backend.search("x", { limit: 5 });
    expect(results).toHaveLength(2);
    // Whitespace in the snippet collapsed.
    expect(results[0]!.snippet).toBe("Lisbon is the capital of Portugal.");
    expect(results[0]!.source).toBe("serper");
  });

  it("maps 401/403 to 'invalid API key'", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const backend = createSerperBackend({ apiKey: "bad" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid API key.*401/i);

    globalThis.fetch = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid API key.*403/i);
  });

  it("maps 429 to 'rate-limited'", async () => {
    globalThis.fetch = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const backend = createSerperBackend({ apiKey: "k" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/rate-limited.*429/i);
  });
});

describe.skipIf(!process.env.SERPER_API_KEY)("createSerperBackend live", () => {
  it(
    "returns real, well-formed results against the live Serper API",
    async () => {
      const backend = createSerperBackend({ apiKey: process.env.SERPER_API_KEY ?? "" });
      const results = await backend.search("lisbon portugal capital", { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.source).toBe("serper");
      }
    },
    30_000,
  );
});
