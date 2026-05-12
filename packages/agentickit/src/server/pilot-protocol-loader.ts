/**
 * Server-side loader for a consumer app's `.pilot/` folder.
 *
 * This is the runtime bridge that turns hand-authored markdown into the
 * system prompt fed to the model. Consumers write:
 *
 *   my-app/.pilot/
 *     RESOLVER.md
 *     skills/
 *       todos/SKILL.md
 *       chart/SKILL.md
 *       ...
 *
 * `createPilotHandler` calls `loadPilotProtocol()` at factory time when the
 * caller omits `system`, so a zero-config route can be:
 *
 *   export const POST = createPilotHandler({ model: "..." });
 *
 * and all behavioral guidance lives in markdown the user can edit without
 * touching TypeScript.
 *
 * RESOLVER-driven (gbrain/Garry Tan "Thin Harness, Fat Skills" model). The
 * load order is the order skills appear in `RESOLVER.md`, NOT alphabetical.
 * RESOLVER is the authoritative dispatch table; if a skill folder exists on
 * disk but is not referenced in RESOLVER, it is treated as orphaned and
 * skipped with a warning. If RESOLVER references a skill whose file is
 * missing, that row is skipped with a warning. Both warnings go to
 * `console.warn` (always-on; mirrors the rest of the package's startup
 * diagnostics) so a misconfigured `.pilot/` is loud, not silent.
 *
 * If `RESOLVER.md` is absent but a `skills/` folder exists, NOTHING loads
 * and we warn. The doctrine is "RESOLVER is management"; an unmanaged
 * skills folder is not a valid configuration. The CLI's `init` always
 * writes a RESOLVER, so this only fires on hand-rolled setups.
 *
 * Intentionally synchronous and best-effort: a missing `.pilot/` returns
 * `null`, malformed SKILL.md is skipped rather than thrown, and edge
 * runtimes (where `node:fs` is unavailable) also return `null`. The goal
 * is to never break the handler over a misconfigured protocol — the
 * inline `system` option is always the authoritative fallback.
 */

import { createRequire } from "node:module";
import { parseResolver } from "../protocol/resolver.js";
import { parseSkill } from "../protocol/skill.js";

// Resolve Node built-ins once, at module load. `createRequire` against
// `import.meta.url` is the ESM-canonical way to pull CJS built-ins; it
// returns a synchronous, cached require that's safe to call later. If the
// runtime doesn't ship `node:module` (edge / browser), the top-level import
// throws and the whole server-only module fails to load — which is the
// correct behavior because `fs` / `path` aren't available there anyway.
const nodeRequire: NodeRequire = createRequire(import.meta.url);

export interface LoadPilotProtocolOptions {
  /**
   * Directory containing RESOLVER.md and `skills/`. Relative paths are
   * resolved against `cwd`. Defaults to `.pilot`.
   */
  dir?: string;
  /**
   * Working directory used to resolve a relative `dir`. Defaults to
   * `process.cwd()`. Exposed primarily for tests.
   */
  cwd?: string;
  /**
   * Receives every diagnostic the loader would otherwise send to
   * `console.warn`. Tests use this to assert on warnings without spying
   * on the global console; production callers can also wire it through to
   * structured logging if they want to. When omitted the loader still
   * writes to `console.warn` so a developer running `pnpm dev` sees the
   * same warnings without any extra wiring.
   */
  onWarn?: (message: string) => void;
}

/**
 * Read a consumer app's `.pilot/` folder and compose a single system
 * prompt string. Returns `null` when no `.pilot/` folder is present or
 * when the Node filesystem APIs are unavailable (e.g. edge runtime).
 *
 * The composed shape is:
 *
 *   <RESOLVER.md body>
 *
 *   ---
 *
 *   ## Skill: <name>
 *   <description>
 *
 *   <body>
 *
 *   ---
 *
 *   ...
 *
 * Skills appear in the order they are listed in `RESOLVER.md`. A skill
 * folder that is NOT referenced by `RESOLVER.md` is skipped (with a
 * warning) — RESOLVER is the authoritative source of truth for what the
 * agent ships with.
 */
export function loadPilotProtocol(options: LoadPilotProtocolOptions = {}): string | null {
  const node = loadNodeBuiltins();
  if (!node) return null;
  const { fs, path } = node;

  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? ".pilot";
  const absDir = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
  const warn = options.onWarn ?? defaultWarn;

  if (!fs.existsSync(absDir)) return null;

  const sections: string[] = [];

  const resolverPath = path.join(absDir, "RESOLVER.md");
  const resolverExists = fs.existsSync(resolverPath);
  const skillsDir = path.join(absDir, "skills");
  const skillsDirExists = fs.existsSync(skillsDir);

  // Strict mode: RESOLVER.md is the management layer. No RESOLVER means
  // no skills load, regardless of what is on disk under skills/.
  if (!resolverExists) {
    if (skillsDirExists) {
      warn(
        `[agentickit] .pilot/skills/ exists but RESOLVER.md is missing — no skills will load. Run \`npx agentickit init\` or add a RESOLVER.md with a Trigger -> Skill table.`,
      );
    }
    return null;
  }

  const resolverRaw = safeReadUtf8(fs, resolverPath);
  if (!resolverRaw) return null;
  sections.push(resolverRaw.trim());

  // Pull the local-skill rows out of the parsed resolver. External
  // pointers (`GStack:`, `Check `, `Read `) are intentionally ignored at
  // load time — they exist in the resolver as guidance for the model but
  // do not correspond to a local SKILL.md.
  const resolverEntries = parseResolver(resolverRaw).filter((e) => !e.isExternalPointer);

  // Dedupe in resolver order so a skill referenced by multiple triggers
  // still only loads once. The first reference wins.
  const orderedSkillPaths: string[] = [];
  const seen = new Set<string>();
  for (const entry of resolverEntries) {
    if (seen.has(entry.skillPath)) continue;
    seen.add(entry.skillPath);
    orderedSkillPaths.push(entry.skillPath);
  }

  // Walk the skills/ directory once so we can flag orphans (files that
  // exist but RESOLVER does not reference). This is a separate concern
  // from missing files (RESOLVER references them but they do not exist).
  let onDiskSkillPaths: string[] = [];
  if (skillsDirExists) {
    try {
      onDiskSkillPaths = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `skills/${entry.name}/SKILL.md`)
        .filter((rel) => fs.existsSync(path.join(absDir, rel)));
    } catch {
      onDiskSkillPaths = [];
    }
  }

  // Render every skill RESOLVER references, in resolver order. Missing
  // files warn and skip; the loader does not throw.
  for (const skillRel of orderedSkillPaths) {
    const skillPath = path.join(absDir, skillRel);
    if (!fs.existsSync(skillPath)) {
      warn(
        `[agentickit] RESOLVER.md references \`${skillRel}\` but the file is missing. Either remove the row or create the skill with \`npx agentickit add-skill <name>\`.`,
      );
      continue;
    }
    const md = safeReadUtf8(fs, skillPath);
    if (!md) continue;
    const rendered = renderSkill(md);
    if (rendered) sections.push(rendered);
  }

  // Orphan check: skill folders on disk that RESOLVER does not reference.
  // These would silently never reach the model under the new doctrine, so
  // we warn loudly. The fix is always one of: add a RESOLVER row, or
  // delete the skill folder.
  for (const onDisk of onDiskSkillPaths) {
    if (seen.has(onDisk)) continue;
    warn(
      `[agentickit] Orphan skill: \`${onDisk}\` exists on disk but is not referenced in RESOLVER.md. The skill will NOT load. Add a row to RESOLVER.md or delete the folder.`,
    );
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n---\n\n");
}

function defaultWarn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(message);
}

/**
 * Resolve `node:fs` and `node:path` via the cached ESM-safe require built
 * at module load. A failure here is exceptional (it means the Node runtime
 * suddenly can't load its own built-ins) — we swallow it so the loader
 * still returns `null` rather than throwing from a call site that asks a
 * simple "does `.pilot/` exist?" question.
 */
function loadNodeBuiltins(): {
  fs: typeof import("node:fs");
  path: typeof import("node:path");
} | null {
  try {
    return {
      fs: nodeRequire("node:fs") as typeof import("node:fs"),
      path: nodeRequire("node:path") as typeof import("node:path"),
    };
  } catch {
    return null;
  }
}

function safeReadUtf8(fs: typeof import("node:fs"), file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Format one skill file into a prompt section. Malformed frontmatter is
 * swallowed and the file is skipped — a typo in one SKILL.md never breaks
 * the whole handler.
 */
function renderSkill(markdown: string): string | null {
  try {
    const { frontmatter, body } = parseSkill(markdown);
    const lines = [`## Skill: ${frontmatter.name}`, "", frontmatter.description];
    if (body.trim().length > 0) {
      lines.push("", body.trim());
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}
