import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSkill } from "@hec-ovi/agentickit/protocol";

/**
 * Parity test: every tool name listed in a SKILL.md frontmatter must be
 * something the app actually registers somewhere. This catches the
 * "I wrote a skill that mentions a non-existent tool" class of bug —
 * which is silent in production (the model just never finds the tool)
 * but trivial to detect by grepping the source.
 *
 * The matching is intentionally loose: we just check the tool NAME
 * appears as a registered identifier somewhere under src/. We do not
 * try to verify the schema matches; that is what the runtime does at
 * dispatch time.
 *
 * Auto-registered names (from `usePilotState({ setValue })` and
 * `usePilotForm`) are accepted by pattern.
 */

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = join(here, "..", "..");
const pilotSkillsDir = join(exampleRoot, ".pilot", "skills");
const srcDir = join(exampleRoot, "src");

function listSkillNames(): string[] {
  return readdirSync(pilotSkillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function loadAllSrcFiles(dir: string): string {
  const out: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      // Skip test files and the .pilot/ folder itself.
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      if (entry.name === "__tests__") continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(readFileSync(full, "utf8"));
      }
    }
  }
  walk(dir);
  return out.join("\n");
}

const corpus = loadAllSrcFiles(srcDir);

/**
 * Tool names that don't appear literally in source because they're
 * generated at runtime by the framework (auto-registered by hooks). We
 * accept any tool name matching one of these patterns as "would exist
 * if the corresponding hook is mounted".
 */
function isAutoRegisteredName(name: string): boolean {
  // `usePilotState({ name: X, setValue })` auto-registers `update_X`.
  if (name.startsWith("update_")) return true;
  // `usePilotForm({ name: F })` auto-registers `set_F_field`, `submit_F`, `reset_F`.
  if (name.startsWith("set_") && name.endsWith("_field")) return true;
  if (name.startsWith("submit_") || name.startsWith("reset_")) return true;
  // Provider-auto-registered.
  if (name === "inspect_context") return true;
  return false;
}

function isReferencedInSource(toolName: string): boolean {
  // Match either `name: "<toolName>"` (literal action registration) or
  // a dynamic `${"search_"}<backend>` pattern. We grep the corpus.
  if (corpus.includes(`name: "${toolName}"`)) return true;
  // The web-search plugin builds `search_<backend>` dynamically. Accept
  // any name that begins with `search_` if the dynamic builder pattern is
  // present in source.
  if (toolName.startsWith("search_") && corpus.includes("`search_${backend}`")) return true;
  return false;
}

describe("skills-tool parity", () => {
  it("at least one skill ships and is parseable", () => {
    const names = listSkillNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const skillPath = join(pilotSkillsDir, name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      expect(() => parseSkill(readFileSync(skillPath, "utf8"))).not.toThrow();
    }
  });

  it("every tool listed in a SKILL.md frontmatter is registered (or auto-registered) somewhere in src/", () => {
    const errors: string[] = [];
    for (const name of listSkillNames()) {
      const skillPath = join(pilotSkillsDir, name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const md = readFileSync(skillPath, "utf8");
      const { frontmatter } = parseSkill(md);
      const tools = frontmatter.tools ?? frontmatter.allowedTools ?? [];
      for (const tool of tools) {
        // Skip placeholder tokens emitted by the CLI's --type text scaffold.
        if (tool.startsWith("<")) continue;
        if (isAutoRegisteredName(tool)) continue;
        if (!isReferencedInSource(tool)) {
          errors.push(`  - skill "${name}" references tool "${tool}" but no \`name: "${tool}"\` is registered in src/`);
        }
      }
    }
    expect(
      errors,
      `\nSKILL.md ↔ source drift:\n${errors.join("\n")}\n\nFix by either (a) registering the missing usePilotAction, or (b) editing the SKILL.md tools list.\n`,
    ).toEqual([]);
  });

  it("RESOLVER.md references every skill folder on disk (no orphans)", () => {
    const resolverPath = join(exampleRoot, ".pilot", "RESOLVER.md");
    const resolver = readFileSync(resolverPath, "utf8");
    const orphans: string[] = [];
    for (const name of listSkillNames()) {
      const ref = `\`skills/${name}/SKILL.md\``;
      if (!resolver.includes(ref)) orphans.push(name);
    }
    expect(
      orphans,
      `\nOrphan skills (folder exists but RESOLVER.md does not reference): ${orphans.join(", ")}\n`,
    ).toEqual([]);
  });
});
