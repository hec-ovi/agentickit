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
 * Intentionally synchronous and best-effort: a missing `.pilot/` returns
 * `null`, malformed SKILL.md is skipped rather than thrown, and edge
 * runtimes (where `node:fs` is unavailable) also return `null`. The goal
 * is to never break the handler over a misconfigured protocol — the
 * inline `system` option is always the authoritative fallback.
 */

import { createRequire } from "node:module";
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
 */
export function loadPilotProtocol(options: LoadPilotProtocolOptions = {}): string | null {
  const node = loadNodeBuiltins();
  if (!node) return null;
  const { fs, path } = node;

  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? ".pilot";
  const absDir = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);

  if (!fs.existsSync(absDir)) return null;

  const sections: string[] = [];

  const resolverPath = path.join(absDir, "RESOLVER.md");
  if (fs.existsSync(resolverPath)) {
    const content = safeReadUtf8(fs, resolverPath);
    if (content) sections.push(content.trim());
  }

  const skillsDir = path.join(absDir, "skills");
  if (fs.existsSync(skillsDir)) {
    let skillNames: string[];
    try {
      skillNames = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      skillNames = [];
    }

    for (const name of skillNames) {
      const skillPath = path.join(skillsDir, name, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      const md = safeReadUtf8(fs, skillPath);
      if (!md) continue;
      const rendered = renderSkill(md);
      if (rendered) sections.push(rendered);
    }
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n---\n\n");
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
