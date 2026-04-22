import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPilotProtocol } from "./pilot-protocol-loader.js";

describe("loadPilotProtocol", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agentickit-pilot-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns null when the directory is absent", () => {
    expect(loadPilotProtocol({ cwd: tmpRoot })).toBeNull();
  });

  it("composes RESOLVER.md plus each skill in alphabetical order", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    mkdirSync(join(pilotDir, "skills", "todos"), { recursive: true });
    mkdirSync(join(pilotDir, "skills", "chart"), { recursive: true });

    writeFileSync(join(pilotDir, "RESOLVER.md"), "# Todo Resolver\n\nPersona line.");
    writeFileSync(
      join(pilotDir, "skills", "todos", "SKILL.md"),
      "---\nname: todos\ndescription: Manage todos.\n---\n\nTodos body text.",
    );
    writeFileSync(
      join(pilotDir, "skills", "chart", "SKILL.md"),
      "---\nname: chart\ndescription: Control the chart panel.\n---\n\nChart body text.",
    );

    const result = loadPilotProtocol({ cwd: tmpRoot });

    expect(result).not.toBeNull();
    const text = result as string;
    expect(text).toContain("# Todo Resolver");
    expect(text).toContain("Persona line.");
    expect(text.indexOf("## Skill: chart")).toBeLessThan(text.indexOf("## Skill: todos"));
    expect(text).toContain("Control the chart panel.");
    expect(text).toContain("Todos body text.");
  });

  it("skips a malformed SKILL.md without throwing", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    mkdirSync(join(pilotDir, "skills", "broken"), { recursive: true });
    mkdirSync(join(pilotDir, "skills", "good"), { recursive: true });

    writeFileSync(join(pilotDir, "skills", "broken", "SKILL.md"), "no frontmatter here");
    writeFileSync(
      join(pilotDir, "skills", "good", "SKILL.md"),
      "---\nname: good\ndescription: Good one.\n---\n\nOK.",
    );

    const result = loadPilotProtocol({ cwd: tmpRoot });
    expect(result).not.toBeNull();
    expect(result).toContain("## Skill: good");
    expect(result).not.toContain("## Skill: broken");
  });

  it("honors a custom dir override", () => {
    const pilotDir = join(tmpRoot, "custom-pilot");
    mkdirSync(pilotDir, { recursive: true });
    writeFileSync(join(pilotDir, "RESOLVER.md"), "# Custom");
    expect(loadPilotProtocol({ cwd: tmpRoot, dir: "custom-pilot" })).toContain("# Custom");
    expect(loadPilotProtocol({ cwd: tmpRoot })).toBeNull();
  });
});
