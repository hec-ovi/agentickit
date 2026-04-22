#!/usr/bin/env node
/**
 * `agentickit` CLI — scaffolds and grows `.pilot/` folders.
 *
 * Two subcommands for v0.1:
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
import { realpathSync } from "node:fs";
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
  const row = `| TODO: describe when to trigger \`${name}\` | \`skills/${name}/SKILL.md\` |`;
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
// Templates
// ---------------------------------------------------------------------------

const VERSION = "0.0.0";

const HELP_TEXT = `agentickit — scaffold and grow your .pilot/ folder.

Usage:
  npx agentickit <command>

Commands:
  init              Create .pilot/ with one example skill.
  add-skill <name>  Add a new skill and register it in RESOLVER.md.
                    <name> must be kebab-case (e.g. chart, detail-form).

Options:
  -h, --help        Show this help.
  -v, --version     Show version.

Docs:
  https://github.com/hec-ovi/agentickit
`;

const RESOLVER_TEMPLATE = `# Agent Resolver

This is the dispatcher for your in-app copilot. The model reads this file and
every \`skills/<name>/SKILL.md\` as its system prompt at startup. Edit this
file to change the agent's persona, formatting rules, and capability routing.
Edit the skill files to change how each capability is invoked.

<!-- Persona + formatting rules. The model reads this prose verbatim. -->

You are a concise, helpful assistant embedded in this app. Prefer calling
tools over describing what the user should do. Reply in short markdown.

## Skills

| Trigger                         | Skill                         |
| ------------------------------- | ----------------------------- |
| "show example", "run example"   | \`skills/example/SKILL.md\`   |
`;

const EXAMPLE_SKILL_TEMPLATE = `---
name: example
description: A one-sentence summary of what this skill does.
tools:
  - example_tool
mutating: false
---

# When to use

Describe the triggers and edge cases in plain English. The model reads this
body verbatim and uses it to decide whether to call the tool(s) listed in the
frontmatter.

Example triggers:
- "show me the example"
- "run the example"

# How to use

Steps, tool call order, formatting rules. Keep it short and direct.

1. Call \`example_tool\` with whatever arguments the user provided.
2. Report the result in a single sentence.

# Anti-patterns

Things not to do. One-line reasons.

- Don't call \`example_tool\` if the user only asked a question — answer in prose instead.
`;

/** Template for `add-skill`: same shape as the example, with name filled in and TODO markers. */
function renderSkillTemplate(name: string): string {
  return `---
name: ${name}
description: TODO — one-sentence summary of what this skill does.
tools:
  - TODO_replace_with_tool_name
mutating: false
---

# When to use

TODO — describe the triggers and edge cases in plain English.

Example triggers:
- "TODO example user phrasing"

# How to use

TODO — steps, tool call order, formatting rules.

# Anti-patterns

TODO — things not to do and why.
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
