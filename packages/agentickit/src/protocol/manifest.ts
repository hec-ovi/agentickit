import type { LoadedSkill } from "../types.js";
import { parseResolver } from "./resolver.js";
import { parseSkill } from "./skill.js";

/**
 * Machine-readable index of a `.pilot/` folder.
 * Written by the `pilot build` CLI; consumed by the runtime at init time.
 * Having this pre-built avoids parsing markdown on every page load.
 */
export interface PilotManifest {
  version: 1;
  resolver: string;
  skills: Array<{
    name: string;
    path: string;
    description: string;
    triggers?: string[];
    tools?: string[];
    mutating?: boolean;
  }>;
  conventions?: string[];
}

/**
 * Fetch and validate a manifest from a URL (typically `/pilot/manifest.json`
 * served from the consumer app's public directory).
 */
export async function loadManifest(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<PilotManifest> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load .pilot manifest from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  const json = (await response.json()) as unknown;
  return validateManifest(json);
}

function validateManifest(input: unknown): PilotManifest {
  if (!input || typeof input !== "object") {
    throw new Error(".pilot manifest must be a JSON object");
  }
  const m = input as Record<string, unknown>;
  if (m.version !== 1) {
    throw new Error(`.pilot manifest version must be 1 (got ${String(m.version)})`);
  }
  if (typeof m.resolver !== "string") {
    throw new Error(".pilot manifest missing `resolver` string");
  }
  if (!Array.isArray(m.skills)) {
    throw new Error(".pilot manifest missing `skills` array");
  }
  // Trust the shape of each skill entry — it's produced by our own CLI.
  // If we ever accept hand-written manifests we'll tighten this.
  return m as unknown as PilotManifest;
}

/**
 * Build a LoadedSkill from a skill's markdown contents and a binding-presence check.
 * Used by the runtime after fetching each SKILL.md referenced in the manifest.
 */
export function buildLoadedSkill(markdown: string, path: string, hasBinding: boolean): LoadedSkill {
  const { frontmatter, body } = parseSkill(markdown);
  return { frontmatter, body, path, hasBinding };
}

/**
 * Convenience: fetch + parse RESOLVER.md from a URL.
 */
export async function loadResolver(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReturnType<typeof parseResolver>> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Failed to load RESOLVER.md from ${url}: ${response.status}`);
  }
  return parseResolver(await response.text());
}
