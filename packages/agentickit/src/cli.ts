#!/usr/bin/env node
/**
 * `agentickit` CLI — scaffolds and grows `.pilot/` folders.
 *
 * Two subcommands:
 *   - `init`           create `.pilot/RESOLVER.md` + one example skill
 *   - `add-skill NAME` create `skills/<name>/SKILL.md` + append resolver row
 *
 * Design goals:
 *   - Zero dependencies. Node built-ins only.
 *   - Never overwrite user files. Refuse, print guidance.
 *   - Emit only the canonical file shape our parser understands.
 *   - `run()` is a pure function (argv + cwd → exit + output) so tests drive
 *     it without spawning child processes.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Result of a CLI invocation. Captured by tests; flushed to streams by the shell entrypoint. */
export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Pure CLI entry point. Tests call this directly with a synthetic `argv` and
 * `cwd`; the shell entry at the bottom of the file wires real streams.
 *
 * `argv` follows the Node convention: `[node, script, command, ...args]`.
 */
export async function run(argv: readonly string[], cwd: string): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const print = (s: string): void => {
    out.push(s.endsWith("\n") ? s : `${s}\n`);
  };
  const warn = (s: string): void => {
    err.push(s.endsWith("\n") ? s : `${s}\n`);
  };

  const command = argv[2];
  const rest = argv.slice(3);

  try {
    if (!command || command === "--help" || command === "-h") {
      print(HELP_TEXT);
      return { exitCode: command ? 0 : 1, stdout: out.join(""), stderr: err.join("") };
    }
    if (command === "--version" || command === "-v") {
      print(`agentickit ${VERSION}`);
      return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
    }
    if (command === "init") {
      return await cmdInit(cwd, rest, print, warn);
    }
    if (command === "add-skill") {
      return await cmdAddSkill(cwd, rest, print, warn);
    }
    if (command === "list-tools") {
      return await cmdListTools(rest, print, warn);
    }
    if (command === "add-tool") {
      return await cmdAddTool(cwd, rest, print, warn);
    }
    if (command === "list-agents") {
      return await cmdListAgents(rest, print, warn);
    }
    if (command === "add-agent") {
      return await cmdAddAgent(cwd, rest, print, warn);
    }
    warn(`Unknown command: ${command}`);
    warn(HELP_TEXT);
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  } catch (error) {
    warn(`agentickit: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 3, stdout: out.join(""), stderr: err.join("") };
  }
}

/**
 * `agentickit init` — scaffold `.pilot/` in the current working directory.
 *
 * Refuses if `.pilot/` already exists (we never overwrite). Produces:
 *   .pilot/RESOLVER.md
 *   .pilot/skills/example/SKILL.md
 */
async function cmdInit(
  cwd: string,
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string): void => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string): void => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  if (args.length > 0) {
    tee.warn(`init takes no arguments (got: ${args.join(" ")})`);
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const pilotDir = resolve(cwd, ".pilot");
  if (await pathExists(pilotDir)) {
    tee.warn(`.pilot/ already exists at ${pilotDir}. Refusing to overwrite.`);
    tee.warn(`To start from scratch, remove it first: rm -r ${pilotDir}`);
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  const resolverPath = join(pilotDir, "RESOLVER.md");
  const skillPath = join(pilotDir, "skills", "example", "SKILL.md");

  await writeTextFile(resolverPath, RESOLVER_TEMPLATE);
  await writeTextFile(skillPath, EXAMPLE_SKILL_TEMPLATE);

  tee.print("✓ .pilot/ scaffolded");
  tee.print(`  ${relFromCwd(cwd, resolverPath)}`);
  tee.print(`  ${relFromCwd(cwd, skillPath)}`);
  tee.print("");
  tee.print("Next: edit the example skill, then add more with");
  tee.print("  npx agentickit add-skill <name>");

  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

/**
 * `agentickit add-skill <name>` — add a new skill and register it in RESOLVER.md.
 *
 * `<name>` must be kebab-case (`[a-z][a-z0-9-]*`). Creates:
 *   .pilot/skills/<name>/SKILL.md   with frontmatter pre-filled
 * And appends a row to `.pilot/RESOLVER.md` under the `## Skills` section
 * (creating the section if absent).
 */
async function cmdAddSkill(
  cwd: string,
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string): void => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string): void => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  const name = args[0];
  if (!name || args.length !== 1) {
    tee.warn("Usage: agentickit add-skill <name>");
    tee.warn("  <name> must be kebab-case (e.g. chart, detail-form, export-todos)");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (!isValidSkillName(name)) {
    tee.warn(`Invalid skill name: "${name}"`);
    tee.warn("  Use kebab-case (e.g. chart, detail-form, export-todos):");
    tee.warn("  lowercase, start with a letter, hyphens allowed, no underscores.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const pilotDir = resolve(cwd, ".pilot");
  const resolverPath = join(pilotDir, "RESOLVER.md");
  const skillDir = join(pilotDir, "skills", name);
  const skillPath = join(skillDir, "SKILL.md");

  if (!(await pathExists(pilotDir))) {
    tee.warn(`.pilot/ not found at ${pilotDir}.`);
    tee.warn("Run `npx agentickit init` first.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }
  if (await pathExists(skillDir)) {
    tee.warn(`Skill "${name}" already exists at ${skillDir}.`);
    tee.warn("Pick a different name, or remove the directory first.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  await writeTextFile(skillPath, renderSkillTemplate(name));

  // RESOLVER.md may have been hand-edited (that's the whole point of the md-driven pitch).
  // We don't parse it — we just insert a row in a stable, idempotent location.
  let resolverContent = "";
  if (await pathExists(resolverPath)) {
    resolverContent = await readFile(resolverPath, "utf8");
  }
  const updated = insertSkillRow(resolverContent, name);
  await writeTextFile(resolverPath, updated);

  tee.print(`✓ Skill "${name}" added`);
  tee.print(`  ${relFromCwd(cwd, skillPath)}`);
  tee.print(`  ${relFromCwd(cwd, resolverPath)} (row appended)`);
  tee.print("");
  tee.print("Next: edit the trigger text in RESOLVER.md and fill in SKILL.md body.");
  tee.print("Restart your dev server to pick up the new skill.");

  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `path` exists. Treats any `stat` failure as "doesn't
 * exist" — good enough for our use (file creation, overwrite guard).
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write `content` to `path`, creating parent directories as needed. Always
 * writes as UTF-8 text with a trailing newline.
 */
async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = content.endsWith("\n") ? content : `${content}\n`;
  await writeFile(path, body, "utf8");
}

/** Show paths relative to cwd when possible, so CLI output reads cleanly. */
function relFromCwd(cwd: string, path: string): string {
  const prefix = `${resolve(cwd)}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Kebab-case validator for skill names. */
export function isValidSkillName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * Idempotently insert a skill row into a RESOLVER.md body.
 *
 * Strategy:
 *   - If a `## Skills` section exists, insert the row after the last table
 *     row in that section (or create the table if the section is empty).
 *   - If not, append a whole new `## Skills` section at the end.
 *
 * Crucially this does NOT parse the whole file — we leave the user's prose
 * and other sections alone. Exported so tests can exercise the logic
 * without going through the full command.
 */
export function insertSkillRow(content: string, name: string): string {
  // Placeholder uses the `<replace this>` convention shared with the SKILL.md
  // scaffold so a new author can grep `<replace` to find every spot to fill.
  const row = `| <replace this with the trigger for \`${name}\`> | \`skills/${name}/SKILL.md\` |`;
  const lines = content.split("\n");
  const skillsIdx = lines.findIndex((l) => /^##\s+Skills\s*$/.test(l));

  if (skillsIdx === -1) {
    const trimmed = content.replace(/\n+$/, "");
    const sep = trimmed.length > 0 ? "\n\n" : "";
    return `${trimmed}${sep}## Skills\n\n| Trigger | Skill |\n| ------- | ----- |\n${row}\n`;
  }

  let lastPipeIdx = -1;
  for (let i = skillsIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i] ?? "")) break;
    if (/^\s*\|/.test(lines[i] ?? "")) lastPipeIdx = i;
  }

  if (lastPipeIdx === -1) {
    lines.splice(skillsIdx + 1, 0, "", "| Trigger | Skill |", "| ------- | ----- |", row);
  } else {
    lines.splice(lastPipeIdx + 1, 0, row);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool templates: list-tools + add-tool
// ---------------------------------------------------------------------------

/**
 * Shape of `templates/tools/<name>/MANIFEST.json`. We keep it
 * deliberately small so adding a new tool is just "drop files in a
 * folder + write the manifest". No code generation, no runtime
 * indirection.
 */
export interface ToolManifest {
  /** Slug used as the CLI argument: `agentickit add-tool <name>`. */
  name: string;
  /** Short title shown by `list-tools`. */
  title: string;
  /** One-paragraph description shown by `list-tools` and after scaffolding. */
  description: string;
  /** Env vars the consumer needs to set. Each gets appended to `.env.example`. */
  envVars?: Array<{ name: string; required?: boolean; help: string }>;
  /** Source-to-destination file map. Paths are relative on both sides. */
  files: Array<{ from: string; to: string }>;
  /** Optional lines printed after a successful scaffold (next-steps guidance). */
  nextSteps?: string[];
}

/**
 * Resolve the path to the `templates/` directory shipped with this
 * package. Works in both the source layout (during local development
 * and tests) and the published `dist/` layout (after `tsup` builds and
 * `npm publish` copies the `templates/` allowlisted via `package.json`).
 *
 * Walks up from the CLI module's location until it finds a directory
 * containing `templates/tools/`. Throws if nothing matches inside a few
 * levels — safer than silently returning a wrong path.
 */
export function findTemplatesDir(startFromUrl: string = import.meta.url): string {
  const start = fileURLToPath(startFromUrl);
  let dir = dirname(start);
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, "templates", "tools");
    if (existsSync(candidate)) return join(dir, "templates");
    dir = dirname(dir);
  }
  throw new Error(
    "agentickit: could not locate the bundled templates/ directory. " +
      "If you're running from source, make sure packages/agentickit/templates/ exists.",
  );
}

/**
 * Read every `MANIFEST.json` under `templates/tools/<name>/` and return
 * the parsed manifests. Skips any folder without a manifest so partial
 * scaffolds-in-progress don't crash `list-tools`.
 */
export async function listToolManifests(): Promise<ToolManifest[]> {
  const root = join(findTemplatesDir(), "tools");
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const out: ToolManifest[] = [];
  for (const name of entries) {
    const manifestPath = join(root, name, "MANIFEST.json");
    if (!existsSync(manifestPath)) continue;
    const text = await readFile(manifestPath, "utf8");
    out.push(JSON.parse(text) as ToolManifest);
  }
  return out;
}

async function cmdListTools(
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string) => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string) => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  if (args.length > 0) {
    tee.warn("list-tools takes no arguments.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const manifests = await listToolManifests();
  if (manifests.length === 0) {
    tee.print("No tools available.");
    return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
  }

  tee.print("Available tools:");
  tee.print("");
  for (const m of manifests) {
    tee.print(`  ${m.name.padEnd(16)} ${m.title}`);
    tee.print(`  ${" ".repeat(16)} ${m.description}`);
    tee.print("");
  }
  tee.print("Install with:  npx agentickit add-tool <name>");
  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

async function cmdAddTool(
  cwd: string,
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string) => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string) => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  const name = args[0];
  if (!name || args.length !== 1) {
    tee.warn("Usage: agentickit add-tool <name>");
    tee.warn("  Run `npx agentickit list-tools` to see what's available.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (!isValidSkillName(name)) {
    tee.warn(`Invalid tool name: "${name}"`);
    tee.warn("  Use the kebab-case name printed by `agentickit list-tools`.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const templatesRoot = findTemplatesDir();
  const toolDir = join(templatesRoot, "tools", name);
  const manifestPath = join(toolDir, "MANIFEST.json");
  if (!existsSync(manifestPath)) {
    tee.warn(`Unknown tool: "${name}"`);
    tee.warn("  Run `npx agentickit list-tools` to see available tools.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ToolManifest;

  // Refuse if ANY target file already exists, so we never silently
  // overwrite the consumer's edits.
  const conflicts: string[] = [];
  for (const file of manifest.files) {
    const dest = resolve(cwd, file.to);
    if (await pathExists(dest)) conflicts.push(file.to);
  }
  if (conflicts.length > 0) {
    tee.warn(`Refusing to overwrite existing files:`);
    for (const c of conflicts) tee.warn(`  ${c}`);
    tee.warn("Remove or rename them first, then re-run.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  // Copy every file.
  for (const file of manifest.files) {
    const src = join(toolDir, file.from);
    const dest = resolve(cwd, file.to);
    const body = await readFile(src, "utf8");
    await writeTextFile(dest, body);
  }

  // Append env-var stubs to .env.example (creating the file if missing).
  if (manifest.envVars && manifest.envVars.length > 0) {
    await ensureEnvVarsDocumented(cwd, manifest);
  }

  tee.print(`✓ Tool "${manifest.name}" scaffolded (${manifest.title})`);
  for (const file of manifest.files) {
    tee.print(`  ${file.to}`);
  }
  if (manifest.envVars && manifest.envVars.length > 0) {
    tee.print(`  .env.example (env-var stubs appended)`);
  }
  if (manifest.nextSteps && manifest.nextSteps.length > 0) {
    tee.print("");
    tee.print("Next steps:");
    for (const line of manifest.nextSteps) tee.print(`  ${line}`);
  }
  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

/**
 * Append the tool's env vars to `.env.example`, but only the ones not
 * already documented (so re-running `add-tool` on an existing project
 * is idempotent). Each var gets its `help` line as a comment above it.
 */
async function ensureEnvVarsDocumented(cwd: string, manifest: ToolManifest): Promise<void> {
  const path = resolve(cwd, ".env.example");
  const existing = (await pathExists(path)) ? await readFile(path, "utf8") : "";
  const block: string[] = [];
  for (const env of manifest.envVars ?? []) {
    if (existing.includes(`\n${env.name}=`) || existing.startsWith(`${env.name}=`)) continue;
    if (existing.includes(`# ${env.name}=`)) continue;
    block.push(`# ${env.help}`);
    block.push(`# ${env.name}=`);
    block.push("");
  }
  if (block.length === 0) return;
  const header = `# ${manifest.title} (added by \`agentickit add-tool ${manifest.name}\`)`;
  const next = existing
    ? `${existing.replace(/\n+$/, "")}\n\n${header}\n${block.join("\n").trim()}\n`
    : `${header}\n${block.join("\n").trim()}\n`;
  await writeTextFile(path, next);
}

// ---------------------------------------------------------------------------
// Agent templates: list-agents + add-agent
// ---------------------------------------------------------------------------

/**
 * Shape of `templates/agents/<type>/MANIFEST.json`. Same envelope as
 * ToolManifest; the difference is that file paths AND contents support
 * `{{NAME}}` / `{{NAME_PASCAL}}` / `{{NAME_CAMEL}}` placeholders so a
 * scaffolded agent uses the consumer's chosen name.
 */
export interface AgentManifest {
  /** Type slug used as `agentickit add-agent <name> --type <type>`. */
  name: string;
  title: string;
  description: string;
  envVars?: Array<{ name: string; required?: boolean; help: string }>;
  files: Array<{ from: string; to: string }>;
  nextSteps?: string[];
}

/** Walk `templates/agents/` and return one parsed manifest per type. */
export async function listAgentManifests(): Promise<AgentManifest[]> {
  const root = join(findTemplatesDir(), "agents");
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const out: AgentManifest[] = [];
  for (const name of entries) {
    const manifestPath = join(root, name, "MANIFEST.json");
    if (!existsSync(manifestPath)) continue;
    const text = await readFile(manifestPath, "utf8");
    out.push(JSON.parse(text) as AgentManifest);
  }
  return out;
}

/** kebab-case → `PascalCase`. `support-bot` → `SupportBot`. */
export function toPascalCase(kebab: string): string {
  return kebab
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/** kebab-case → `camelCase`. `support-bot` → `supportBot`. */
export function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Substitute the agent-template placeholders in `text`. Three placeholders:
 *   `{{NAME}}`         → the kebab-case agent name (e.g. `support-bot`)
 *   `{{NAME_PASCAL}}`  → PascalCase            (e.g. `SupportBot`)
 *   `{{NAME_CAMEL}}`   → camelCase             (e.g. `supportBot`)
 *
 * Used for both file paths AND file contents so a single template
 * generates correctly-named files with correctly-named identifiers.
 */
export function applyPlaceholders(text: string, name: string): string {
  return text
    .replace(/\{\{NAME_PASCAL\}\}/g, toPascalCase(name))
    .replace(/\{\{NAME_CAMEL\}\}/g, toCamelCase(name))
    .replace(/\{\{NAME\}\}/g, name);
}

async function cmdListAgents(
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string) => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string) => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  if (args.length > 0) {
    tee.warn("list-agents takes no arguments.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const manifests = await listAgentManifests();
  if (manifests.length === 0) {
    tee.print("No agent templates available.");
    return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
  }

  tee.print("Available agent templates:");
  tee.print("");
  for (const m of manifests) {
    tee.print(`  ${m.name.padEnd(16)} ${m.title}`);
    tee.print(`  ${" ".repeat(16)} ${m.description}`);
    tee.print("");
  }
  tee.print("Install with:  npx agentickit add-agent <name> --type <type>");
  tee.print("Defaults to --type chat if omitted.");
  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

/**
 * Parse `add-agent <name> [--type <type>]` argv. Returns the parsed
 * shape plus a CliResult-shaped error if the args don't form a valid
 * invocation.
 */
function parseAddAgentArgs(args: readonly string[]): {
  name?: string;
  type?: string;
  error?: string;
} {
  const positional: string[] = [];
  let type: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--type") {
      type = args[i + 1];
      if (!type) return { error: "--type requires a value (e.g. --type chat)" };
      i += 1;
    } else if (arg !== undefined && arg.startsWith("--type=")) {
      type = arg.slice("--type=".length);
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    return { error: "Usage: agentickit add-agent <name> [--type <type>]" };
  }
  return { name: positional[0], type: type ?? "chat" };
}

async function cmdAddAgent(
  cwd: string,
  args: readonly string[],
  print: (s: string) => void,
  warn: (s: string) => void,
): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const tee = {
    print: (s: string) => {
      print(s);
      out.push(s.endsWith("\n") ? s : `${s}\n`);
    },
    warn: (s: string) => {
      warn(s);
      err.push(s.endsWith("\n") ? s : `${s}\n`);
    },
  };

  const parsed = parseAddAgentArgs(args);
  if (parsed.error || !parsed.name || !parsed.type) {
    tee.warn(parsed.error ?? "Usage: agentickit add-agent <name> [--type <type>]");
    tee.warn("  Run `npx agentickit list-agents` to see available types.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (!isValidSkillName(parsed.name)) {
    tee.warn(`Invalid agent name: "${parsed.name}"`);
    tee.warn("  Use kebab-case (e.g. support-bot, billing, onboarding).");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (!isValidSkillName(parsed.type)) {
    tee.warn(`Invalid agent type: "${parsed.type}"`);
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const templatesRoot = findTemplatesDir();
  const typeDir = join(templatesRoot, "agents", parsed.type);
  const manifestPath = join(typeDir, "MANIFEST.json");
  if (!existsSync(manifestPath)) {
    tee.warn(`Unknown agent type: "${parsed.type}"`);
    tee.warn("  Run `npx agentickit list-agents` to see available types.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as AgentManifest;

  // Resolve every destination path with placeholders applied so we can
  // detect conflicts before touching the filesystem.
  const resolvedFiles = manifest.files.map((file) => ({
    from: file.from,
    to: applyPlaceholders(file.to, parsed.name as string),
  }));

  const conflicts: string[] = [];
  for (const file of resolvedFiles) {
    const dest = resolve(cwd, file.to);
    if (await pathExists(dest)) conflicts.push(file.to);
  }
  if (conflicts.length > 0) {
    tee.warn(`Refusing to overwrite existing files:`);
    for (const c of conflicts) tee.warn(`  ${c}`);
    tee.warn("Remove or rename them first, then re-run.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  // Copy + substitute every file.
  for (const file of resolvedFiles) {
    const src = join(typeDir, file.from);
    const dest = resolve(cwd, file.to);
    const raw = await readFile(src, "utf8");
    const body = applyPlaceholders(raw, parsed.name);
    await writeTextFile(dest, body);
  }

  if (manifest.envVars && manifest.envVars.length > 0) {
    await ensureEnvVarsDocumented(cwd, manifest);
  }

  tee.print(`✓ Agent "${parsed.name}" scaffolded (type: ${parsed.type})`);
  for (const file of resolvedFiles) {
    tee.print(`  ${file.to}`);
  }
  if (manifest.envVars && manifest.envVars.length > 0) {
    tee.print(`  .env.example (env-var stubs appended)`);
  }
  if (manifest.nextSteps && manifest.nextSteps.length > 0) {
    tee.print("");
    tee.print("Next steps:");
    for (const line of manifest.nextSteps) {
      tee.print(`  ${applyPlaceholders(line, parsed.name)}`);
    }
  }
  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// Read version from package.json at runtime so it stays in lockstep with the
// published package. Works in dev (src/cli.ts) and in the bundled bin
// (dist/cli.js): both sit one directory below package.json. Single source of
// truth — bumping `version` in package.json propagates here automatically.
function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgRaw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed = JSON.parse(pkgRaw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}

const VERSION = readPackageVersion();

const HELP_TEXT = `agentickit — scaffold and grow your .pilot/ folder and plug in stock tools.

Usage:
  npx agentickit <command>

Commands:
  init              Create .pilot/ with one example skill.
  add-skill <name>  Add a new skill and register it in RESOLVER.md.
                    <name> must be kebab-case (e.g. chart, detail-form).
  list-tools        List stock tools you can install (web-search, etc.).
  add-tool <name>   Scaffold a stock tool: copies its files into your repo
                    and appends required env vars to .env.example.
  list-agents       List stock agent templates (chat, observational, ...).
  add-agent <name>  Scaffold an agent into your repo. Pass --type to pick
                    a template (defaults to chat).
                    Example: agentickit add-agent support --type chat

Options:
  -h, --help        Show this help.
  -v, --version     Show version.

Docs:
  https://github.com/hec-ovi/agentickit
`;

const RESOLVER_TEMPLATE = `# Agent Resolver

The model reads this file and every \`skills/<name>/SKILL.md\` as its system
prompt at startup. Edit this file to change the agent's persona and routing
table. Edit the skill files to change how each capability is invoked.

The prose below is the persona block. Rewrite it to match how YOUR app's
copilot should sound (terse, friendly, formal, technical).

You are a concise, helpful assistant embedded in this app. Prefer calling a
tool over describing what the user should do. Reply in short markdown.

## Skills

The table below routes user intent to a skill file. Each row is a trigger
phrase or topic that, when matched, tells the model to consult the named
skill before responding.

| Trigger                       | Skill                         |
| ----------------------------- | ----------------------------- |
| Anything you can demo locally | \`skills/example/SKILL.md\`   |
`;

const EXAMPLE_SKILL_TEMPLATE = `---
name: example
description: A starter skill so you can see the shape. Replace with a real one.
triggers:
  - "show me how"
  - "demo this"
tools:
  - example_tool
mutating: false
---

# When to use

Plain English: when should the model consult this skill? Cover the user
phrasings, the page contexts, and any disambiguators. The model reads this
body verbatim and decides whether to call the tools listed in the frontmatter.

This starter skill is intentionally minimal. Replace the body with the real
behaviour for your app.

# How to use

Numbered steps, tool order, formatting rules. Keep it tight; the model
follows the order you give.

1. Call \`example_tool\` with whatever arguments the user supplied.
2. Reply with a single sentence summarizing the result.

# Anti-patterns

Things NOT to do, with one-line reasons. Optional but useful for skills
where the model is likely to over-reach.

- Don't call \`example_tool\` if the user only asked a clarifying question;
  answer in prose instead.
`;

/**
 * Template emitted by `add-skill <name>`. Uses the `<replace this>`
 * placeholder convention so a new author can grep for `<replace` to find
 * every spot that needs filling in. Avoids the literal token `TODO`
 * because consumers tend to grep their own repos for it and a freshly
 * scaffolded skill should not show up in that result on day one.
 */
function renderSkillTemplate(name: string): string {
  return `---
name: ${name}
description: <replace this with a one-sentence summary of what this skill does>
triggers:
  - "<replace with a user phrasing that should fire this skill>"
tools:
  - <your_tool_name>
mutating: false
---

# When to use

<replace this with a plain English description of when to consult this
skill, including user phrasings, page contexts, and any disambiguators>

# How to use

<replace this with numbered steps, tool call order, and formatting rules.
Keep it tight; the model follows the order you give>

# Anti-patterns

<optional: list things NOT to do here, with one-line reasons. Delete this
section if there are no useful anti-patterns to call out>
`;
}

// ---------------------------------------------------------------------------
// Shell entry point
// ---------------------------------------------------------------------------

// Run when invoked as a script (`node cli.js`, `npx agentickit`, `bin/agentickit`).
//
// Comparing `import.meta.url` directly to `process.argv[1]` fails under pnpm /
// npm-workspaces because the CLI is reached through a symlink in
// `node_modules/.bin/` → `node_modules/<pkg>` → the real package dir. The URL
// is resolved to the real file; argv[1] stays the symlink path. Both sides
// must go through `fs.realpathSync` before compare.
function isScriptEntrypoint(): boolean {
  if (typeof process === "undefined" || typeof import.meta.url !== "string") return false;
  const argvEntry = process.argv[1];
  if (!argvEntry) return false;
  try {
    const scriptReal = realpathSync(fileURLToPath(import.meta.url));
    const argvReal = realpathSync(argvEntry);
    return scriptReal === argvReal;
  } catch {
    return false;
  }
}

if (isScriptEntrypoint()) {
  run(process.argv, process.cwd()).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}
