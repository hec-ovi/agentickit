import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPilotProtocol } from "@hec-ovi/agentickit/server";
import { parseSkill } from "@hec-ovi/agentickit/protocol";

/**
 * End-to-end check that travel's `.pilot/` folder loads cleanly through
 * the real `loadPilotProtocol`. Catches regressions where:
 *   - A skill was added under skills/ but not referenced in RESOLVER.md
 *     (orphan).
 *   - RESOLVER.md references a skill whose file is missing.
 *   - A SKILL.md is malformed (frontmatter parse fails).
 *
 * The travel app's own server handler relies on this being warning-free
 * on every restart; this test pins the invariant in CI.
 */

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = join(here, "..");
const pilotDir = join(exampleRoot, ".pilot");

describe("examples/travel/.pilot/ — protocol load", () => {
  it(".pilot/ folder exists at the example root", () => {
    expect(existsSync(pilotDir)).toBe(true);
    expect(existsSync(join(pilotDir, "RESOLVER.md"))).toBe(true);
    expect(existsSync(join(pilotDir, "skills"))).toBe(true);
  });

  it("loadPilotProtocol returns a string containing the RESOLVER body and every skill body", () => {
    const warnings: string[] = [];
    const result = loadPilotProtocol({ cwd: exampleRoot, onWarn: (m) => warnings.push(m) });

    expect(result).not.toBeNull();
    const text = result as string;

    // RESOLVER body is present (top of the prompt).
    expect(text).toContain("Travel Concierge");
    expect(text).toContain("trip-style-guide");

    // Every SKILL.md body that ships under skills/ is present in the
    // composed prompt (no orphans, no missing).
    const skillNames = readdirSync(join(pilotDir, "skills"));
    for (const name of skillNames) {
      const skillPath = join(pilotDir, "skills", name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const md = readFileSync(skillPath, "utf8");
      const { frontmatter } = parseSkill(md);
      // Each rendered skill section starts with `## Skill: <name>`.
      expect(text).toContain(`## Skill: ${frontmatter.name}`);
    }

    // No warnings means: no orphans, no missing files, RESOLVER parsed
    // cleanly. This is the production invariant.
    expect(warnings).toEqual([]);
  });

  it("RESOLVER references every skill on disk and every referenced skill exists", () => {
    const warnings: string[] = [];
    loadPilotProtocol({ cwd: exampleRoot, onWarn: (m) => warnings.push(m) });

    const orphans = warnings.filter((w) => w.includes("Orphan skill"));
    const missing = warnings.filter((w) => w.includes("missing"));

    expect(orphans, `Unexpected orphan skill warnings:\n${orphans.join("\n")}`).toEqual([]);
    expect(missing, `Unexpected missing-file warnings:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every SKILL.md parses cleanly (frontmatter + body)", () => {
    const skillNames = readdirSync(join(pilotDir, "skills"));
    expect(skillNames.length).toBeGreaterThan(0);

    for (const name of skillNames) {
      const skillPath = join(pilotDir, "skills", name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const md = readFileSync(skillPath, "utf8");
      const parsed = parseSkill(md);
      expect(parsed.frontmatter.name, `${name}/SKILL.md`).toBeTruthy();
      expect(parsed.frontmatter.description, `${name}/SKILL.md`).toBeTruthy();
      // Every fat skill we ship has a non-trivial body (not just frontmatter).
      expect(parsed.body.length, `${name}/SKILL.md body`).toBeGreaterThan(50);
    }
  });

  it("composed prompt is non-trivial in size (real fat-skill content)", () => {
    const result = loadPilotProtocol({ cwd: exampleRoot });
    expect(result).not.toBeNull();
    // Floor of ~5KB ensures we did not accidentally regress to thin
    // descriptions or empty bodies. Travel's actual composed prompt is
    // ~15-25KB depending on how many skills are mounted; the floor is
    // comfortably below that.
    expect((result as string).length).toBeGreaterThan(5_000);
  });
});
