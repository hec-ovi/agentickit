/**
 * SQL plugin HTTP routes.
 *
 *   GET  /api/sql/schema   -> { tables: [{ name, columns: [...] }] }
 *   POST /api/sql/query    -> body { query, limit? }
 *                              200 { rows, rowCount, truncated, sql, limit }
 *                              400 { error, reason } on a read-only validation
 *                                  failure (e.g. INSERT attempt, ; chaining).
 *                              500 { error, reason } on a SQLite execution error
 *                                  (typo, unknown column, etc.).
 *
 * Routes stay server-side because we don't want to ship the SQLite
 * binary OR the seed data to the browser. The client plugin calls these
 * routes via fetch, exactly the same pattern as the weather + web-search
 * tools.
 */

import type { Context } from "hono";
import { describeSchema, runQuery } from "./db.js";

export function sqlSchemaRoute(c: Context): Response {
  try {
    const schema = describeSchema();
    return c.json(schema);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return c.json({ error: "schema_failed", reason }, 500);
  }
}

interface QueryBody {
  query?: unknown;
  limit?: unknown;
}

export async function sqlQueryRoute(c: Context): Promise<Response> {
  let body: QueryBody;
  try {
    body = (await c.req.json()) as QueryBody;
  } catch {
    return c.json(
      { error: "bad_json", reason: "POST body must be JSON: { query: '...', limit?: number }" },
      400,
    );
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return c.json(
      { error: "missing_query", reason: "POST body must include a non-empty `query` string" },
      400,
    );
  }
  if (body.query.length > 2000) {
    return c.json(
      { error: "query_too_long", reason: "query exceeds 2000 characters" },
      400,
    );
  }

  const limitRaw =
    typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;

  try {
    const result = runQuery(body.query, limitRaw !== undefined ? { limit: limitRaw } : {});
    return c.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Validation failures (forbidden keyword, statement chain, non-SELECT)
    // are surfaced as 400; SQLite parse/execution failures (typo,
    // unknown column) are 500. We split on the "sql: ..." prefix our
    // validator uses.
    const status = reason.startsWith("sql: ") ? 400 : 500;
    return c.json({ error: status === 400 ? "validation_failed" : "query_failed", reason }, status);
  }
}
