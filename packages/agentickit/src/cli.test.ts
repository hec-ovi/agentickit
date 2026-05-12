import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlaceholders,
  findTemplatesDir,
  insertSkillRow,
  isValidSkillName,
  isValidSkillType,
  listAgentManifests,
  listSkillManifests,
  parseAddSkillArgs,
  run,
  SKILL_TYPES,
  toCamelCase,
  toPascalCase,
} from "./cli.js";
import { parseSkill } from "./protocol/skill.js";

function fakeArgv(...command: string[]): string[] {
  return ["/usr/bin/node", "/path/to/agentickit/cli.js", ...command];
}

/**
 * Production-ready CLI test suite. Every command path, every flag, every
 * refusal-to-overwrite case, every type variant. The user has stated they
 * will not manually verify these — the suite must be airtight.
 */
describe("agentickit CLI", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agentickit-cli-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------------

  describe("init", () => {
    it("creates .pilot/ with RESOLVER.md and an example skill", async () => {
      const result = await run(fakeArgv("init"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("✓ .pilot/ scaffolded");

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

    it("emits a SKILL.md the runtime parser accepts", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "example", "SKILL.md"),
        "utf8",
      );
      const parsed = parseSkill(skill);
      expect(parsed.frontmatter.name).toBe("example");
      expect(parsed.frontmatter.description).toBeTruthy();
    });

    it("refuses to overwrite an existing .pilot/ folder", async () => {
      mkdirSync(join(tmpRoot, ".pilot"), { recursive: true });
      const result = await run(fakeArgv("init"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("already exists");
      expect(result.stderr).toContain("Refusing to overwrite");
    });

    it("rejects positional arguments", async () => {
      const result = await run(fakeArgv("init", "extra-arg"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("init takes no arguments");
    });

    it("output hints at next steps including --type and list-skills", async () => {
      const result = await run(fakeArgv("init"), tmpRoot);
      expect(result.stdout).toContain("npx agentickit add-skill");
      expect(result.stdout).toContain("--type server-tool");
      expect(result.stdout).toContain("--type ui-component");
      expect(result.stdout).toContain("list-skills");
    });
  });

  // -------------------------------------------------------------------------
  // add-skill (custom, --type text)
  // -------------------------------------------------------------------------

  describe("add-skill (custom, --type text)", () => {
    beforeEach(async () => {
      // Every add-skill test starts from an initialized project.
      await run(fakeArgv("init"), tmpRoot);
    });

    it("creates a new skill and appends a RESOLVER row (default type is text)", async () => {
      // Use a name that does NOT match a stock template (chart and
      // web-search would route through the stock-install path instead).
      const result = await run(fakeArgv("add-skill", "billing"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skill "billing" scaffolded');
      expect(result.stdout).toContain("type: text");

      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "billing", "SKILL.md"),
        "utf8",
      );
      expect(skill).toContain("name: billing");

      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).toContain("`skills/billing/SKILL.md`");
    });

    it("emits a parser-acceptable SKILL.md for --type text", async () => {
      await run(fakeArgv("add-skill", "billing"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "billing", "SKILL.md"),
        "utf8",
      );
      const parsed = parseSkill(skill);
      expect(parsed.frontmatter.name).toBe("billing");
    });

    it("does not create hook files for --type text", async () => {
      await run(fakeArgv("add-skill", "billing", "--type", "text"), tmpRoot);
      expect(existsSync(join(tmpRoot, "src", "plugins", "billing.tsx"))).toBe(false);
      expect(existsSync(join(tmpRoot, "server", "billing", "index.ts"))).toBe(false);
    });

    it("refuses a duplicate skill name", async () => {
      await run(fakeArgv("add-skill", "billing"), tmpRoot);
      const second = await run(fakeArgv("add-skill", "billing"), tmpRoot);
      expect(second.exitCode).toBe(2);
      expect(second.stderr).toContain('Skill "billing" already exists');
    });

    it("rejects non-kebab-case names", async () => {
      const upper = await run(fakeArgv("add-skill", "Chart"), tmpRoot);
      expect(upper.exitCode).toBe(1);
      expect(upper.stderr).toContain("Invalid skill name");

      const underscore = await run(fakeArgv("add-skill", "my_skill"), tmpRoot);
      expect(underscore.exitCode).toBe(1);

      const empty = await run(fakeArgv("add-skill"), tmpRoot);
      expect(empty.exitCode).toBe(1);
    });

    it("rejects unknown --type values", async () => {
      const result = await run(fakeArgv("add-skill", "x", "--type", "wat"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --type value: "wat"');
      expect(result.stderr).toContain("text, server-tool, ui-component");
    });

    it("requires .pilot/ to exist first", async () => {
      const fresh = mkdtempSync(join(tmpdir(), "agentickit-no-pilot-"));
      try {
        const result = await run(fakeArgv("add-skill", "chart"), fresh);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain(".pilot/ not found");
        expect(result.stderr).toContain("agentickit init");
      } finally {
        rmSync(fresh, { recursive: true, force: true });
      }
    });

    it("supports --type=value (equals form)", async () => {
      const result = await run(fakeArgv("add-skill", "billing", "--type=text"), tmpRoot);
      expect(result.exitCode).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // add-skill (custom, --type server-tool)
  // -------------------------------------------------------------------------

  describe("add-skill (custom, --type server-tool)", () => {
    beforeEach(async () => {
      await run(fakeArgv("init"), tmpRoot);
    });

    it("scaffolds SKILL.md + plugin stub + server endpoint stub", async () => {
      const result = await run(
        fakeArgv("add-skill", "support-search", "--type", "server-tool"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("type: server-tool");

      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "support-search", "SKILL.md"),
        "utf8",
      );
      expect(skill).toContain("name: support-search");

      const plugin = readFileSync(
        join(tmpRoot, "src", "plugins", "support-search.tsx"),
        "utf8",
      );
      // Camel-case identifier derived from kebab-case name.
      expect(plugin).toContain("supportSearch");
      // Pascal-case for component name.
      expect(plugin).toContain("SupportSearchPlugin");
      expect(plugin).toContain("usePilotAction");

      const server = readFileSync(
        join(tmpRoot, "server", "support-search", "index.ts"),
        "utf8",
      );
      expect(server).toContain("supportSearchRoute");
      expect(server).toContain("/api/support-search");
    });

    it("plugin stub references the correct endpoint URL", async () => {
      await run(fakeArgv("add-skill", "weather-check", "--type", "server-tool"), tmpRoot);
      const plugin = readFileSync(
        join(tmpRoot, "src", "plugins", "weather-check.tsx"),
        "utf8",
      );
      expect(plugin).toContain('"/api/weather-check"');
    });

    it("RESOLVER row points to the new skill path", async () => {
      await run(fakeArgv("add-skill", "search", "--type", "server-tool"), tmpRoot);
      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).toContain("`skills/search/SKILL.md`");
    });

    it("refuses to overwrite an existing plugin file", async () => {
      mkdirSync(join(tmpRoot, "src", "plugins"), { recursive: true });
      writeFileSync(join(tmpRoot, "src", "plugins", "billing.tsx"), "// pre-existing");
      const result = await run(
        fakeArgv("add-skill", "billing", "--type", "server-tool"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Refusing to overwrite");
      expect(result.stderr).toContain("src/plugins/billing.tsx");
      // The skill folder was NOT created either (atomic refusal).
      expect(existsSync(join(tmpRoot, ".pilot", "skills", "billing"))).toBe(false);
    });

    it("refuses to overwrite an existing server endpoint file", async () => {
      mkdirSync(join(tmpRoot, "server", "billing"), { recursive: true });
      writeFileSync(join(tmpRoot, "server", "billing", "index.ts"), "// pre-existing");
      const result = await run(
        fakeArgv("add-skill", "billing", "--type", "server-tool"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("server/billing/index.ts");
    });
  });

  // -------------------------------------------------------------------------
  // add-skill (custom, --type ui-component)
  // -------------------------------------------------------------------------

  describe("add-skill (custom, --type ui-component)", () => {
    beforeEach(async () => {
      await run(fakeArgv("init"), tmpRoot);
    });

    it("scaffolds SKILL.md + plugin with show/hide actions", async () => {
      const result = await run(
        fakeArgv("add-skill", "metrics-panel", "--type", "ui-component"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("type: ui-component");

      const plugin = readFileSync(
        join(tmpRoot, "src", "plugins", "metrics-panel.tsx"),
        "utf8",
      );
      expect(plugin).toContain("show_metricsPanel");
      expect(plugin).toContain("hide_metricsPanel");
      expect(plugin).toContain("MetricsPanelPlugin");
      expect(plugin).toContain("MetricsPanelPanel");
      expect(plugin).toContain("usePilotState");
    });

    it("does NOT create a server endpoint for --type ui-component", async () => {
      await run(fakeArgv("add-skill", "panel", "--type", "ui-component"), tmpRoot);
      expect(existsSync(join(tmpRoot, "server", "panel"))).toBe(false);
    });

    it("SKILL.md frontmatter lists both show_ and hide_ actions in tools", async () => {
      await run(fakeArgv("add-skill", "panel", "--type", "ui-component"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "panel", "SKILL.md"),
        "utf8",
      );
      const parsed = parseSkill(skill);
      expect(parsed.frontmatter.tools).toContain("show_panel");
      expect(parsed.frontmatter.tools).toContain("hide_panel");
    });
  });

  // -------------------------------------------------------------------------
  // add-skill (stock install)
  // -------------------------------------------------------------------------

  describe("add-skill (stock install)", () => {
    beforeEach(async () => {
      await run(fakeArgv("init"), tmpRoot);
    });

    it("installs the stock 'web-search' skill including hook code", async () => {
      const result = await run(fakeArgv("add-skill", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stock skill "web-search" installed');
      expect(result.stdout).toContain("type: server-tool");

      // SKILL.md goes to .pilot/.
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "web-search", "SKILL.md"),
        "utf8",
      );
      expect(skill).toContain("name: web-search");
      expect(skill).toContain("search_serper");

      // Hook code goes to conventional locations.
      expect(existsSync(join(tmpRoot, "server", "web-search", "index.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "server", "web-search", "duckduckgo.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "server", "web-search", "tavily.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "server", "web-search", "firecrawl.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "server", "web-search", "serper.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "server", "web-search", "types.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "src", "plugins", "web-search.tsx"))).toBe(true);

      // RESOLVER row uses the manifest's trigger hint (NOT the placeholder).
      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).toContain("search the web");
      expect(resolver).toContain("`skills/web-search/SKILL.md`");
      expect(resolver).not.toContain("<replace this with the trigger for `web-search`>");

      // Env-var stubs land in .env.example.
      const env = readFileSync(join(tmpRoot, ".env.example"), "utf8");
      expect(env).toContain("TAVILY_API_KEY");
      expect(env).toContain("FIRECRAWL_API_KEY");
      expect(env).toContain("SERPER_API_KEY");
    });

    it("installs the stock 'chart' skill (ui-component) including the React plugin", async () => {
      const result = await run(fakeArgv("add-skill", "chart"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stock skill "chart" installed');
      expect(result.stdout).toContain("type: ui-component");

      const plugin = readFileSync(join(tmpRoot, "src", "plugins", "chart.tsx"), "utf8");
      expect(plugin).toContain("ChartPlugin");
      expect(plugin).toContain("ChartPanel");

      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).toContain("`skills/chart/SKILL.md`");
    });

    it("accepts --type matching the stock manifest's type", async () => {
      const result = await run(
        fakeArgv("add-skill", "web-search", "--type", "server-tool"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);
    });

    it("errors when --type conflicts with the stock manifest's type", async () => {
      const result = await run(
        fakeArgv("add-skill", "web-search", "--type", "ui-component"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Stock skill "web-search" is type "server-tool"');
      expect(result.stderr).toContain("cannot override with --type ui-component");
    });

    it("refuses to overwrite if any stock target file already exists", async () => {
      mkdirSync(join(tmpRoot, "src", "plugins"), { recursive: true });
      writeFileSync(join(tmpRoot, "src", "plugins", "web-search.tsx"), "// pre-existing");
      const result = await run(fakeArgv("add-skill", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Refusing to overwrite");
      expect(result.stderr).toContain("src/plugins/web-search.tsx");
      // Other files were NOT created either (atomic conflict check).
      expect(existsSync(join(tmpRoot, "server", "web-search"))).toBe(false);
      expect(existsSync(join(tmpRoot, ".pilot", "skills", "web-search"))).toBe(false);
    });

    it("appends env-var stubs idempotently when .env.example pre-exists", async () => {
      writeFileSync(join(tmpRoot, ".env.example"), "EXISTING_VAR=keep-me\n");
      const result = await run(fakeArgv("add-skill", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(0);
      const env = readFileSync(join(tmpRoot, ".env.example"), "utf8");
      expect(env).toContain("EXISTING_VAR=keep-me");
      expect(env).toContain("TAVILY_API_KEY");
    });
  });

  // -------------------------------------------------------------------------
  // list-skills
  // -------------------------------------------------------------------------

  describe("list-skills", () => {
    it("lists every stock skill manifest with type and title", async () => {
      const result = await run(fakeArgv("list-skills"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Stock skills");
      expect(result.stdout).toContain("web-search");
      expect(result.stdout).toContain("[server-tool]");
      expect(result.stdout).toContain("chart");
      expect(result.stdout).toContain("[ui-component]");
    });

    it("hints at the install command and the custom-skill path", async () => {
      const result = await run(fakeArgv("list-skills"), tmpRoot);
      expect(result.stdout).toContain("npx agentickit add-skill <name>");
      expect(result.stdout).toContain("CUSTOM skill");
      expect(result.stdout).toContain("--type");
    });

    it("rejects positional arguments", async () => {
      const result = await run(fakeArgv("list-skills", "extra"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("list-skills takes no arguments");
    });
  });

  // -------------------------------------------------------------------------
  // list-agents (kept; covered briefly to make sure refactor didn't break)
  // -------------------------------------------------------------------------

  describe("list-agents", () => {
    it("lists chat and observational templates", async () => {
      const result = await run(fakeArgv("list-agents"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("chat");
      expect(result.stdout).toContain("observational");
    });
  });

  // -------------------------------------------------------------------------
  // add-agent (kept; ensure the refactor didn't change its behavior)
  // -------------------------------------------------------------------------

  describe("add-agent", () => {
    it("scaffolds a chat agent with placeholder substitution", async () => {
      const result = await run(fakeArgv("add-agent", "support-bot", "--type", "chat"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Agent "support-bot"');
      // Chat manifest writes server/{{NAME}}-agent.ts and src/agents/{{NAME}}-agent.tsx.
      const serverFile = readFileSync(
        join(tmpRoot, "server", "support-bot-agent.ts"),
        "utf8",
      );
      expect(serverFile).toContain("supportBot");
      const clientFile = readFileSync(
        join(tmpRoot, "src", "agents", "support-bot-agent.tsx"),
        "utf8",
      );
      expect(clientFile).toContain("SupportBot");
    });

    it("defaults to --type chat when type is omitted", async () => {
      const result = await run(fakeArgv("add-agent", "billing"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("type: chat");
    });
  });

  // -------------------------------------------------------------------------
  // help / version / unknown command
  // -------------------------------------------------------------------------

  describe("top-level dispatch", () => {
    it("prints help on --help", async () => {
      const result = await run(fakeArgv("--help"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("agentickit");
      expect(result.stdout).toContain("add-skill");
      expect(result.stdout).toContain("list-skills");
      expect(result.stdout).toContain("--type");
    });

    it("prints help to stdout and exits 1 when no command is given", async () => {
      const result = await run(fakeArgv(), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Usage:");
    });

    it("prints version with --version (and matches package.json exactly)", async () => {
      // Read package.json directly so this test fails the moment cli.ts and
      // package.json drift. Catches the regression where VERSION was hardcoded
      // to "0.0.0" and the published bin reported the wrong version forever.
      const here = dirname(fileURLToPath(import.meta.url));
      const pkgPath = join(here, "..", "package.json");
      const pkgVersion = (
        JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }
      ).version;
      const result = await run(fakeArgv("--version"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`agentickit ${pkgVersion}`);
    });

    it("errors on unknown command", async () => {
      const result = await run(fakeArgv("hithere"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });

    it("does NOT recognize the deleted `add-tool` command (defensive)", async () => {
      const result = await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });

    it("does NOT recognize the deleted `list-tools` command (defensive)", async () => {
      const result = await run(fakeArgv("list-tools"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  // -------------------------------------------------------------------------
  // Pure-function unit tests (exported helpers)
  // -------------------------------------------------------------------------

  describe("isValidSkillName", () => {
    it.each(["chart", "detail-form", "x", "thing-1", "ab-cd-ef"])("accepts %s", (name) => {
      expect(isValidSkillName(name)).toBe(true);
    });
    it.each(["", "Chart", "1chart", "_chart", "my_skill", "-leading", "trailing-", "with space"])(
      "rejects %s",
      (name) => {
        expect(isValidSkillName(name)).toBe(false);
      },
    );
  });

  describe("isValidSkillType", () => {
    it.each(SKILL_TYPES)("accepts %s", (type) => {
      expect(isValidSkillType(type)).toBe(true);
    });
    it.each(["tool", "skill", "ui", "TEXT", "server", ""])("rejects %s", (type) => {
      expect(isValidSkillType(type)).toBe(false);
    });
  });

  describe("parseAddSkillArgs", () => {
    it("parses a bare name (no --type)", () => {
      expect(parseAddSkillArgs(["chart"])).toEqual({ name: "chart", type: undefined });
    });
    it("parses --type space-separated", () => {
      expect(parseAddSkillArgs(["chart", "--type", "ui-component"])).toEqual({
        name: "chart",
        type: "ui-component",
      });
    });
    it("parses --type=value", () => {
      expect(parseAddSkillArgs(["chart", "--type=server-tool"])).toEqual({
        name: "chart",
        type: "server-tool",
      });
    });
    it("errors when --type is the last token with no value", () => {
      const r = parseAddSkillArgs(["chart", "--type"]);
      expect(r.error).toBeDefined();
      expect(r.error).toContain("--type requires a value");
    });
    it("errors when no positional name is provided", () => {
      expect(parseAddSkillArgs([]).error).toContain("Usage:");
      expect(parseAddSkillArgs(["--type", "text"]).error).toContain("Usage:");
    });
    it("errors when more than one positional arg is provided", () => {
      expect(parseAddSkillArgs(["a", "b"]).error).toContain("Usage:");
    });
  });

  describe("insertSkillRow", () => {
    it("creates the Skills section if absent", () => {
      const out = insertSkillRow("# Persona\n\nYou are helpful.\n", "chart");
      expect(out).toContain("## Skills");
      expect(out).toContain("`skills/chart/SKILL.md`");
    });

    it("appends to an existing Skills table preserving prior rows", () => {
      const initial = [
        "## Skills",
        "",
        "| Trigger | Skill |",
        "| ------- | ----- |",
        "| do this | `skills/existing/SKILL.md` |",
        "",
      ].join("\n");
      const out = insertSkillRow(initial, "chart");
      expect(out).toContain("`skills/existing/SKILL.md`");
      expect(out).toContain("`skills/chart/SKILL.md`");
      // New row appears AFTER the existing one.
      expect(out.indexOf("`skills/chart/SKILL.md`")).toBeGreaterThan(
        out.indexOf("`skills/existing/SKILL.md`"),
      );
    });

    it("uses the placeholder trigger when no triggerHint is provided", () => {
      const out = insertSkillRow("", "chart");
      expect(out).toContain("<replace this with the trigger for `chart`>");
    });

    it("uses the manifest trigger when triggerHint is provided", () => {
      const out = insertSkillRow("", "web-search", "search the web, look up");
      expect(out).toContain("| search the web, look up |");
      expect(out).not.toContain("<replace this");
    });

    it("creates a table inside an empty Skills section if the section header exists alone", () => {
      const initial = "## Skills\n";
      const out = insertSkillRow(initial, "chart");
      expect(out).toContain("| Trigger | Skill |");
      expect(out).toContain("`skills/chart/SKILL.md`");
    });
  });

  describe("toPascalCase / toCamelCase", () => {
    it.each([
      ["support-bot", "SupportBot", "supportBot"],
      ["billing", "Billing", "billing"],
      ["a-b-c", "ABC", "aBC"],
      ["multi-word-thing", "MultiWordThing", "multiWordThing"],
    ])("%s -> %s / %s", (input, pascal, camel) => {
      expect(toPascalCase(input)).toBe(pascal);
      expect(toCamelCase(input)).toBe(camel);
    });
  });

  describe("applyPlaceholders", () => {
    it("substitutes all three placeholder forms", () => {
      const tpl = "{{NAME}}-{{NAME_PASCAL}}-{{NAME_CAMEL}}";
      expect(applyPlaceholders(tpl, "support-bot")).toBe("support-bot-SupportBot-supportBot");
    });

    it("leaves unrelated text alone", () => {
      expect(applyPlaceholders("hello world", "x")).toBe("hello world");
    });
  });

  describe("findTemplatesDir + listSkillManifests + listAgentManifests", () => {
    it("finds the bundled templates directory", () => {
      const dir = findTemplatesDir();
      expect(existsSync(join(dir, "skills"))).toBe(true);
      expect(existsSync(join(dir, "agents"))).toBe(true);
    });

    it("listSkillManifests returns at least the two stock skills", async () => {
      const manifests = await listSkillManifests();
      const names = manifests.map((m) => m.name).sort();
      expect(names).toContain("web-search");
      expect(names).toContain("chart");
      // Each manifest carries a recognized type.
      for (const m of manifests) {
        expect(SKILL_TYPES).toContain(m.type);
      }
    });

    it("each stock skill manifest declares a SKILL.md and a resolverRow", async () => {
      const manifests = await listSkillManifests();
      for (const m of manifests) {
        expect(m.skill).toBeTruthy();
        expect(m.skill.from).toBeTruthy();
        expect(m.skill.to).toMatch(/^\.pilot\/skills\/.+\/SKILL\.md$/);
        expect(m.resolverRow).toBeTruthy();
        expect(m.resolverRow.trigger).toBeTruthy();
      }
    });

    it("listAgentManifests still returns chat + observational", async () => {
      const manifests = await listAgentManifests();
      const names = manifests.map((m) => m.name).sort();
      expect(names).toContain("chat");
      expect(names).toContain("observational");
    });
  });
});
