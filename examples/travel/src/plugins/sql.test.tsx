/**
 * Integration tests for the SQL plugin.
 *
 * The SQL plugin's two tools (`describe_schema` and `query_products`)
 * are driven through the framework registry, exactly as the LLM
 * runtime would. `fetch` is stubbed to hand canned responses back —
 * the underlying DB integration is already tested in
 * `server/sql/db.test.ts`, so here we focus on the client-side
 * plumbing + the structured success / failure shapes the agent sees.
 *
 * Why this matters: the system prompt instructs the agent to call
 * `describe_schema` FIRST, then `query_products`. If either tool
 * silently fails or returns the wrong shape, the agent's chain
 * collapses. Pinning the contract here protects against silent drift.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup } from "@testing-library/react";
import { renderApp } from "../test/render-app";
import type { PilotPlugin } from "./index";
import { sqlPlugin } from "./sql";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function Component({ plugins }: { plugins: ReadonlyArray<PilotPlugin> }) {
  return (
    <>
      {plugins.map((p, i) => {
        const C = p.component as () => ReactNode;
        return <C key={i} />;
      })}
    </>
  );
}

describe("SQL plugin — end-to-end through the registry", () => {
  it("describe_schema returns the table shape", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tables: [
            {
              name: "products",
              columns: [
                { name: "id", type: "INTEGER", notnull: true, primaryKey: true },
                { name: "name", type: "TEXT", notnull: true, primaryKey: false },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { fireToolCall } = renderApp(<Component plugins={[sqlPlugin]} />);
    const result = await fireToolCall({
      toolName: "describe_schema",
      input: {},
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toMatchObject({
      ok: true,
      tables: [
        expect.objectContaining({
          name: "products",
          columns: expect.any(Array),
        }),
      ],
    });
    // Hits the right URL.
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/sql/schema");
  });

  it("query_products returns rows + truncated flag", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          rows: [
            { id: 101, name: "Carry-on Spinner 22\"", price_usd: 189.0 },
            { id: 102, name: "Daypack 25L", price_usd: 79.0 },
          ],
          rowCount: 2,
          truncated: false,
          sql: "SELECT id, name, price_usd FROM products LIMIT 2",
          limit: 50,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { fireToolCall } = renderApp(<Component plugins={[sqlPlugin]} />);
    const result = await fireToolCall({
      toolName: "query_products",
      input: { query: "SELECT id, name, price_usd FROM products LIMIT 2", limit: 50 },
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toMatchObject({
      ok: true,
      rowCount: 2,
      truncated: false,
      rows: expect.arrayContaining([
        expect.objectContaining({ name: "Carry-on Spinner 22\"" }),
      ]),
    });
    // POST + body shape.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe("/api/sql/query");
    const init = calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.query).toContain("SELECT id, name, price_usd FROM products");
    expect(body.limit).toBe(50);
  });

  it("validation failure (400) becomes { ok: false, code: 'validation_failed' }", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "validation_failed",
          reason: "sql: only SELECT (or WITH ... SELECT) queries are allowed",
        }),
        { status: 400 },
      )) as unknown as typeof fetch;

    const { fireToolCall } = renderApp(<Component plugins={[sqlPlugin]} />);
    const result = await fireToolCall({
      toolName: "query_products",
      input: { query: "DROP TABLE products" },
    });

    expect(result.output).toMatchObject({
      ok: false,
      code: "validation_failed",
      reason: expect.stringMatching(/SELECT/i),
    });
  });

  it("SQLite execution error (500, typo) becomes { ok: false, code: 'query_failed' }", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "query_failed",
          reason: "no such column: nope",
        }),
        { status: 500 },
      )) as unknown as typeof fetch;

    const { fireToolCall } = renderApp(<Component plugins={[sqlPlugin]} />);
    const result = await fireToolCall({
      toolName: "query_products",
      input: { query: "SELECT nope FROM products" },
    });

    expect(result.output).toMatchObject({
      ok: false,
      code: "query_failed",
      reason: expect.stringMatching(/no such column/i),
    });
  });

  it("describe_schema NOT mounted: dispatcher surfaces a missing-tool error", async () => {
    // Mount nothing. The agent should not be able to call a tool that
    // isn't registered; the dispatcher's outputError fires.
    const { fireToolCall } = renderApp(<Component plugins={[]} />);
    const result = await fireToolCall({
      toolName: "describe_schema",
      input: {},
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/describe_schema/i);
  });

  it("query_products NOT mounted: dispatcher surfaces a missing-tool error", async () => {
    const { fireToolCall } = renderApp(<Component plugins={[]} />);
    const result = await fireToolCall({
      toolName: "query_products",
      input: { query: "SELECT 1" },
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/query_products/i);
  });
});
