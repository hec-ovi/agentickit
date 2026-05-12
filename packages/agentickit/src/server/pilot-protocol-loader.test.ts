import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPilotProtocol } from "./pilot-protocol-loader.js";

/**
 * RESOLVER-driven loader contract. Every test captures warnings via the
 * `onWarn` option so the suite never depends on global console state.
 */
describe("loadPilotProtocol", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agentickit-pilot-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function captureWarnings() {
    const warnings: string[] = [];
    return { warnings, onWarn: (msg: string) => warnings.push(msg) };
  }

  function writeResolver(pilotDir: string, body: string): void {
    writeFileSync(join(pilotDir, "RESOLVER.md"), body);
  }

  function writeSkill(pilotDir: string, name: string, frontmatter: string, body: string): void {
    mkdirSync(join(pilotDir, "skills", name), { recursive: true });
    writeFileSync(
      join(pilotDir, "skills", name, "SKILL.md"),
      `---\n${frontmatter}\n---\n\n${body}`,
    );
  }

  it("returns null when the .pilot directory is absent", () => {
    const { warnings, onWarn } = captureWarnings();
    expect(loadPilotProtocol({ cwd: tmpRoot, onWarn })).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("returns null when RESOLVER.md is absent and no skills/ exists", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    mkdirSync(pilotDir, { recursive: true });
    const { warnings, onWarn } = captureWarnings();
    expect(loadPilotProtocol({ cwd: tmpRoot, onWarn })).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("warns and skips loading when skills/ exists but RESOLVER.md is missing", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "todos", "name: todos\ndescription: Manage todos.", "Body");
    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("RESOLVER.md is missing");
    expect(warnings[0]).toContain("npx agentickit init");
  });

  it("loads only skills referenced by RESOLVER.md, in resolver order (NOT alphabetical)", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "todos", "name: todos\ndescription: Manage todos.", "Todos body.");
    writeSkill(pilotDir, "chart", "name: chart\ndescription: Chart panel.", "Chart body.");
    writeSkill(pilotDir, "alpha", "name: alpha\ndescription: Alpha first.", "Alpha body.");
    // Resolver lists them in a deliberate non-alphabetical order so the
    // assertion is unambiguous: order must come from RESOLVER, not sort().
    writeResolver(
      pilotDir,
      [
        "# Persona",
        "",
        "You are a helpful assistant.",
        "",
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| add a todo | `skills/todos/SKILL.md` |",
        "| show me a chart | `skills/chart/SKILL.md` |",
        "| use alpha | `skills/alpha/SKILL.md` |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    const text = result as string;

    // Each skill body present.
    expect(text).toContain("Todos body.");
    expect(text).toContain("Chart body.");
    expect(text).toContain("Alpha body.");

    // RESOLVER body present.
    expect(text).toContain("# Persona");
    expect(text).toContain("You are a helpful assistant.");

    // Order is RESOLVER order (todos -> chart -> alpha), NOT alphabetical
    // (which would have been alpha -> chart -> todos).
    const iTodos = text.indexOf("## Skill: todos");
    const iChart = text.indexOf("## Skill: chart");
    const iAlpha = text.indexOf("## Skill: alpha");
    expect(iTodos).toBeGreaterThan(-1);
    expect(iChart).toBeGreaterThan(iTodos);
    expect(iAlpha).toBeGreaterThan(iChart);

    // No warnings on a clean .pilot/.
    expect(warnings).toEqual([]);
  });

  it("warns and skips a RESOLVER row whose SKILL.md file is missing", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "exists", "name: exists\ndescription: Exists.", "Exists body.");
    writeResolver(
      pilotDir,
      [
        "# Persona",
        "",
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| use the existing one | `skills/exists/SKILL.md` |",
        "| use the missing one | `skills/missing/SKILL.md` |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    expect(result).toContain("Exists body.");
    // The missing skill never gets rendered as its own section. The
    // RESOLVER row's trigger phrase still appears (model sees it), but
    // there is no `## Skill: missing` header because no body was loaded.
    expect(result).not.toMatch(/##\s+Skill:\s+missing/);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("skills/missing/SKILL.md");
    expect(warnings[0]).toContain("missing");
    expect(warnings[0]).toContain("npx agentickit add-skill");
  });

  it("warns about orphan skill folders (on disk but not in RESOLVER)", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "in-resolver", "name: in-resolver\ndescription: Listed.", "Listed body.");
    writeSkill(pilotDir, "orphan-one", "name: orphan-one\ndescription: O1.", "Orphan body 1.");
    writeSkill(pilotDir, "orphan-two", "name: orphan-two\ndescription: O2.", "Orphan body 2.");
    writeResolver(
      pilotDir,
      [
        "# Persona",
        "",
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| use the listed one | `skills/in-resolver/SKILL.md` |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    expect(result).toContain("Listed body.");
    expect(result).not.toContain("Orphan body 1.");
    expect(result).not.toContain("Orphan body 2.");

    // Two orphan warnings, one per unreferenced skill folder.
    expect(warnings).toHaveLength(2);
    const joined = warnings.join("\n");
    expect(joined).toContain("Orphan skill");
    expect(joined).toContain("skills/orphan-one/SKILL.md");
    expect(joined).toContain("skills/orphan-two/SKILL.md");
  });

  it("dedupes a skill referenced by multiple RESOLVER rows; first reference wins", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "dup", "name: dup\ndescription: Duplicated.", "Dup body.");
    writeResolver(
      pilotDir,
      [
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| first reference | `skills/dup/SKILL.md` |",
        "| second reference | `skills/dup/SKILL.md` |",
        "| third reference | `skills/dup/SKILL.md` |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    const text = result as string;

    // The skill body appears exactly once.
    const matches = text.match(/Dup body\./g) ?? [];
    expect(matches).toHaveLength(1);

    // RESOLVER body still appears (model sees all three trigger rows).
    expect(text).toContain("first reference");
    expect(text).toContain("second reference");
    expect(text).toContain("third reference");

    expect(warnings).toEqual([]);
  });

  it("ignores external-pointer rows (GStack:, Check, Read) at load time", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "local", "name: local\ndescription: Local.", "Local body.");
    writeResolver(
      pilotDir,
      [
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| local capability | `skills/local/SKILL.md` |",
        "| office hours | GStack: office-hours |",
        "| external check | Check the team handbook |",
        "| external read | Read the runbook |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    expect(result).toContain("Local body.");
    // External pointers are NOT loaded as skill bodies (no file exists),
    // and they are NOT warned about either (they are intentional).
    expect(warnings).toEqual([]);
    // The RESOLVER body still surfaces them to the model so it knows
    // about the external pointers.
    expect(result).toContain("GStack: office-hours");
    expect(result).toContain("Check the team handbook");
    expect(result).toContain("Read the runbook");
  });

  it("skips a malformed SKILL.md without throwing", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "good", "name: good\ndescription: Good one.", "OK.");
    mkdirSync(join(pilotDir, "skills", "broken"), { recursive: true });
    writeFileSync(join(pilotDir, "skills", "broken", "SKILL.md"), "no frontmatter here");
    writeResolver(
      pilotDir,
      [
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| --- | --- |",
        "| good | `skills/good/SKILL.md` |",
        "| broken | `skills/broken/SKILL.md` |",
      ].join("\n"),
    );

    const { warnings, onWarn } = captureWarnings();
    const result = loadPilotProtocol({ cwd: tmpRoot, onWarn });
    expect(result).not.toBeNull();
    expect(result).toContain("## Skill: good");
    expect(result).not.toContain("## Skill: broken");
    // Malformed SKILL.md is silently skipped (it isn't a missing file, and
    // it isn't an orphan — RESOLVER references it). The render layer drops
    // it. This matches the "best effort, never crash" loader contract.
    expect(warnings).toEqual([]);
  });

  it("honors a custom dir override", () => {
    const pilotDir = join(tmpRoot, "custom-pilot");
    mkdirSync(pilotDir, { recursive: true });
    writeFileSync(join(pilotDir, "RESOLVER.md"), "# Custom\n\n## Skills\n\n| Trigger | Skill |\n| --- | --- |\n");
    expect(loadPilotProtocol({ cwd: tmpRoot, dir: "custom-pilot" })).toContain("# Custom");
    expect(loadPilotProtocol({ cwd: tmpRoot })).toBeNull();
  });

  it("falls back to console.warn when no onWarn handler is provided", () => {
    const pilotDir = join(tmpRoot, ".pilot");
    writeSkill(pilotDir, "orphan", "name: orphan\ndescription: O.", "Body.");
    writeResolver(pilotDir, "## Skills\n\n| Trigger | Skill |\n| --- | --- |\n");

    const original = console.warn;
    const captured: string[] = [];
    console.warn = (msg: unknown): void => {
      captured.push(String(msg));
    };
    try {
      loadPilotProtocol({ cwd: tmpRoot });
    } finally {
      console.warn = original;
    }
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.join("\n")).toContain("Orphan skill");
  });
});
