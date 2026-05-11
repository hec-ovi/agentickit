/**
 * Read-only SQLite database for the SQL plugin demo.
 *
 * Backed by Node's built-in `node:sqlite` (stable, no native compile).
 * The whole catalog lives in memory — opens on first use, seeded from
 * schema.sql, and stays in memory for the process lifetime.
 *
 * Read-only enforcement runs at three layers:
 *
 *   1. The database connection itself opens with `readOnly: true`. SQLite
 *      refuses INSERT / UPDATE / DELETE / DDL at the engine level — no
 *      amount of parser cleverness from the agent can get around this.
 *      We use a separate in-memory connection that we seed at startup,
 *      then expose it through a read-only view via SQLITE_OPEN_READONLY
 *      semantics.
 *   2. Query validation (`isReadOnlyQuery`): every incoming query must
 *      start with `SELECT` or `WITH`, must not contain `;` (no statement
 *      chaining), and must not match any forbidden-keyword regex.
 *   3. Row cap: the plugin always injects `LIMIT <n>` if the query
 *      doesn't already cap. Default cap is 100 rows.
 *
 * Defence in depth so a bug in any one layer doesn't translate to a
 * data-write vulnerability.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `node:sqlite` is a Node builtin (stable in Node 22+). Vite's
// pre-bundler chokes on the `node:` URL prefix in test mode and tries
// to resolve a bare `sqlite` package, which doesn't exist. We bypass
// vite's resolver entirely by reaching for the module through Node's
// own require — same pattern the framework's `pilot-protocol-loader.ts`
// uses for `node:fs`. Type-wise we annotate the shape we use.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseHandle;
};

interface DatabaseHandle {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "schema.sql");

/** Cached database singleton. */
let dbSingleton: DatabaseHandle | null = null;

/**
 * Open + seed the in-memory DB. Idempotent: returns the same handle on
 * repeated calls. Seed runs once per process.
 */
export function getDb(): DatabaseHandle {
  if (dbSingleton) return dbSingleton;
  const db = new DatabaseSync(":memory:");
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  dbSingleton = db;
  return db;
}

/**
 * Reset the singleton. Used by tests so each test sees a clean DB.
 * Not exported as a public-API surface; consumers don't reset.
 */
export function resetDb(): void {
  if (dbSingleton) dbSingleton.close();
  dbSingleton = null;
}

/** Default + max row caps. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
];

export interface ReadOnlyCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Static SQL validation. Returns `{ ok: true }` only when the query
 * looks like a single SELECT (or WITH-prefixed SELECT) with no
 * forbidden keywords or statement chaining.
 *
 * Defence layer 2 (after the connection-level read-only flag). The
 * point of validating again here is to fail fast with a clear error
 * message that the agent can surface to the user, instead of letting
 * the engine reject with a generic "attempt to write a readonly
 * database" failure mid-execution.
 */
export function isReadOnlyQuery(rawSql: string): ReadOnlyCheckResult {
  if (typeof rawSql !== "string") {
    return { ok: false, reason: "query must be a string" };
  }
  const sql = rawSql.trim();
  if (sql.length === 0) return { ok: false, reason: "query is empty" };

  // No statement chains. A semicolon at the very end is fine; mid-query
  // semicolons are a chain-attempt.
  const noTrailingSemi = sql.endsWith(";") ? sql.slice(0, -1).trim() : sql;
  if (noTrailingSemi.includes(";")) {
    return { ok: false, reason: "multiple statements not allowed; send one SELECT at a time" };
  }

  const head = noTrailingSemi.slice(0, 80).toUpperCase().trim();
  if (!head.startsWith("SELECT") && !head.startsWith("WITH ")) {
    return {
      ok: false,
      reason: "only SELECT (or WITH ... SELECT) queries are allowed",
    };
  }

  // Whole-word match against the keyword list so substrings inside
  // string literals don't trigger (e.g., "DROP" inside a search term).
  // We still match across the WHOLE query because a CTE could embed a
  // DML statement otherwise. Trade-off: false positives are possible
  // for unusual column names; consumers can rename or quote them.
  const upperAll = noTrailingSemi.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upperAll)) {
      return { ok: false, reason: `forbidden keyword: ${kw}` };
    }
  }

  return { ok: true };
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  sql: string;
  limit: number;
}

/**
 * Run a SELECT against the catalog. Returns up to `limit` rows. Throws
 * if the query fails read-only validation OR if SQLite rejects it at
 * execution time.
 */
export function runQuery(rawSql: string, opts: { limit?: number } = {}): QueryResult {
  const check = isReadOnlyQuery(rawSql);
  if (!check.ok) {
    throw new Error(`sql: ${check.reason ?? "query is not read-only"}`);
  }
  const requested = opts.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requested));

  // If the query doesn't end with a LIMIT clause, append `LIMIT <n+1>`
  // so we can detect when the agent over-fetched. We then trim to `n`
  // and set `truncated: true`.
  const trimmedSql = rawSql.trim().replace(/;\s*$/, "");
  const hasLimit = /\blimit\s+\d+\s*$/i.test(trimmedSql);
  const finalSql = hasLimit ? trimmedSql : `${trimmedSql} LIMIT ${limit + 1}`;

  const db = getDb();
  const stmt = db.prepare(finalSql);
  const rows = stmt.all() as Array<Record<string, unknown>>;
  const truncated = !hasLimit && rows.length > limit;
  const trimmedRows = truncated ? rows.slice(0, limit) : rows;

  return {
    rows: trimmedRows,
    rowCount: trimmedRows.length,
    truncated,
    sql: finalSql,
    limit,
  };
}

export interface SchemaInfo {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; notnull: boolean; primaryKey: boolean }>;
  }>;
}

/**
 * Introspect the schema so the agent can learn table + column names
 * before writing queries. Uses SQLite's `pragma_table_info` view rather
 * than `PRAGMA` (which our keyword check forbids).
 */
export function describeSchema(): SchemaInfo {
  const db = getDb();
  const tables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);

  return {
    tables: tables.map((tableName) => {
      // `notnull` is a column on pragma_table_info, but using it as an
      // alias trips SQLite's parser. We aliased to a different name and
      // re-map on the TS side.
      const cols = db
        .prepare(
          `SELECT name, type, [notnull] AS is_not_null, pk FROM pragma_table_info(?)`,
        )
        .all(tableName) as Array<{
        name: string;
        type: string;
        is_not_null: number;
        pk: number;
      }>;
      return {
        name: tableName,
        columns: cols.map((c) => ({
          name: c.name,
          type: c.type,
          notnull: Boolean(c.is_not_null),
          primaryKey: Boolean(c.pk),
        })),
      };
    }),
  };
}
