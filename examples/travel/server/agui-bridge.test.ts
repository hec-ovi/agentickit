/**
 * Regression test for the "schema is not a function" bug that crashed
 * every specialist (flights, hotels, activities, weather) on the first
 * tool-use until the jsonSchema() wrapper was added in agui-bridge.ts.
 *
 * The AI SDK's `asSchema` helper accepts three shapes:
 *   - its own `Schema` wrapper
 *   - a StandardSchema instance
 *   - a thunk `() => Schema`
 * A bare JSON-Schema OBJECT (e.g. `{ type: "object", properties: ... }`)
 * falls through to the thunk branch and is invoked as a function the
 * moment the model produces tool inputs, throwing
 * `TypeError: schema is not a function`. The fix wraps the bare object
 * with `jsonSchema()` from "ai".
 *
 * This test asserts the resulting tool's inputSchema is the SDK's
 * Schema wrapper (recognisable by the `_type` brand and `jsonSchema`
 * field), not a bare object.
 */

import { describe, expect, it } from "vitest";
import { buildToolSet } from "./agui-bridge.js";

interface SchemaShape {
  _type?: unknown;
  jsonSchema?: unknown;
  validate?: unknown;
}

/**
 * The AI SDK's Schema wrapper carries a Symbol-keyed brand
 * (`Symbol(vercel.ai.schema)`) and exposes `jsonSchema` as an enumerable
 * field. A bare JSON-Schema object has neither. Checking BOTH signals
 * is the airtight test that the wrapper is in place.
 */
function isAiSchemaWrapper(value: unknown): value is SchemaShape {
  if (value === null || typeof value !== "object") return false;
  const v = value as { jsonSchema?: unknown };
  if (typeof v.jsonSchema !== "object" || v.jsonSchema === null) return false;
  const symbols = Object.getOwnPropertySymbols(value);
  return symbols.some((s) => s.description === "vercel.ai.schema");
}

describe("agui-bridge buildToolSet — schema-wrapping regression", () => {
  it("wraps a bare JSON-Schema parameters object in the AI SDK's Schema shape", () => {
    const set = buildToolSet(
      [
        {
          name: "search_serper",
          description: "Search the web via Serper.",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          },
        },
      ],
      ["search_serper"],
    );
    expect(set).toBeDefined();
    const tool = set?.search_serper as { inputSchema: SchemaShape };
    expect(tool).toBeDefined();

    // The wrapper carries the SDK's brand (`_type === "schema"`) AND
    // exposes the raw jsonSchema for downstream consumers. A bare object
    // would have neither.
    expect(isAiSchemaWrapper(tool.inputSchema)).toBe(true);
    expect(tool.inputSchema.jsonSchema).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    });
  });

  it("falls back to a wrapped empty-object schema when parameters is omitted", () => {
    // A tool with no parameters is still valid; the bridge must produce
    // a wrapped {type:"object"} schema rather than letting the AI SDK
    // crash on a bare object or undefined.
    const set = buildToolSet(
      [{ name: "ping", description: "No-arg tool." }],
      ["ping"],
    );
    expect(set).toBeDefined();
    const tool = set?.ping as { inputSchema: SchemaShape };
    expect(isAiSchemaWrapper(tool.inputSchema)).toBe(true);
    expect(tool.inputSchema.jsonSchema).toEqual({ type: "object" });
  });

  it("filters out tools not in the allowList", () => {
    const set = buildToolSet(
      [
        { name: "search_serper", parameters: { type: "object" } },
        { name: "propose_hotel", parameters: { type: "object" } },
      ],
      ["search_serper"], // only allow one
    );
    expect(set).toBeDefined();
    expect(set?.search_serper).toBeDefined();
    expect(set?.propose_hotel).toBeUndefined();
  });

  it("returns undefined when no allowed tools survive filtering (specialist gets no tools)", () => {
    const set = buildToolSet(
      [{ name: "unrelated", parameters: { type: "object" } }],
      ["search_serper"],
    );
    expect(set).toBeUndefined();
  });

  it("returns undefined when the declared list is empty or missing", () => {
    expect(buildToolSet(undefined, ["x"])).toBeUndefined();
    expect(buildToolSet([], ["x"])).toBeUndefined();
  });

  it("every wrapped inputSchema is callable by `asSchema`-style consumers (no thunk fall-through)", () => {
    // Sanity check: a value that survives `asSchema` is one whose
    // `_type === "schema"` so the helper short-circuits to the wrapper
    // branch instead of trying to invoke it as a function. We assert
    // the brand directly here; the live regression that proves the
    // model side does not crash lives in the broader integration test
    // (handler.live-vllm-pilot.test.ts).
    const set = buildToolSet(
      [
        { name: "a", parameters: { type: "object" } },
        { name: "b", parameters: { type: "object" } },
        { name: "c", parameters: { type: "object" } },
      ],
      ["a", "b", "c"],
    );
    for (const name of ["a", "b", "c"] as const) {
      const tool = (set as Record<string, { inputSchema: SchemaShape }>)[name];
      expect(tool).toBeDefined();
      expect(isAiSchemaWrapper(tool.inputSchema)).toBe(true);
    }
  });
});
