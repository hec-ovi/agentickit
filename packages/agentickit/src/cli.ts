#!/usr/bin/env node
/**
 * `agentickit` CLI — scaffolds and grows your `.pilot/` folder.
 *
 * One unit, one folder, one row in RESOLVER. The CLI is skill-first; there
 * is no separate "tool" primitive. Every capability the agent should know
 * about is a SKILL.md (the model-facing instructions), optionally paired
 * with hook code (server endpoint + React plugin) when the skill needs to
 * actually do something.
 *
 * Commands:
 *   - `init`                                  scaffold .pilot/ + an example skill
 *   - `add-skill <name> [--type <type>]`      add a skill, scaffold hook code by type
 *   - `list-skills`                           list stock skill templates that ship with the package
 *   - `list-agents`                           list stock agent templates
 *   - `add-agent <name> [--type <type>]`      scaffold an agent
 *
 * Skill types:
 *   - `text` (default)        SKILL.md only — pure instruction skill
 *   - `server-tool`           SKILL.md + client plugin stub + server endpoint stub
 *   - `ui-component`          SKILL.md + plugin stub that registers show/hide actions for a panel
 *
 * If `<name>` matches a stock skill template under `templates/skills/<name>/`,
 * the CLI installs that template (with its real hook code) and the manifest's
 * declared type wins; passing a conflicting `--type` is an error.
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

/** Recognized skill types. Validated by `isValidSkillType`. */
export const SKILL_TYPES = ["text", "server-tool", "ui-component"] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export function isValidSkillType(type: string): type is SkillType {
  return (SKILL_TYPES as readonly string[]).includes(type);
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
    if (command === "list-skills") {
      return await cmdListSkills(rest, print, warn);
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
  tee.print("  npx agentickit add-skill <name> --type server-tool   # for a new tool-backed skill");
  tee.print("  npx agentickit add-skill <name> --type ui-component  # for an inline UI skill");
  tee.print("  npx agentickit list-skills                           # browse stock skills you can install");

  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

/**
 * Parse `add-skill <name> [--type <type>]` argv. Returns the parsed
 * shape plus an `error` string if the args don't form a valid invocation.
 */
export function parseAddSkillArgs(args: readonly string[]): {
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
      if (!type) return { error: "--type requires a value (e.g. --type text, --type server-tool, --type ui-component)" };
      i += 1;
    } else if (arg !== undefined && arg.startsWith("--type=")) {
      type = arg.slice("--type=".length);
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    return { error: "Usage: agentickit add-skill <name> [--type <text|server-tool|ui-component>]" };
  }
  return { name: positional[0], type };
}

/**
 * `agentickit add-skill <name> [--type <type>]`.
 *
 * Two paths:
 *   1. STOCK INSTALL — if `<name>` matches a template under
 *      `templates/skills/<name>/`, we install it: copy its SKILL.md to
 *      `.pilot/skills/<name>/SKILL.md`, copy each declared hook file to
 *      its destination, append the manifest's `resolverRow` to RESOLVER,
 *      and append any env-var stubs to `.env.example`. The manifest's
 *      `type` wins; passing a conflicting `--type` is an error.
 *   2. CUSTOM SCAFFOLD — otherwise, we scaffold a new skill from a
 *      built-in placeholder shaped by `--type` (defaulting to `text`):
 *        - `text`           SKILL.md only.
 *        - `server-tool`    SKILL.md + `src/plugins/<name>.tsx` + `server/<name>/index.ts`.
 *        - `ui-component`   SKILL.md + `src/plugins/<name>.tsx` (with a panel placeholder).
 *      Either way, RESOLVER.md gets a fresh row.
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

  const parsed = parseAddSkillArgs(args);
  if (parsed.error || !parsed.name) {
    tee.warn(parsed.error ?? "Usage: agentickit add-skill <name> [--type <type>]");
    tee.warn("  <name> must be kebab-case (e.g. chart, detail-form, export-todos)");
    tee.warn("  Run `npx agentickit list-skills` to see stock templates you can install by name.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (!isValidSkillName(parsed.name)) {
    tee.warn(`Invalid skill name: "${parsed.name}"`);
    tee.warn("  Use kebab-case (e.g. chart, detail-form, export-todos):");
    tee.warn("  lowercase, start with a letter, hyphens allowed, no underscores.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }
  if (parsed.type !== undefined && !isValidSkillType(parsed.type)) {
    tee.warn(`Invalid --type value: "${parsed.type}"`);
    tee.warn(`  Valid types: ${SKILL_TYPES.join(", ")}`);
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const pilotDir = resolve(cwd, ".pilot");
  if (!(await pathExists(pilotDir))) {
    tee.warn(`.pilot/ not found at ${pilotDir}.`);
    tee.warn("Run `npx agentickit init` first.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  // Stock install path: name matches a bundled template.
  const stockManifest = await tryLoadStockSkillManifest(parsed.name);
  if (stockManifest) {
    if (parsed.type !== undefined && parsed.type !== stockManifest.type) {
      tee.warn(
        `Stock skill "${parsed.name}" is type "${stockManifest.type}"; cannot override with --type ${parsed.type}.`,
      );
      tee.warn("Omit --type to install the stock skill, or pick a different name for a custom skill.");
      return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
    }
    return installStockSkill(cwd, stockManifest, tee, out, err);
  }

  // Custom scaffold path.
  const type: SkillType = (parsed.type as SkillType | undefined) ?? "text";
  return scaffoldCustomSkill(cwd, parsed.name, type, tee, out, err);
}

/**
 * Install a stock skill template into the consumer repo. Refuses to
 * overwrite any existing file (SKILL.md, hook code, or otherwise) and
 * appends env-var stubs to `.env.example` idempotently.
 */
async function installStockSkill(
  cwd: string,
  manifest: SkillManifest,
  tee: { print: (s: string) => void; warn: (s: string) => void },
  out: string[],
  err: string[],
): Promise<CliResult> {
  const templatesRoot = findTemplatesDir();
  const skillTemplateDir = join(templatesRoot, "skills", manifest.name);

  // All destinations: SKILL.md + every hook file. Resolved up front so we
  // can detect conflicts before touching the filesystem.
  const allFiles: Array<{ from: string; to: string }> = [
    { from: manifest.skill.from, to: manifest.skill.to },
    ...manifest.files,
  ];

  const conflicts: string[] = [];
  for (const file of allFiles) {
    const dest = resolve(cwd, file.to);
    if (await pathExists(dest)) conflicts.push(file.to);
  }
  if (conflicts.length > 0) {
    tee.warn("Refusing to overwrite existing files:");
    for (const c of conflicts) tee.warn(`  ${c}`);
    tee.warn("Remove or rename them first, then re-run.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  for (const file of allFiles) {
    const src = join(skillTemplateDir, file.from);
    const dest = resolve(cwd, file.to);
    const body = await readFile(src, "utf8");
    await writeTextFile(dest, body);
  }

  // Append a row to RESOLVER.md using the manifest's trigger hint.
  const resolverPath = resolve(cwd, ".pilot", "RESOLVER.md");
  let resolverContent = "";
  if (await pathExists(resolverPath)) {
    resolverContent = await readFile(resolverPath, "utf8");
  }
  const updated = insertSkillRow(resolverContent, manifest.name, manifest.resolverRow.trigger);
  await writeTextFile(resolverPath, updated);

  if (manifest.envVars && manifest.envVars.length > 0) {
    await ensureEnvVarsDocumented(cwd, manifest);
  }

  tee.print(`✓ Stock skill "${manifest.name}" installed (type: ${manifest.type})`);
  for (const file of allFiles) tee.print(`  ${file.to}`);
  tee.print(`  ${relFromCwd(cwd, resolverPath)} (row appended)`);
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
 * Scaffold a custom (non-stock) skill from a built-in placeholder shape.
 * Refuses to overwrite the skill folder or any hook stub it would create.
 */
async function scaffoldCustomSkill(
  cwd: string,
  name: string,
  type: SkillType,
  tee: { print: (s: string) => void; warn: (s: string) => void },
  out: string[],
  err: string[],
): Promise<CliResult> {
  const pilotDir = resolve(cwd, ".pilot");
  const resolverPath = join(pilotDir, "RESOLVER.md");
  const skillDir = join(pilotDir, "skills", name);
  const skillPath = join(skillDir, "SKILL.md");

  if (await pathExists(skillDir)) {
    tee.warn(`Skill "${name}" already exists at ${skillDir}.`);
    tee.warn("Pick a different name, or remove the directory first.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  // Hook file destinations differ by type.
  const hookFiles: Array<{ to: string; render: (name: string) => string }> = [];
  if (type === "server-tool") {
    hookFiles.push({
      to: resolve(cwd, "src", "plugins", `${name}.tsx`),
      render: renderCustomServerToolPluginStub,
    });
    hookFiles.push({
      to: resolve(cwd, "server", name, "index.ts"),
      render: renderCustomServerToolEndpointStub,
    });
  } else if (type === "ui-component") {
    hookFiles.push({
      to: resolve(cwd, "src", "plugins", `${name}.tsx`),
      render: renderCustomUiComponentPluginStub,
    });
  }

  // Conflict check on every hook file (SKILL.md was already checked above).
  const conflicts: string[] = [];
  for (const f of hookFiles) {
    if (await pathExists(f.to)) conflicts.push(relFromCwd(cwd, f.to));
  }
  if (conflicts.length > 0) {
    tee.warn("Refusing to overwrite existing files:");
    for (const c of conflicts) tee.warn(`  ${c}`);
    tee.warn("Remove or rename them first, then re-run.");
    return { exitCode: 2, stdout: out.join(""), stderr: err.join("") };
  }

  // Write SKILL.md.
  await writeTextFile(skillPath, renderSkillTemplate(name, type));

  // Write hook stubs.
  for (const f of hookFiles) {
    await writeTextFile(f.to, f.render(name));
  }

  // Append RESOLVER row.
  let resolverContent = "";
  if (await pathExists(resolverPath)) {
    resolverContent = await readFile(resolverPath, "utf8");
  }
  const updated = insertSkillRow(resolverContent, name);
  await writeTextFile(resolverPath, updated);

  tee.print(`✓ Skill "${name}" scaffolded (type: ${type})`);
  tee.print(`  ${relFromCwd(cwd, skillPath)}`);
  for (const f of hookFiles) tee.print(`  ${relFromCwd(cwd, f.to)}`);
  tee.print(`  ${relFromCwd(cwd, resolverPath)} (row appended)`);
  tee.print("");
  tee.print("Next: edit the trigger text in RESOLVER.md and fill in the SKILL.md body and the hook stubs.");
  tee.print("Restart your dev server to pick up the new skill.");
  return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
}

/**
 * `agentickit list-skills` — list stock skill templates that ship with
 * the package. These are skills you can install by name with
 * `agentickit add-skill <name>` (no --type needed; the manifest declares it).
 */
async function cmdListSkills(
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
    tee.warn("list-skills takes no arguments.");
    return { exitCode: 1, stdout: out.join(""), stderr: err.join("") };
  }

  const manifests = await listSkillManifests();
  if (manifests.length === 0) {
    tee.print("No stock skills available.");
    return { exitCode: 0, stdout: out.join(""), stderr: err.join("") };
  }

  tee.print("Stock skills (install with `npx agentickit add-skill <name>`):");
  tee.print("");
  for (const m of manifests) {
    tee.print(`  ${m.name.padEnd(16)} [${m.type}]  ${m.title}`);
    tee.print(`  ${" ".repeat(16)}            ${m.description}`);
    tee.print("");
  }
  tee.print("To scaffold a CUSTOM skill (not in this list):");
  tee.print("  npx agentickit add-skill <your-name> --type [text|server-tool|ui-component]");
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

/**
 * Kebab-case validator for skill names. Rules: lowercase, starts with a
 * letter, digits and hyphens allowed in the middle, must NOT start or end
 * with a hyphen, no consecutive hyphens. Single-letter names are allowed.
 */
export function isValidSkillName(name: string): boolean {
  if (name.length === 0) return false;
  if (name.length === 1) return /^[a-z]$/.test(name);
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) return false;
  if (name.includes("--")) return false;
  return true;
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
 *
 * `triggerHint` is the trigger text that appears in the new row's first
 * column. When omitted, we emit the `<replace this with...>` placeholder
 * so a custom skill author finds the spot via grep. Stock skills pass
 * their manifest's `resolverRow.trigger` so the row is meaningful out of
 * the box.
 */
export function insertSkillRow(content: string, name: string, triggerHint?: string): string {
  const trigger = triggerHint ?? `<replace this with the trigger for \`${name}\`>`;
  const row = `| ${trigger} | \`skills/${name}/SKILL.md\` |`;
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
// Stock skill manifests: shipped under `templates/skills/<name>/`
// ---------------------------------------------------------------------------

/**
 * Shape of `templates/skills/<name>/MANIFEST.json`. A stock skill template
 * always ships a SKILL.md plus the hook code its `type` implies. The
 * `resolverRow.trigger` is what the CLI writes into RESOLVER.md when the
 * stock skill is installed.
 */
export interface SkillManifest {
  /** kebab-case slug; matches both folder name and the CLI argument. */
  name: string;
  /** Skill type. Drives type-specific install hints; cannot conflict with --type. */
  type: SkillType;
  /** Display title for `list-skills`. */
  title: string;
  /** One-paragraph description for `list-skills` and post-install output. */
  description: string;
  /** Env vars the consumer needs to set. Each gets appended to `.env.example`. */
  envVars?: Array<{ name: string; required?: boolean; help: string }>;
  /** Where the SKILL.md lives in the template, and where to write it in the consumer repo. */
  skill: { from: string; to: string };
  /** Trigger text + section name for the appended RESOLVER row. */
  resolverRow: { trigger: string; section: string };
  /** Hook code files. Source-to-destination map; paths are relative on both sides. */
  files: Array<{ from: string; to: string }>;
  /** Optional next-steps lines printed after a successful install. */
  nextSteps?: string[];
}

/**
 * Resolve the path to the `templates/` directory shipped with this
 * package. Works in both the source layout (during local development
 * and tests) and the published `dist/` layout (after `tsup` builds and
 * `npm publish` copies the `templates/` allowlisted via `package.json`).
 *
 * Walks up from the CLI module's location until it finds a directory
 * containing `templates/skills/`. Throws if nothing matches inside a few
 * levels — safer than silently returning a wrong path.
 */
export function findTemplatesDir(startFromUrl: string = import.meta.url): string {
  const start = fileURLToPath(startFromUrl);
  let dir = dirname(start);
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, "templates", "skills");
    if (existsSync(candidate)) return join(dir, "templates");
    dir = dirname(dir);
  }
  throw new Error(
    "agentickit: could not locate the bundled templates/ directory. " +
      "If you're running from source, make sure packages/agentickit/templates/ exists.",
  );
}

/**
 * Read every `MANIFEST.json` under `templates/skills/<name>/` and return
 * the parsed manifests. Skips any folder without a manifest so partial
 * scaffolds-in-progress don't crash `list-skills`.
 */
export async function listSkillManifests(): Promise<SkillManifest[]> {
  const root = join(findTemplatesDir(), "skills");
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const manifests: SkillManifest[] = [];
  for (const name of entries) {
    const manifestPath = join(root, name, "MANIFEST.json");
    if (!existsSync(manifestPath)) continue;
    const text = await readFile(manifestPath, "utf8");
    manifests.push(JSON.parse(text) as SkillManifest);
  }
  return manifests;
}

/**
 * Look up a single stock skill manifest by name. Returns null when the
 * name does not match any bundled template (the caller falls back to the
 * custom-scaffold path).
 */
async function tryLoadStockSkillManifest(name: string): Promise<SkillManifest | null> {
  let templatesRoot: string;
  try {
    templatesRoot = findTemplatesDir();
  } catch {
    return null;
  }
  const manifestPath = join(templatesRoot, "skills", name, "MANIFEST.json");
  if (!existsSync(manifestPath)) return null;
  const text = await readFile(manifestPath, "utf8");
  return JSON.parse(text) as SkillManifest;
}

/**
 * Append the manifest's env vars to `.env.example`, but only the ones not
 * already documented (so re-running `add-skill` on an existing project
 * is idempotent). Each var gets its `help` line as a comment above it.
 */
async function ensureEnvVarsDocumented(
  cwd: string,
  manifest: { title: string; name: string; envVars?: Array<{ name: string; help: string }> },
): Promise<void> {
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
  const header = `# ${manifest.title} (added by \`agentickit add-skill ${manifest.name}\`)`;
  const next = existing
    ? `${existing.replace(/\n+$/, "")}\n\n${header}\n${block.join("\n").trim()}\n`
    : `${header}\n${block.join("\n").trim()}\n`;
  await writeTextFile(path, next);
}

// ---------------------------------------------------------------------------
// Agent templates: list-agents + add-agent
// ---------------------------------------------------------------------------

/**
 * Shape of `templates/agents/<type>/MANIFEST.json`. File paths AND
 * contents support `{{NAME}}` / `{{NAME_PASCAL}}` / `{{NAME_CAMEL}}`
 * placeholders so a scaffolded agent uses the consumer's chosen name.
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

const HELP_TEXT = `agentickit — scaffold and grow your .pilot/ skills folder.

Usage:
  npx agentickit <command>

Commands:
  init                              Create .pilot/ with one example skill.
  add-skill <name> [--type T]       Add a skill. If <name> matches a stock
                                    template (see \`list-skills\`), the stock
                                    skill installs (with its real hook code).
                                    Otherwise scaffolds a custom skill from a
                                    placeholder shaped by --type.
                                    --type defaults to "text".
                                    Valid types: text, server-tool, ui-component.
  list-skills                       List stock skills you can install by name.
  list-agents                       List stock agent templates.
  add-agent <name> [--type T]       Scaffold an agent. --type defaults to "chat".
                                    Example: agentickit add-agent support --type chat

Options:
  -h, --help        Show this help.
  -v, --version     Show version.
`;

const RESOLVER_TEMPLATE = `# Agent Resolver

The model reads this file and every \`skills/<name>/SKILL.md\` referenced
below as its system prompt at startup. Edit this file to change the
agent's persona and routing table. Edit the skill files to change how
each capability is invoked.

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
 * Template emitted by `add-skill <name>` for a CUSTOM (non-stock) skill.
 * Uses the `<replace this>` placeholder convention so a new author can
 * grep for `<replace` to find every spot that needs filling in. Avoids
 * the literal token `TODO` because consumers tend to grep their own
 * repos for it and a freshly scaffolded skill should not show up in that
 * result on day one.
 */
function renderSkillTemplate(name: string, type: SkillType = "text"): string {
  const toolListByType: Record<SkillType, string> = {
    // No inline `# ...` comments inside the YAML tools list — the
    // frontmatter parser treats them as part of the value and downstream
    // tests have no clean way to strip them. Comments live in prose
    // sections instead.
    text: "  - <name_of_your_tool_or_remove_this_section>",
    "server-tool": "  - <name_of_your_server_tool>",
    "ui-component": `  - show_${toCamelCase(name)}\n  - hide_${toCamelCase(name)}`,
  };
  const triggerByType: Record<SkillType, string> = {
    text: '  - "<replace with a user phrasing that should fire this skill>"',
    "server-tool": '  - "<replace with a user phrasing that triggers the server call>"',
    "ui-component": `  - "show me ${name}"\n  - "hide ${name}"`,
  };
  return `---
name: ${name}
description: <replace this with a one-sentence summary of what this skill does>
triggers:
${triggerByType[type]}
tools:
${toolListByType[type]}
mutating: false
---

# When to use

<replace this with a plain English description of when to consult this
skill, including user phrasings, page contexts, and any disambiguators>

# How to use

<replace this with numbered steps, tool call order, and formatting rules.
Keep it tight; the model follows the order you give>

# Anti-patterns

<replace this with one-line "do NOT" rules; optional but useful for
skills where the model is likely to over-reach>
`;
}

/** Stub plugin for `add-skill <name> --type server-tool`. */
function renderCustomServerToolPluginStub(name: string): string {
  const camel = toCamelCase(name);
  const pascal = toPascalCase(name);
  return `import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";

/**
 * Server-tool skill scaffold for "${name}".
 *
 * Replace the schema, the description, and the fetch URL to match your
 * actual endpoint. The skill body in .pilot/skills/${name}/SKILL.md
 * teaches the model when to call this; this file owns the HOW.
 */
export function ${pascal}Plugin(): null {
  usePilotAction({
    name: "${camel}",
    description: "<replace this with a one-line description of what this tool does>",
    parameters: z.object({
      // <replace this with the real input schema>
      query: z.string().describe("<replace this with the real param description>"),
    }),
    handler: async ({ query }) => {
      const res = await fetch("/api/${name}", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        return { ok: false as const, code: res.status, reason: await res.text() };
      }
      return { ok: true as const, data: (await res.json()) as unknown };
    },
    mutating: false,
  });
  return null;
}
`;
}

/** Stub server endpoint for `add-skill <name> --type server-tool`. */
function renderCustomServerToolEndpointStub(name: string): string {
  return `/**
 * Server endpoint for the "${name}" skill.
 *
 * Wire this into your Hono / Express / Next.js handler as POST /api/${name}.
 * The client plugin at src/plugins/${name}.tsx calls this endpoint.
 */
export async function ${toCamelCase(name)}Route(req: Request): Promise<Response> {
  // <replace this with parsing of the request body and a real fetch / db call>
  const body = (await req.json()) as { query?: unknown };
  if (typeof body.query !== "string") {
    return new Response(JSON.stringify({ error: "missing query" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // <replace this with the real implementation>
  const result = { received: body.query };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
`;
}

/** Stub plugin for `add-skill <name> --type ui-component`. */
function renderCustomUiComponentPluginStub(name: string): string {
  const camel = toCamelCase(name);
  const pascal = toPascalCase(name);
  return `import { useState } from "react";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";

/**
 * UI-component skill scaffold for "${name}".
 *
 * Registers show_${camel} / hide_${camel} actions and exposes the panel's
 * visibility state to the agent. Replace the panel body with a real
 * component (chart, form, drawer, dialog — whatever your skill is).
 *
 * The skill body in .pilot/skills/${name}/SKILL.md teaches the model when
 * to spawn vs. dismiss; this file owns the HOW.
 */
export function ${pascal}Plugin(): null {
  const [visible, setVisible] = useState(false);

  usePilotState({
    name: "${camel}_visibility",
    description: "Whether the ${name} panel is currently visible.",
    value: { visible },
    schema: z.object({ visible: z.boolean() }),
  });

  usePilotAction({
    name: "show_${camel}",
    description: "Spawn the ${name} panel inline. See the SKILL.md for triggers and anti-patterns.",
    parameters: z.object({}),
    handler: () => {
      setVisible(true);
      return { ok: true as const };
    },
    mutating: false,
  });

  usePilotAction({
    name: "hide_${camel}",
    description: "Remove the ${name} panel from view.",
    parameters: z.object({}),
    handler: () => {
      setVisible(false);
      return { ok: true as const };
    },
    mutating: false,
  });

  return null;
}

export function ${pascal}Panel(props: { visible: boolean }): JSX.Element | null {
  if (!props.visible) return null;
  return (
    <div role="region" aria-label="${name} panel">
      {/* <replace this with the real panel body> */}
      <p>${name} placeholder</p>
    </div>
  );
}
`;
}

// ---------------------------------------------------------------------------
// Shell entrypoint
// ---------------------------------------------------------------------------

/**
 * Detect whether THIS file is being run as the program entry (e.g. via
 * the `agentickit` bin), versus being imported by tests. Walks
 * `realpathSync` on both sides so symlinked invocations (pnpm, npx) match.
 */
function isScriptEntrypoint(): boolean {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isScriptEntrypoint()) {
  void run(process.argv, process.cwd()).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}
