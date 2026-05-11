/**
 * One JSON-prettifier for the whole package.
 *
 * Internal utility (NOT re-exported from `index.ts`). Replaces four nearly
 * identical helpers that drifted in subtle ways: empty-object handling,
 * `undefined` handling, indent, and whether to JSON-encode a bare string or
 * pass it through verbatim. Each behaviour is now a named option and the
 * old behaviour-by-implementation footgun is gone.
 *
 * The helper has two return modes:
 *
 *   - **String mode** (the default): always returns a string. Use this in
 *     log lines, tool-output payloads, and debug panes where you want
 *     "something readable" no matter what came in.
 *   - **Nullable mode**: returns `null` for empty / missing payloads so a UI
 *     can hide the value section entirely. Triggered when the caller
 *     explicitly passes `undefinedAs: null` or `emptyAs: null`. The
 *     overloads make TypeScript narrow correctly per call site.
 */

export interface FormatJsonOptions {
  /**
   * `JSON.stringify` indent. Default `2` (pretty). Pass `0` for compact
   * single-line output (log lines, tool-output payloads sent on the wire).
   */
  indent?: number;
  /**
   * If `true`, a string input is returned verbatim instead of being
   * JSON-encoded as `"foo"`. Defaults to `false` (full JSON encoding) so
   * that callers logging arbitrary user input see the quoting clearly.
   */
  passthroughStrings?: boolean;
  /**
   * What to return when the input is `undefined`. Default `""`.
   * Pass `null` to surface "no value" as a null sentinel that a UI can
   * branch on.
   */
  undefinedAs?: string | null;
  /**
   * What to return when the input is `null`, `{}`, or `[]`. Default
   * `undefined`, which lets the value flow through to `JSON.stringify`
   * (printing `"null"`, `"{}"`, `"[]"`). Pass an explicit string or `null`
   * to short-circuit, useful for "hide the section when there's nothing
   * worth showing" UX.
   */
  emptyAs?: string | null;
}

/**
 * Overload: when the caller asks for nullable empty/undefined sentinels,
 * the result is `string | null`. The confirm modal uses this to hide its
 * Arguments section when the tool was called with `{}`.
 */
export function formatJson(
  value: unknown,
  opts: FormatJsonOptions & ({ undefinedAs: null } | { emptyAs: null }),
): string | null;
/**
 * Overload: when the caller does NOT pass nullable sentinels, the helper
 * is statically guaranteed to return a string. Sidebar messages, AG-UI
 * tool outputs, and the debug logger all rely on this.
 */
export function formatJson(value: unknown, opts?: FormatJsonOptions): string;
export function formatJson(value: unknown, opts: FormatJsonOptions = {}): string | null {
  const { indent = 2, passthroughStrings = false, undefinedAs = "", emptyAs } = opts;

  if (value === undefined) return undefinedAs;

  if (passthroughStrings && typeof value === "string") return value;

  // Caller-driven empty short-circuit. Triggered for `null` AND for empty
  // plain object / empty array. Symbols / functions / etc. fall through to
  // `JSON.stringify` (which will return `undefined` for those, caught below).
  if (emptyAs !== undefined && isEmptyish(value)) return emptyAs;

  try {
    const out = JSON.stringify(value, null, indent);
    // `JSON.stringify` returns `undefined` for symbols, functions, and
    // `BigInt`-only payloads (the latter throws, handled in catch). Coerce
    // through `String(value)` so the helper still returns a string.
    return out === undefined ? String(value) : out;
  } catch {
    return String(value);
  }
}

function isEmptyish(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value as object).length === 0;
}
