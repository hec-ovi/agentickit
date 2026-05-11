/**
 * Google CSE backend tests. Hermetic fetch-stubbed + env-gated live.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleBackend } from "./google.js";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("createGoogleBackend (hermetic)", () => {
  it("rejects construction without apiKey or cseId", () => {
    expect(() => createGoogleBackend({ apiKey: "", cseId: "x" })).toThrow(/apiKey is required/i);
    expect(() => createGoogleBackend({ apiKey: "y", cseId: "" })).toThrow(/cseId is required/i);
  });

  it("sends the right URL (key + cx + q + num)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const backend = createGoogleBackend({ apiKey: "abc", cseId: "cse-1" });
    await backend.search("hello world", { limit: 4 });

    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("https://www.googleapis.com/customsearch/v1");
    expect(url).toContain("key=abc");
    expect(url).toContain("cx=cse-1");
    expect(url).toContain("q=hello+world");
    expect(url).toContain("num=4");
  });

  it("caps `num` at 10 (Google CSE's max)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const backend = createGoogleBackend({ apiKey: "k", cseId: "c" });
    await backend.search("x", { limit: 999 });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("num=10");
  });

  it("parses the `items` array into canonical results", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              title: "Lisbon - Wikipedia",
              link: "https://en.wikipedia.org/wiki/Lisbon",
              snippet: "Lisbon\nis the capital\nof Portugal.",
            },
            { title: "Visit Lisboa", link: "https://www.visitlisboa.com/" },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const backend = createGoogleBackend({ apiKey: "k", cseId: "c" });
    const results = await backend.search("x", { limit: 5 });
    expect(results).toHaveLength(2);
    // Snippet whitespace collapsed.
    expect(results[0]!.snippet).toBe("Lisbon is the capital of Portugal.");
    expect(results[0]!.source).toBe("google");
  });

  it("maps 403 to a quota/key error", async () => {
    globalThis.fetch = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const backend = createGoogleBackend({ apiKey: "k", cseId: "c" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/forbidden|403/i);
  });

  it("surfaces upstream JSON error messages", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: 400, message: "Invalid Value" } }),
        { status: 400 },
      )) as unknown as typeof fetch;
    const backend = createGoogleBackend({ apiKey: "k", cseId: "c" });
    await expect(backend.search("x", { limit: 1 })).rejects.toThrow(/invalid value/i);
  });
});

describe.skipIf(!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID)(
  "createGoogleBackend live",
  () => {
    it(
      "returns real, well-formed results against the live Google CSE API",
      async () => {
        const backend = createGoogleBackend({
          apiKey: process.env.GOOGLE_API_KEY ?? "",
          cseId: process.env.GOOGLE_CSE_ID ?? "",
        });
        const results = await backend.search("lisbon portugal capital", { limit: 3 });
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
          expect(r.title.length).toBeGreaterThan(0);
          expect(r.url).toMatch(/^https?:\/\//);
          expect(r.source).toBe("google");
        }
      },
      30_000,
    );
  },
);
