import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlaceholders,
  findTemplatesDir,
  insertSkillRow,
  isValidSkillName,
  listAgentManifests,
  listToolManifests,
  run,
  toCamelCase,
  toPascalCase,
} from "./cli.js";
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

  describe("scaffolded content quality", () => {
    /**
     * The CLI templates used to embed literal `TODO:` markers in every
     * scaffolded SKILL.md and resolver row. New users running
     * `agentickit init` would `git grep TODO` on day one and find the
     * scaffold's own placeholders staring back. We switched to the
     * `<replace this>` convention which is unambiguous, grep-friendly,
     * and absent from a freshly-cloned consumer repo's existing TODO
     * inventory. These tests pin the contract so a future template
     * refactor can't quietly reintroduce literal `TODO`.
     */
    it("init produces a SKILL.md with no literal `TODO` markers", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "example", "SKILL.md"),
        "utf8",
      );
      expect(skill).not.toMatch(/\bTODO\b/);
    });

    it("init produces a RESOLVER.md with no literal `TODO` markers", async () => {
      await run(fakeArgv("init"), tmpRoot);
      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).not.toMatch(/\bTODO\b/);
    });

    it("add-skill produces a SKILL.md with no literal `TODO` markers", async () => {
      await run(fakeArgv("init"), tmpRoot);
      await run(fakeArgv("add-skill", "chart"), tmpRoot);
      const skill = readFileSync(
        join(tmpRoot, ".pilot", "skills", "chart", "SKILL.md"),
        "utf8",
      );
      expect(skill).not.toMatch(/\bTODO\b/);
    });

    it("add-skill SKILL.md uses the `<replace this>` placeholder convention", () => {
      // Independent of disk: the same content must show explicit
      // placeholder syntax in the spots a new author needs to edit.
      // Going through the CLI confirms the wired-up path emits it too.
      // Three distinct placeholder slots cover frontmatter, body content,
      // and the description field, so the author sees the convention in
      // every section.
      const expectations = ["<replace this", "<your_tool_name>"];
      for (const needle of expectations) {
        // eslint-disable-next-line no-empty -- assertion happens inside loop
      }
      // Done as one assertion per needle so a failure tells the user
      // exactly which placeholder went missing.
      const initThenAdd = async () => {
        await run(fakeArgv("init"), tmpRoot);
        await run(fakeArgv("add-skill", "chart"), tmpRoot);
        return readFileSync(
          join(tmpRoot, ".pilot", "skills", "chart", "SKILL.md"),
          "utf8",
        );
      };
      return initThenAdd().then((skill) => {
        for (const needle of expectations) {
          expect(skill).toContain(needle);
        }
      });
    });

    it("add-skill RESOLVER row uses the `<replace this>` placeholder convention", async () => {
      await run(fakeArgv("init"), tmpRoot);
      await run(fakeArgv("add-skill", "chart"), tmpRoot);
      const resolver = readFileSync(join(tmpRoot, ".pilot", "RESOLVER.md"), "utf8");
      expect(resolver).toMatch(/<replace this with the trigger for `chart`>/);
    });
  });

  describe("list-tools / add-tool", () => {
    it("findTemplatesDir resolves the bundled templates folder", () => {
      const dir = findTemplatesDir();
      expect(dir).toMatch(/templates$/);
      expect(existsSync(join(dir, "tools"))).toBe(true);
    });

    it("listToolManifests returns at least the web-search manifest", async () => {
      const manifests = await listToolManifests();
      const webSearch = manifests.find((m) => m.name === "web-search");
      expect(webSearch).toBeDefined();
      expect(webSearch!.title.length).toBeGreaterThan(0);
      expect(webSearch!.files.length).toBeGreaterThan(0);
    });

    it("list-tools prints each available tool with name + title", async () => {
      const result = await run(fakeArgv("list-tools"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Available tools:");
      expect(result.stdout).toContain("web-search");
      expect(result.stdout).toContain("Web search");
      expect(result.stdout).toContain("npx agentickit add-tool");
    });

    it("list-tools rejects extra args", async () => {
      const result = await run(fakeArgv("list-tools", "stray"), tmpRoot);
      expect(result.exitCode).toBe(1);
    });

    it("add-tool requires a name", async () => {
      const result = await run(fakeArgv("add-tool"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage: agentickit add-tool");
    });

    it("add-tool refuses an unknown name", async () => {
      const result = await run(fakeArgv("add-tool", "nonexistent-tool"), tmpRoot);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Unknown tool");
    });

    it("add-tool web-search copies every manifest file into the cwd", async () => {
      const result = await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(0);

      // Files from the manifest land at their `to` paths.
      const expected = [
        "server/web-search/types.ts",
        "server/web-search/duckduckgo.ts",
        "server/web-search/tavily.ts",
        "server/web-search/firecrawl.ts",
        "server/web-search/serper.ts",
        "server/web-search/index.ts",
        "src/plugins/web-search.tsx",
      ];
      for (const rel of expected) {
        expect(existsSync(join(tmpRoot, rel))).toBe(true);
      }

      // Each scaffolded file matches the source template byte-for-byte.
      const templatesDir = findTemplatesDir();
      const dest = readFileSync(join(tmpRoot, "server/web-search/index.ts"), "utf8");
      const src = readFileSync(
        join(templatesDir, "tools/web-search/server/index.ts"),
        "utf8",
      );
      expect(dest).toBe(src);
    });

    it("add-tool web-search appends env vars to .env.example", async () => {
      await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      const envExample = readFileSync(join(tmpRoot, ".env.example"), "utf8");
      // Each commented var present.
      expect(envExample).toMatch(/# TAVILY_API_KEY=/);
      expect(envExample).toMatch(/# FIRECRAWL_API_KEY=/);
      expect(envExample).toMatch(/# SERPER_API_KEY=/);
      // Each help comment present.
      expect(envExample).toMatch(/tavily\.com/);
      expect(envExample).toMatch(/firecrawl\.dev/);
      expect(envExample).toMatch(/serper\.dev/);
    });

    it("add-tool preserves an existing .env.example and appends only", async () => {
      // Pre-populate with consumer content.
      const existingPath = join(tmpRoot, ".env.example");
      const existing = "DATABASE_URL=postgres://...\nLOG_LEVEL=info\n";
      mkdirSync(tmpRoot, { recursive: true });
      // Write through fs directly so we don't need an existing init.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").writeFileSync(existingPath, existing);

      await run(fakeArgv("add-tool", "web-search"), tmpRoot);

      const updated = readFileSync(existingPath, "utf8");
      // Existing content preserved at the top.
      expect(updated.startsWith(existing.trim())).toBe(true);
      // New env vars appended.
      expect(updated).toMatch(/# TAVILY_API_KEY=/);
    });

    it("add-tool is idempotent: re-running with existing files refuses", async () => {
      const first = await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      expect(first.exitCode).toBe(0);
      const second = await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      expect(second.exitCode).toBe(2);
      expect(second.stderr).toContain("Refusing to overwrite existing files");
      expect(second.stderr).toContain("server/web-search/types.ts");
    });

    it("add-tool prints the manifest's nextSteps after a successful scaffold", async () => {
      const result = await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Next steps:");
      expect(result.stdout).toContain("webSearchRoute");
      expect(result.stdout).toContain("<PilotPlugins>");
    });

    it("scaffolded web-search.tsx is self-contained: NO `./index` import", async () => {
      // The template was designed to be droppable into any project,
      // even one without an existing src/plugins/index.tsx exporting
      // PilotPlugin. So the scaffolded client file MUST inline the
      // PilotPlugin type rather than import it. Regression test.
      await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      const client = readFileSync(join(tmpRoot, "src/plugins/web-search.tsx"), "utf8");
      expect(client).not.toMatch(/from\s+["']\.\/index["']/);
      expect(client).toMatch(/interface\s+PilotPlugin\b/);
    });

    it("scaffolded server files have consistent inter-module imports", async () => {
      // Each backend file imports types from `./types.js`; the proxy
      // route imports each backend. A regression that splits the
      // import paths would break the scaffold for consumers.
      await run(fakeArgv("add-tool", "web-search"), tmpRoot);
      const proxy = readFileSync(join(tmpRoot, "server/web-search/index.ts"), "utf8");
      expect(proxy).toMatch(/from\s+["']\.\/duckduckgo\.js["']/);
      expect(proxy).toMatch(/from\s+["']\.\/tavily\.js["']/);
      expect(proxy).toMatch(/from\s+["']\.\/firecrawl\.js["']/);
      expect(proxy).toMatch(/from\s+["']\.\/serper\.js["']/);
      expect(proxy).toMatch(/from\s+["']\.\/types\.js["']/);
      expect(proxy).toMatch(/export\s+(async\s+)?function\s+webSearchRoute/);
    });
  });

  describe("placeholder helpers (toPascalCase / toCamelCase / applyPlaceholders)", () => {
    it("toPascalCase converts kebab-case to PascalCase", () => {
      expect(toPascalCase("support")).toBe("Support");
      expect(toPascalCase("support-bot")).toBe("SupportBot");
      expect(toPascalCase("multi-word-name")).toBe("MultiWordName");
      expect(toPascalCase("a")).toBe("A");
    });

    it("toCamelCase converts kebab-case to camelCase", () => {
      expect(toCamelCase("support")).toBe("support");
      expect(toCamelCase("support-bot")).toBe("supportBot");
      expect(toCamelCase("multi-word-name")).toBe("multiWordName");
    });

    it("applyPlaceholders substitutes all three placeholder forms", () => {
      const tpl = "name={{NAME}}, pascal={{NAME_PASCAL}}, camel={{NAME_CAMEL}}";
      expect(applyPlaceholders(tpl, "support-bot")).toBe(
        "name=support-bot, pascal=SupportBot, camel=supportBot",
      );
    });

    it("applyPlaceholders substitutes the longer-prefix form first (avoids `{{NAME}}` matching `{{NAME_PASCAL}}`)", () => {
      const tpl = "{{NAME_PASCAL}}.{{NAME}}.{{NAME_CAMEL}}";
      // Without longest-match-first ordering, `{{NAME}}` would gobble
      // the prefix of `{{NAME_PASCAL}}` and corrupt the output. This
      // test pins the right resolution order.
      expect(applyPlaceholders(tpl, "billing")).toBe("Billing.billing.billing");
    });
  });

  describe("list-agents / add-agent", () => {
    it("listAgentManifests returns the chat + observational templates", async () => {
      const manifests = await listAgentManifests();
      const names = manifests.map((m) => m.name).sort();
      expect(names).toEqual(["chat", "observational"]);
    });

    it("list-agents prints both templates with their titles", async () => {
      const result = await run(fakeArgv("list-agents"), tmpRoot);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Available agent templates:");
      expect(result.stdout).toContain("chat");
      expect(result.stdout).toContain("observational");
      expect(result.stdout).toContain("--type");
    });

    it("add-agent requires a name", async () => {
      const result = await run(fakeArgv("add-agent"), tmpRoot);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage: agentickit add-agent");
    });

    it("add-agent rejects an unknown --type", async () => {
      const result = await run(
        fakeArgv("add-agent", "support", "--type", "nonexistent"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Unknown agent type");
    });

    it("add-agent rejects an invalid name", async () => {
      const result = await run(
        fakeArgv("add-agent", "Support_Bot", "--type", "chat"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid agent name");
    });

    it("add-agent --type=chat scaffolds a chat agent with placeholders applied", async () => {
      const result = await run(
        fakeArgv("add-agent", "support-bot", "--type", "chat"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);

      // Filenames have {{NAME}} (kebab) substituted in.
      expect(existsSync(join(tmpRoot, "server/support-bot-agent.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "src/agents/support-bot-agent.tsx"))).toBe(true);

      // Server file uses camelCase identifier + PascalCase string.
      const server = readFileSync(join(tmpRoot, "server/support-bot-agent.ts"), "utf8");
      expect(server).toContain("supportBotHandler");
      expect(server).toContain("SupportBot assistant");

      // Client file uses PascalCase component name + kebab in the URL.
      const client = readFileSync(join(tmpRoot, "src/agents/support-bot-agent.tsx"), "utf8");
      expect(client).toContain("SupportBotAgent");
      expect(client).toContain('apiUrl="/api/support-bot"');

      // No raw {{NAME}} placeholders survived.
      expect(server).not.toContain("{{NAME");
      expect(client).not.toContain("{{NAME");
    });

    it("add-agent --type=observational scaffolds the observational pattern", async () => {
      const result = await run(
        fakeArgv("add-agent", "indexer", "--type", "observational"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(tmpRoot, "server/indexer-agent.ts"))).toBe(true);
      expect(existsSync(join(tmpRoot, "src/agents/indexer-agent.tsx"))).toBe(true);

      const server = readFileSync(join(tmpRoot, "server/indexer-agent.ts"), "utf8");
      expect(server).toContain("indexerRunRoute");
      expect(server).toContain("IndexerEvent");
      expect(server).not.toContain("{{NAME");

      const client = readFileSync(join(tmpRoot, "src/agents/indexer-agent.tsx"), "utf8");
      expect(client).toContain("IndexerAgent");
      expect(client).toContain('"/api/indexer/run"');
      expect(client).not.toContain("{{NAME");
    });

    it("add-agent defaults to --type=chat when no type is given", async () => {
      const result = await run(fakeArgv("add-agent", "concierge"), tmpRoot);
      expect(result.exitCode).toBe(0);
      // chat template has the createPilotHandler import; observational doesn't.
      const server = readFileSync(join(tmpRoot, "server/concierge-agent.ts"), "utf8");
      expect(server).toContain("createPilotHandler");
    });

    it("add-agent refuses to overwrite existing files (idempotent guard)", async () => {
      await run(fakeArgv("add-agent", "twin", "--type", "chat"), tmpRoot);
      const second = await run(fakeArgv("add-agent", "twin", "--type", "chat"), tmpRoot);
      expect(second.exitCode).toBe(2);
      expect(second.stderr).toContain("Refusing to overwrite");
      expect(second.stderr).toContain("server/twin-agent.ts");
    });

    it("add-agent prints next-steps with placeholders applied", async () => {
      const result = await run(
        fakeArgv("add-agent", "billing", "--type", "chat"),
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Next steps:");
      // The next-steps template references {{NAME_CAMEL}} for the
      // import name; the printed line should have it substituted.
      expect(result.stdout).toContain("billingHandler");
      expect(result.stdout).toContain("BillingAgent");
      expect(result.stdout).toContain("/api/billing");
      expect(result.stdout).not.toContain("{{NAME");
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
