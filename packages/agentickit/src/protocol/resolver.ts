import type { ResolverEntry } from "../types.js";

/**
 * Parse a `.pilot/RESOLVER.md` file into routing entries.
 *
 * Format (from gbrain/Garry Tan's "Thin Harness, Fat Skills" convention):
 * - H2 sections group entries (Always-on, Brain operations, ...).
 * - Each section contains a markdown table with two columns: Trigger | Skill.
 * - Skill column wraps a path in backticks: `skills/<name>/SKILL.md`.
 * - Rows with external pointers (GStack:, Check ..., Read ...) are preserved
 *   but marked with isExternalPointer=true so the runtime can skip them.
 *
 * This is a strict parser by design — consumers author RESOLVER.md by hand
 * and we want clear failures on malformed tables rather than silent drops.
 */
export function parseResolver(content: string): ResolverEntry[] {
  const entries: ResolverEntry[] = [];
  let currentSection = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();

    // Track section heading. `##` only — `#` is the document title.
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch?.[1]) {
      currentSection = headingMatch[1].trim();
      continue;
    }

    // Skip anything that isn't a pipe-delimited table row.
    if (!line.startsWith("|")) continue;
    // Skip the separator row (|---|---|).
    if (line.includes("---")) continue;

    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);

    if (cols.length < 2) continue;

    const trigger = cols[0];
    const skillCol = cols[1];

    if (!trigger || !skillCol) continue;

    // Skip the header row.
    const lowerTrigger = trigger.toLowerCase();
    if (lowerTrigger === "trigger" || lowerTrigger === "skill") continue;

    // External pointers — not a local skill, but we preserve them so
    // the runtime can surface them in the system prompt as context.
    if (
      skillCol.startsWith("GStack:") ||
      skillCol.startsWith("Check ") ||
      skillCol.startsWith("Read ")
    ) {
      entries.push({
        trigger,
        skillPath: skillCol,
        section: currentSection,
        isExternalPointer: true,
      });
      continue;
    }

    // Backtick-wrapped local skill path: `skills/<name>/SKILL.md`
    const pathMatch = skillCol.match(/`(skills\/[^`]+\/SKILL\.md)`/);
    if (pathMatch?.[1]) {
      entries.push({
        trigger,
        skillPath: pathMatch[1],
        section: currentSection,
        isExternalPointer: false,
      });
    }
  }

  return entries;
}
