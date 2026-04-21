/**
 * Hand-rolled markdown renderer for assistant messages in `<PilotSidebar>`.
 *
 * Why hand-rolled (~180 LoC) instead of pulling `marked` + `DOMPurify`?
 *
 *   1. Zero runtime dep weight. Every dep we add to `packages/agentickit/`
 *      shows up in the consumer's bundle — and most consumers will never
 *      emit markdown that exercises `marked`'s long tail of features.
 *   2. Security surface we can audit in one file. The whole pipeline here is
 *      "escape every byte of untrusted input once, then apply a fixed set of
 *      regex transforms that only emit known-safe HTML". No `dangerouslySet`,
 *      no opaque parser state, nothing a future contributor can break without
 *      the test suite catching it.
 *   3. React-idiomatic output. We render a tree of React elements so keys are
 *      stable, the reconciler can diff streaming updates, and the copy-to-
 *      clipboard button for code blocks can live as a real component.
 *
 * Supported subset:
 *   - **bold** (`**text**` or `__text__`)
 *   - *italic* (`*text*` or `_text_`)
 *   - inline `code`
 *   - fenced ```code blocks``` with optional language hint + copy button
 *   - # headings (levels 1-3; deeper levels collapse to h3)
 *   - - / * / + bullet lists and 1. numbered lists
 *   - [text](url) links — URLs are scheme-validated; only http(s), mailto:,
 *     and relative paths survive. Anything else is rendered as plain text.
 *   - --- horizontal rules
 *   - paragraphs separated by blank lines
 *
 * Explicitly NOT supported: HTML passthrough, tables, images, footnotes,
 * nested blockquotes, task lists. Add them when a real use case appears —
 * every feature is a potential XSS vector.
 */

import { type ReactElement, type ReactNode, useCallback, useState } from "react";

/** Top-level renderer. Splits input into block-level chunks, then delegates. */
export function PilotMarkdown(props: { text: string }): ReactElement {
  const { text } = props;
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, i) => (
        // Streaming only appends blocks; existing blocks never reorder, so
        // the index is a stable key here.
        // biome-ignore lint/suspicious/noArrayIndexKey: block order is stable during streaming.
        <BlockNode key={i} block={block} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Block parser.
// ---------------------------------------------------------------------------

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; body: string }
  | { kind: "hr" };

/**
 * Walk the input line-by-line, emitting blocks. Fenced code blocks are
 * recognized first so their inner content is preserved verbatim — otherwise
 * the inline parser would mangle `**` or `_` inside code.
 */
function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  // `noUncheckedIndexedAccess` is on: every `lines[idx]` read can be undefined
  // at the type level. We gate inside the while loop (i < lines.length) so the
  // runtime is safe; `?? ""` appeases the checker at each read site.
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block. We accept ``` or ~~~ with an optional language tag.
    const fenceMatch = /^(```|~~~)([\w-]*)\s*$/.exec(line);
    if (fenceMatch) {
      const fence = fenceMatch[1] ?? "";
      const lang = fenceMatch[2] ?? "";
      const bodyLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith(fence)) {
        bodyLines.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip the closing fence (or EOF)
      out.push({ kind: "code", lang, body: bodyLines.join("\n") });
      continue;
    }

    // Horizontal rule.
    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // ATX heading.
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      const hashes = (headingMatch[1] ?? "").length;
      const level = (hashes <= 3 ? hashes : 3) as 1 | 2 | 3;
      out.push({ kind: "h", level, text: headingMatch[2] ?? "" });
      i += 1;
      continue;
    }

    // Unordered list. A list block is a run of consecutive `- ` / `* ` / `+ `
    // lines; we don't support nested lists in v1.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    // Blank line — paragraph break, no emit.
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // Paragraph: consume until blank line or the start of another block.
    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (
        /^\s*$/.test(next) ||
        /^(```|~~~)/.test(next) ||
        /^#{1,6}\s+/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      i += 1;
    }
    out.push({ kind: "p", text: paragraphLines.join("\n") });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline parser. Runs on already-HTML-escaped text.
// ---------------------------------------------------------------------------

/**
 * Safely turn one line/paragraph of markdown into a React node tree. We
 * escape every byte of untrusted input first, then apply a fixed-length
 * cascade of regex passes — each pass only emits allowlisted elements.
 */
function renderInline(text: string): ReactNode {
  // The inline parser tokenizes into segments. Each segment is either a raw
  // string or a ReactNode (a `<code>`, `<strong>`, `<em>`, or `<a>`). We walk
  // the input and peel off the leftmost match at each step.
  const segments: ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  type Kind = "code" | "link" | "bold" | "italic";
  interface Candidate {
    kind: Kind;
    prefix: string;
    consumed: number;
    body: string;
    href?: string;
  }

  // Order matters: `code` has highest precedence so backtick contents never
  // get further parsed; then links; then bold (because `**` would otherwise
  // be eaten as two italics); then italic.
  while (remaining.length > 0) {
    const candidates: Candidate[] = [];

    const codeMatch = /^([\s\S]*?)`([^`\n]+?)`/.exec(remaining);
    if (codeMatch) {
      candidates.push({
        kind: "code",
        prefix: codeMatch[1] ?? "",
        consumed: codeMatch[0].length,
        body: codeMatch[2] ?? "",
      });
    }

    const linkMatch = /^([\s\S]*?)\[([^\]\n]+?)\]\(([^)\s]+?)\)/.exec(remaining);
    if (linkMatch) {
      candidates.push({
        kind: "link",
        prefix: linkMatch[1] ?? "",
        consumed: linkMatch[0].length,
        body: linkMatch[2] ?? "",
        href: linkMatch[3] ?? "",
      });
    }

    const boldMatch = /^([\s\S]*?)(\*\*|__)([^\s][\s\S]*?[^\s]|[^\s])\2/.exec(remaining);
    if (boldMatch) {
      candidates.push({
        kind: "bold",
        prefix: boldMatch[1] ?? "",
        consumed: boldMatch[0].length,
        body: boldMatch[3] ?? "",
      });
    }

    const italicMatch =
      /^([\s\S]*?)(?:\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*|_([^\s_][\s\S]*?[^\s_]|[^\s_])_)/.exec(
        remaining,
      );
    if (italicMatch) {
      candidates.push({
        kind: "italic",
        prefix: italicMatch[1] ?? "",
        consumed: italicMatch[0].length,
        body: italicMatch[2] ?? italicMatch[3] ?? "",
      });
    }

    if (candidates.length === 0) {
      segments.push(remaining);
      break;
    }

    // Pick the match whose prefix is shortest — i.e., the earliest hit in
    // the remaining string. This avoids reading `*a* **b**` as a bold that
    // starts after the italic.
    candidates.sort((a, b) => a.prefix.length - b.prefix.length);
    const chosen = candidates[0];
    if (!chosen) {
      segments.push(remaining);
      break;
    }
    if (chosen.prefix) segments.push(chosen.prefix);

    if (chosen.kind === "code") {
      segments.push(
        <code key={`md-${keyCounter++}`} className="pilot-md-inline-code">
          {chosen.body}
        </code>,
      );
    } else if (chosen.kind === "link") {
      const href = sanitizeUrl(chosen.href ?? "");
      if (href === null) {
        // Unsafe URL — drop the link syntax, keep the label as plain text so
        // the user still sees what the model wanted to link.
        segments.push(chosen.body);
      } else {
        segments.push(
          <a
            key={`md-${keyCounter++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="pilot-md-link"
          >
            {chosen.body}
          </a>,
        );
      }
    } else if (chosen.kind === "bold") {
      segments.push(<strong key={`md-${keyCounter++}`}>{renderInline(chosen.body)}</strong>);
    } else {
      segments.push(<em key={`md-${keyCounter++}`}>{renderInline(chosen.body)}</em>);
    }

    remaining = remaining.slice(chosen.consumed);
  }

  return segments;
}

/**
 * Allowlist URL sanitizer. Accepts only `http(s):`, `mailto:`, and
 * relative/anchor paths. Returns `null` for anything else (including
 * `javascript:`, `data:`, `file:`). Trims whitespace and case-folds the
 * scheme before comparing so `JaVaScRiPt:` can't slip through.
 */
function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Protocol-less URLs — relative paths, fragments, queries — are safe: the
  // browser resolves them against the page origin.
  if (/^[/#?]/.test(trimmed)) return trimmed;
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!schemeMatch || !schemeMatch[1]) {
    // No scheme — treat as relative. Allow.
    return trimmed;
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto") {
    return trimmed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Block renderer.
// ---------------------------------------------------------------------------

function BlockNode(props: { block: Block }): ReactElement | null {
  const { block } = props;
  switch (block.kind) {
    case "p":
      return <p className="pilot-md-p">{renderInline(block.text)}</p>;
    case "h":
      if (block.level === 1) return <h3 className="pilot-md-h1">{renderInline(block.text)}</h3>;
      if (block.level === 2) return <h4 className="pilot-md-h2">{renderInline(block.text)}</h4>;
      return <h5 className="pilot-md-h3">{renderInline(block.text)}</h5>;
    case "ul":
      return (
        <ul className="pilot-md-ul">
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional and never reorder.
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="pilot-md-ol">
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional and never reorder.
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "code":
      return <CodeBlock lang={block.lang} body={block.body} />;
    case "hr":
      return <hr className="pilot-md-hr" />;
  }
}

/**
 * Fenced code block with a hover-revealed copy button. The copy action uses
 * the async clipboard API; falls back to a text-selection hint if unavailable
 * (we just don't show the button in that case — see effect).
 */
function CodeBlock(props: { lang: string; body: string }): ReactElement {
  const { lang, body } = props;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [body]);

  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;

  return (
    <pre className="pilot-md-pre" data-lang={lang || undefined}>
      {canCopy ? (
        <button
          type="button"
          className="pilot-md-copy"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
      <code>{body}</code>
    </pre>
  );
}
