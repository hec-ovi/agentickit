import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertSkillRow, isValidSkillName, run } from "./cli.js";
import { parseSkill } from "./protocol/skill.js";

function fakeArgv(...command: string[]): string[] {
  return ["/usr/bin/node", "/path/to/agentickit/cli.js", ...command];
}

describe("agentickit CLI", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agentickit-cli-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("init", () => {
    it("creates .pilot/ with RESOLVER.md and an example skill", async () => {
      const result = await run(fakeArgv("init"), tmpRoot);
      expect(result.exitCode).toBe(0);

      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "example", "SKILL.md"),
        "utf8",
      );

      expect(resolver).toContain("## Skills");
      expect(resolver).toContain("`skills/example/SKILL.md`");
      expect(skill).toContain("name: example");
      expect(skill).toContain("description:");
    });

    it("emits a SKILL.md that the runtime parser accepts", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "example", "SKILL.md"),
        "utf8",
      );
      const parsed = parseSkill(skill);
      expect(parsed.frontmatter.name).toBe("example");
      expect(parsed.frontmatter.description.length).toBeGreaterThan(0);
      expect(parsed.body.length).toBeGreaterThan(0);
    });

    it("refuses to overwrite an existing .pilot/", async () => {
      mkdirSync(join(tmpRoot, ".pilot"));
      const result = await run(fakeArgv("init"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("already exists");
    });

    it("rejects extra arguments", async () => {
      const result = await run(fakeArgv("init", "stray"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("takes no arguments");
    });
  });

  describe("add-skill", () => {
    it("creates a new skill and appends a resolver row", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const result = await run(fakeArgv("add-skill", "chart"), tmpRoot);
      expect(result.exitCode).toBe(0);

      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "chart", "SKILL.md"),
        "utf8",
      );
      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");

      expect(skill).toContain("name: chart");
      const parsed = parseSkill(skill);
      expect(parsed.frontmatter.name).toBe("chart");

      expect(resolver).toContain("`skills/chart/SKILL.md`");
    });

    it("refuses a duplicate skill name", async () => {
      await run(fakeArgv("init"), tmpRoot);
      await run(fakeArgv("add-skill", "chart"), tmpRoot);
      const result = await run(fakeArgv("add-skill", "chart"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("already exists");
    });

    it("rejects invalid names", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const upper = await run(fakeArgv("add-skill", "Chart"), tmpRoot);
      expect(upper.exitCode).toBe(1);
      expect(upper.stderr).toContain("kebab-case");

      const underscore = await run(fakeArgv("add-skill", "my_skill"), tmpRoot);
      expect(underscore.exitCode).toBe(1);

      const empty = await run(fakeArgv("add-skill"), tmpRoot);
      expect(empty.exitCode).toBe(1);
    });

    it("refuses when .pilot/ doesn't exist", async () => {
      const result = await run(fakeArgv("add-skill", "chart"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("agentickit init");
    });
  });

  describe("help and version", () => {
    it("prints help with --help", async () => {
      const result = await run(fakeArgv("--help"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("add-skill");
    });

    it("prints help (to stdout) and exits 1 when no command is given", async () => {
      const result = await run(fakeArgv(), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Usage:");
    });

    it("prints version with --version", async () => {
      const result = await run(fakeArgv("--version"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/agentickit \d/);
    });

    it("errors on unknown command", async () => {
      const result = await run(fakeArgv("hithere"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  describe("insertSkillRow (pure)", () => {
    it("creates a ## Skills section when absent", () => {
      const updated = insertSkillRow("# Resolver\n\nSome prose.\n", "chart");
      expect(updated).toContain("## Skills");
      expect(updated).toContain("`skills/chart/SKILL.md`");
    });

    it("appends to an existing table under ## Skills", () => {
      const initial = `# R

## Skills

| Trigger | Skill |
| ------- | ----- |
| "foo"   | \`skills/foo/SKILL.md\` |
`;
      const updated = insertSkillRow(initial, "bar");
      const lines = updated.split("\n").filter((l) => l.includes("SKILL.md"));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("foo");
      expect(lines[1]).toContain("bar");
    });

    it("creates a table when ## Skills exists but is empty", () => {
      const initial = "# R\n\n## Skills\n\n";
      const updated = insertSkillRow(initial, "baz");
      expect(updated).toContain("| Trigger | Skill |");
      expect(updated).toContain("`skills/baz/SKILL.md`");
    });
  });

  describe("isValidSkillName", () => {
    it("accepts kebab-case", () => {
      expect(isValidSkillName("chart")).toBe(true);
      expect(isValidSkillName("detail-form")).toBe(true);
      expect(isValidSkillName("x1")).toBe(true);
    });
    it("rejects other shapes", () => {
      expect(isValidSkillName("")).toBe(false);
      expect(isValidSkillName("Chart")).toBe(false);
      expect(isValidSkillName("my_skill")).toBe(false);
      expect(isValidSkillName("1skill")).toBe(false);
      expect(isValidSkillName("-skill")).toBe(false);
      expect(isValidSkillName("skill.name")).toBe(false);
    });
  });
});
