/**
 * Read-only SQL plugin. Two tools:
 *
 *   query_products    — run a SELECT against the catalog DB and return rows.
 *   describe_schema   — list tables + columns so the agent can write queries.
 *
 * The actual DB lives server-side (`server/sql/db.ts`), backed by Node's
 * built-in `node:sqlite`. The client plugin is a thin proxy; it never
 * talks to SQLite directly. API keys aren't a concern here because the
 * data is local + read-only by enforcement.
 *
 * Why two tools instead of one: the agent doesn't know the schema until
 * it asks. Without `describe_schema` it would either hallucinate column
 * names (often wrong) or refuse to query at all. With it, the typical
 * flow is one schema call up front, then targeted SELECTs.
 */

import type { ReactNode } from "react";
import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import type { PilotPlugin } from "./index";

interface SchemaTable {
  name: string;
  columns: Array<{ name: string; type: string; notnull: boolean; primaryKey: boolean }>;
}

interface SchemaResponse {
  tables: SchemaTable[];
}

interface QuerySuccess {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  sql: string;
  limit: number;
}

interface SqlError {
  error: string;
  reason: string;
}

/** Description shown to the agent for `describe_schema`. */
const DESCRIBE_SCHEMA_DESCRIPTION = `
List the tables + columns in the read-only product catalog database.
CALL THIS FIRST before query_products on a new turn so you know the
exact table and column names. Returns table names, column names,
column types, and primary-key flags.

The agent is encouraged to use this output to write precise queries
rather than guessing at column names. After one schema lookup per
turn, run as many query_products calls as needed without re-asking
for the schema.
`.trim();

/** Description shown to the agent for `query_products`. */
const QUERY_PRODUCTS_DESCRIPTION = `
Run a read-only SQL SELECT against the local product catalog DB and
return rows (each row is a JSON object keyed by column name).

WHEN TO USE
- The user asks about products, categories, prices, ratings, stock.
- You want to surface specific items by some criterion ("under $40",
  "highest rated luggage", "out of stock"). Do NOT guess; query the DB.

CONTRACT
- Only SELECT (or WITH ... SELECT) is allowed.
- Statement chaining (semicolons mid-query), INSERT/UPDATE/DELETE/DROP/
  ALTER/CREATE/PRAGMA/ATTACH are rejected with a clear error.
- Results are capped at 50 rows by default and 200 at most. If the
  result was capped, the response carries truncated: true so you can
  refine the query if needed.
- If the query fails validation OR SQLite returns an error, you'll get
  { ok: false, reason: "..." }. Read the reason carefully and try
  again with a corrected query rather than telling the user "I can't".

PROCESS
1. Call describe_schema first (once per turn) to learn the schema.
2. Compose a precise SELECT against the actual columns you discovered.
3. Aggregate when appropriate (AVG, COUNT, MIN, MAX), don't dump every
   row to the user.
4. Cite specific numbers in your reply ("rated 4.7 across 8 reviews").
`.trim();

async function callSchema(): Promise<SchemaResponse | SqlError> {
  try {
    const res = await fetch("/api/sql/schema");
    const body = (await res.json()) as SchemaResponse | SqlError;
    if (!res.ok) return body as SqlError;
    return body;
  } catch (err) {
    return {
      error: "upstream_failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function callQuery(query: string, limit?: number): Promise<QuerySuccess | SqlError> {
  try {
    const res = await fetch("/api/sql/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(limit !== undefined ? { query, limit } : { query }),
    });
    const body = (await res.json()) as QuerySuccess | SqlError;
    if (!res.ok) return body as SqlError;
    return body;
  } catch (err) {
    return {
      error: "upstream_failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function DescribeSchemaComponent(): ReactNode {
  usePilotAction({
    name: "describe_schema",
    description: DESCRIBE_SCHEMA_DESCRIPTION,
    parameters: z.object({}).strict(),
    handler: async () => {
      const result = await callSchema();
      if ("error" in result) {
        return { ok: false, reason: result.reason, code: result.error };
      }
      return { ok: true, tables: result.tables };
    },
  });
  return null;
}

function QueryProductsComponent(): ReactNode {
  usePilotAction({
    name: "query_products",
    description: QUERY_PRODUCTS_DESCRIPTION,
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "A single SELECT statement. The validator rejects multi-statement queries, " +
            "INSERT/UPDATE/DELETE/DROP/PRAGMA/ATTACH, etc.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .optional()
        .describe(
          "Override the default 50-row cap. Caps at 200. Set lower (10-20) for " +
            "snapshot queries; higher for aggregations that produce few rows anyway.",
        ),
    }),
    handler: async ({ query, limit }) => {
      const result = await callQuery(query, limit);
      if ("error" in result) {
        return { ok: false, reason: result.reason, code: result.error };
      }
      return {
        ok: true,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        sql: result.sql,
        limit: result.limit,
      };
    },
  });
  return null;
}

export const sqlPlugin: PilotPlugin = {
  id: "sql",
  description:
    "Read-only SQL over a local product catalog (SQLite). Two tools: describe_schema and query_products.",
  component: () => (
    <>
      <DescribeSchemaComponent />
      <QueryProductsComponent />
    </>
  ),
};
