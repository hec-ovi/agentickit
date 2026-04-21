import type { SkillFrontmatter } from "../types.js";

/**
 * Parse a `.pilot/skills/<name>/SKILL.md` file.
 *
 * Frontmatter is a YAML block delimited by `---`. We intentionally do NOT
 * depend on a full YAML parser — SKILL.md frontmatter is a small, well-defined
 * subset (scalar strings, string lists, booleans, block scalars for description).
 * A mini-parser keeps the package dependency-free on the protocol surface and
 * makes the runtime cost negligible.
 *
 * Accepted fields (superset of Anthropic spec and gbrain convention):
 *   name:          string, required (kebab-case)
 *   description:   string, required (may be a `|` block scalar)
 *   triggers:      list of strings, optional
 *   tools:         list of strings, optional
 *   allowed-tools: list of strings, optional (Anthropic spelling)
 *   mutating:      boolean, optional (defaults to false)
 *   version:       string, optional
 *
 * Anything else is preserved verbatim in the body and ignored by the parser.
 */
export function parseSkill(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("SKILL.md is missing a YAML frontmatter block delimited by ---");
  }

  const rawYaml = frontmatterMatch[1] ?? "";
  const body = (frontmatterMatch[2] ?? "").trim();

  const fm = parseFrontmatterYaml(rawYaml);

  if (!fm.name || typeof fm.name !== "string") {
    throw new Error("SKILL.md frontmatter is missing required field: name");
  }
  if (!fm.description || typeof fm.description !== "string") {
    throw new Error("SKILL.md frontmatter is missing required field: description");
  }

  const frontmatter: SkillFrontmatter = {
    name: fm.name,
    description: fm.description,
    ...(Array.isArray(fm.triggers) && { triggers: fm.triggers }),
    ...(Array.isArray(fm.tools) && { tools: fm.tools }),
    ...(Array.isArray(fm["allowed-tools"]) && { allowedTools: fm["allowed-tools"] as string[] }),
    ...(typeof fm.mutating === "boolean" && { mutating: fm.mutating }),
    ...(typeof fm.version === "string" && { version: fm.version }),
  };

  return { frontmatter, body };
}

interface RawFrontmatter {
  [key: string]: string | string[] | boolean | undefined;
}

/**
 * Mini YAML parser specifically for SKILL.md frontmatter.
 * Handles: scalar `key: value`, list items `- item`, block scalars `key: |`.
 * Does NOT handle: nested maps, anchors, flow-style lists, multiline strings
 * outside block scalars. Those are rejected by design — SKILL.md shouldn't need them.
 */
function parseFrontmatterYaml(yaml: string): RawFrontmatter {
  const out: RawFrontmatter = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    i++;

    // Skip blank lines and comments.
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Top-level `key: value` or `key:` (list/block scalar marker).
    const scalarMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!scalarMatch) continue;

    const key = scalarMatch[1];
    const value = (scalarMatch[2] ?? "").trim();
    if (!key) continue;

    if (value === "") {
      // Either a list follows (- items) or empty value.
      const collected: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? "";
        const listMatch = next.match(/^\s*-\s+(.*)$/);
        if (!listMatch?.[1]) break;
        collected.push(stripQuotes(listMatch[1].trim()));
        i++;
      }
      if (collected.length > 0) {
        out[key] = collected;
      }
      continue;
    }

    if (value === "|" || value === ">") {
      // Block scalar — collect indented continuation lines.
      const blockLines: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (next.match(/^[A-Za-z]/)) break; // next top-level key
        if (next.trim()) blockLines.push(next.replace(/^\s{2}/, ""));
        else blockLines.push("");
        i++;
      }
      out[key] = blockLines.join(value === "|" ? "\n" : " ").trim();
      continue;
    }

    // Plain scalar.
    if (value === "true") {
      out[key] = true;
    } else if (value === "false") {
      out[key] = false;
    } else {
      out[key] = stripQuotes(value);
    }
  }

  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
