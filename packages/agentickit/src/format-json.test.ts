/**
 * Direct tests for the shared `formatJson` helper.
 *
 * The helper replaced four nearly-identical inline formatters in the package
 * (confirm modal, sidebar message panel, AG-UI runtime tool output, debug
 * logger). Each call site needs slightly different empty-handling and
 * encoding rules; these tests pin every option to its documented behaviour
 * so a future refactor can't silently regress one consumer while keeping
 * another green.
 */

import { describe, expect, it } from "vitest";
import { formatJson } from "./format-json.js";

describe("formatJson — defaults", () => {
  it("returns '' for undefined", () => {
    expect(formatJson(undefined)).toBe("");
  });

  it("pretty-prints null as the literal 'null'", () => {
    expect(formatJson(null)).toBe("null");
  });

  it("pretty-prints objects with 2-space indent", () => {
    expect(formatJson({ a: 1, b: { c: 2 } })).toBe('{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}');
  });

  it("JSON-encodes a bare string by default (so quoting is visible)", () => {
    expect(formatJson("hello")).toBe('"hello"');
  });

  it("encodes empty objects and arrays normally when no emptyAs given", () => {
    expect(formatJson({})).toBe("{}");
    expect(formatJson([])).toBe("[]");
  });

  it("falls back to String(value) for non-serializable inputs (functions, symbols)", () => {
    // JSON.stringify returns undefined for a function; the helper coerces.
    const fn = () => 1;
    expect(formatJson(fn)).toBe(String(fn));
    const sym = Symbol("k");
    expect(formatJson(sym)).toBe(String(sym));
  });

  it("falls back to String(value) when JSON.stringify throws (BigInt cycle)", () => {
    const big = { n: 12345678901234567890n };
    // BigInt throws "TypeError: Do not know how to serialize a BigInt".
    expect(formatJson(big)).toBe(String(big));
  });
});

describe("formatJson — passthroughStrings", () => {
  it("returns a bare string verbatim, no JSON quotes", () => {
    expect(formatJson("hello", { passthroughStrings: true })).toBe("hello");
  });

  it("does not affect non-string values", () => {
    expect(formatJson({ x: 1 }, { passthroughStrings: true })).toBe('{\n  "x": 1\n}');
    expect(formatJson(42, { passthroughStrings: true })).toBe("42");
  });
});

describe("formatJson — indent", () => {
  it("indent=0 produces single-line compact JSON", () => {
    expect(formatJson({ a: 1, b: 2 }, { indent: 0 })).toBe('{"a":1,"b":2}');
  });

  it("indent=4 produces 4-space indent", () => {
    expect(formatJson({ a: 1 }, { indent: 4 })).toBe('{\n    "a": 1\n}');
  });
});

describe("formatJson — undefinedAs", () => {
  it("returns the literal sentinel string when set to a string", () => {
    expect(formatJson(undefined, { undefinedAs: "undefined" })).toBe("undefined");
  });

  it("returns null when the caller opts in to the nullable mode", () => {
    expect(formatJson(undefined, { undefinedAs: null })).toBeNull();
  });

  it("does not affect defined values", () => {
    expect(formatJson({ x: 1 }, { undefinedAs: null })).toBe('{\n  "x": 1\n}');
  });
});

describe("formatJson — emptyAs", () => {
  it("short-circuits null when emptyAs is set", () => {
    expect(formatJson(null, { emptyAs: null })).toBeNull();
    expect(formatJson(null, { emptyAs: "" })).toBe("");
  });

  it("short-circuits empty objects and arrays", () => {
    expect(formatJson({}, { emptyAs: null })).toBeNull();
    expect(formatJson([], { emptyAs: null })).toBeNull();
  });

  it("does not short-circuit non-empty objects/arrays", () => {
    expect(formatJson({ a: 1 }, { emptyAs: null })).toBe('{\n  "a": 1\n}');
    expect(formatJson([1], { emptyAs: null })).toBe("[\n  1\n]");
  });

  it("does NOT short-circuit primitives — only object-like emptiness", () => {
    expect(formatJson(0, { emptyAs: null })).toBe("0");
    expect(formatJson("", { emptyAs: null })).toBe('""');
    expect(formatJson(false, { emptyAs: null })).toBe("false");
  });
});

describe("formatJson — composite call sites (per the four call patterns it replaces)", () => {
  it("confirm-modal pattern: undefinedAs=null + emptyAs=null hides empty payloads", () => {
    const opts = { undefinedAs: null, emptyAs: null } as const;
    expect(formatJson(undefined, opts)).toBeNull();
    expect(formatJson(null, opts)).toBeNull();
    expect(formatJson({}, opts)).toBeNull();
    expect(formatJson({ trip: "tokyo" }, opts)).toBe('{\n  "trip": "tokyo"\n}');
  });

  it("sidebar-messages pattern: passthroughStrings keeps tool input/output readable", () => {
    const opts = { passthroughStrings: true } as const;
    expect(formatJson(undefined, opts)).toBe("");
    expect(formatJson("ok", opts)).toBe("ok");
    expect(formatJson({ id: "t1" }, opts)).toBe('{\n  "id": "t1"\n}');
  });

  it("ag-ui pattern: indent=0 + passthroughStrings produces wire-shaped tool output", () => {
    const opts = { indent: 0, passthroughStrings: true } as const;
    expect(formatJson(undefined, opts)).toBe("");
    expect(formatJson("done", opts)).toBe("done");
    expect(formatJson({ ok: true }, opts)).toBe('{"ok":true}');
  });

  it("debug-logger pattern: indent=0 + undefinedAs='undefined' produces compact log lines", () => {
    const opts = { indent: 0, undefinedAs: "undefined" } as const;
    expect(formatJson(undefined, opts)).toBe("undefined");
    expect(formatJson(null, opts)).toBe("null");
    expect(formatJson({ tool: "x" }, opts)).toBe('{"tool":"x"}');
  });
});
