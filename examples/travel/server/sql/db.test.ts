/**
 * Tests for the read-only SQL layer.
 *
 * Three concerns:
 *
 *   1. The static validator (`isReadOnlyQuery`) rejects everything that
 *      isn't a single SELECT or WITH-prefixed SELECT.
 *   2. `runQuery` enforces the row cap and surfaces a truncation flag
 *      so the agent knows the result wasn't complete.
 *   3. `describeSchema` returns the three seeded tables with their
 *      columns, so the agent can introspect before writing queries.
 *
 * The DB runs in-memory and is seeded from schema.sql each test (we
 * reset the singleton in `beforeEach`). No mocking; this exercises the
 * real `node:sqlite` engine end-to-end.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, describeSchema, isReadOnlyQuery, resetDb, runQuery } from "./db.js";

beforeEach(() => {
  // Start each test from a fresh, freshly-seeded DB so state from a
  // previous test (e.g. one that happened to query a specific row) can
  // never leak into the next assertion.
  resetDb();
});

describe("isReadOnlyQuery (static validator)", () => {
  it("accepts a plain SELECT", () => {
    expect(isReadOnlyQuery("SELECT * FROM products")).toEqual({ ok: true });
  });

  it("accepts a SELECT with whitespace + trailing semicolon", () => {
    expect(isReadOnlyQuery("  SELECT id FROM products;  ")).toEqual({ ok: true });
  });

  it("accepts WITH-prefixed SELECT (CTE)", () => {
    const sql =
      "WITH cheap AS (SELECT * FROM products WHERE price_usd < 30) SELECT * FROM cheap";
    expect(isReadOnlyQuery(sql)).toEqual({ ok: true });
  });

  it("accepts case-insensitive keywords", () => {
    expect(isReadOnlyQuery("select id from products")).toEqual({ ok: true });
  });

  it("rejects empty / whitespace-only input", () => {
    expect(isReadOnlyQuery("")).toMatchObject({ ok: false });
    expect(isReadOnlyQuery("   ")).toMatchObject({ ok: false });
  });

  it("rejects non-SELECT first statement", () => {
    expect(isReadOnlyQuery("INSERT INTO products VALUES (999, 'x', 1, 0, 0, 1, 'd')"))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/SELECT/i) });
    expect(isReadOnlyQuery("DROP TABLE products"))
      .toMatchObject({ ok: false });
    expect(isReadOnlyQuery("PRAGMA table_info(products)"))
      .toMatchObject({ ok: false });
  });

  it("rejects statement chaining via inline semicolon", () => {
    expect(
      isReadOnlyQuery("SELECT * FROM products; DROP TABLE products"),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/multiple statements/i) });
  });

  it("rejects forbidden keywords anywhere in the query", () => {
    // An UPDATE smuggled into a CTE body would otherwise reach the engine.
    const sql = "WITH x AS (UPDATE products SET price_usd = 0) SELECT * FROM x";
    expect(isReadOnlyQuery(sql)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/UPDATE/i),
    });
  });

  it("rejects ATTACH / DETACH (file-system-touching commands)", () => {
    expect(isReadOnlyQuery("SELECT * FROM products WHERE name = 'x' ATTACH '/tmp/x.db' AS y"))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/ATTACH/i) });
  });
});

describe("runQuery", () => {
  it("returns rows from a simple SELECT", () => {
    const result = runQuery("SELECT id, name FROM categories ORDER BY id");
    expect(result.rows.length).toBe(5);
    expect(result.rows[0]).toEqual({ id: 1, name: "luggage" });
    expect(result.truncated).toBe(false);
  });

  it("respects the default row cap when the query has no LIMIT", () => {
    // We have ~90 reviews seeded; default cap is 50.
    const result = runQuery("SELECT * FROM reviews ORDER BY id");
    expect(result.rowCount).toBeLessThanOrEqual(DEFAULT_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it("respects an explicit LIMIT clause in the query (no auto-injection)", () => {
    const result = runQuery("SELECT * FROM products LIMIT 3");
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("respects the caller-supplied limit option", () => {
    const result = runQuery("SELECT * FROM products ORDER BY id", { limit: 5 });
    expect(result.rowCount).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("throws on a write attempt (defence layer 2 catches it before the engine)", () => {
    expect(() => runQuery("INSERT INTO products VALUES (999, 'x', 1, 0, 0, 1, 'd')")).toThrow(
      /SELECT/i,
    );
  });

  it("can answer realistic agentic queries (joins + aggregation)", () => {
    const result = runQuery(`
      SELECT p.name, AVG(r.rating) AS avg_rating, COUNT(r.id) AS n_reviews
      FROM products p
      JOIN reviews r ON r.product_id = p.id
      JOIN categories c ON c.id = p.category_id
      WHERE c.name = 'luggage'
      GROUP BY p.id
      ORDER BY avg_rating DESC
      LIMIT 3
    `);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0]).toHaveProperty("avg_rating");
    expect(result.rows[0]).toHaveProperty("n_reviews");
    expect(result.rows[0]).toHaveProperty("name");
  });
});

describe("describeSchema", () => {
  it("returns the three seeded tables with their columns", () => {
    const schema = describeSchema();
    const tableNames = schema.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(["categories", "products", "reviews"]);
  });

  it("includes type + primary-key flags so the agent can pick joins", () => {
    const schema = describeSchema();
    const products = schema.tables.find((t) => t.name === "products");
    expect(products).toBeDefined();
    const id = products!.columns.find((c) => c.name === "id");
    expect(id).toMatchObject({ type: "INTEGER", primaryKey: true });
    const fk = products!.columns.find((c) => c.name === "category_id");
    expect(fk).toMatchObject({ notnull: true });
  });
});
