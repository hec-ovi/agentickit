import type { z } from "zod";

/**
 * A registered piece of app state exposed to the AI.
 * Read-only if setValue is omitted; otherwise the AI can propose updates
 * that flow through the developer-provided setter.
 */
export interface PilotStateRegistration<T = unknown> {
  id: string;
  name: string;
  description: string;
  value: T;
  schema: z.ZodType<T>;
  setValue?: (next: T) => void;
}

/**
 * A tool the AI can invoke. The handler runs in the browser.
 */
export interface PilotActionRegistration<TParams = unknown, TResult = unknown> {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams) => Promise<TResult> | TResult;
  /**
   * When true, the runtime prompts the user for confirmation before invoking.
   * Mirrors the `mutating: true` flag from the SKILL.md convention.
   */
  mutating?: boolean;
}

/**
 * A registered form integration. Exposes set_field / submit / reset tools
 * plus optional ghost-fill streaming preview.
 */
export interface PilotFormRegistration {
  id: string;
  name: string;
  fieldSchemas: Record<string, z.ZodType<unknown>>;
  setValue: (field: string, value: unknown) => void;
  submit: () => Promise<void>;
  reset: () => void;
}

/**
 * A message in the copilot chat, mapped from Vercel AI SDK `UIMessage`.
 */
export interface PilotMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: PilotMessagePart[];
  createdAt?: Date;
}

export type PilotMessagePart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; args: unknown; status: "generating" | "done"; result?: unknown };

/**
 * Provider configuration for the <Pilot> component.
 */
export interface PilotConfig {
  /**
   * Path to the API route that proxies to the LLM.
   * @default "/api/pilot"
   */
  apiUrl?: string;
  /**
   * Model ID in the Vercel AI SDK v6 format (e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4-5").
   * Forwarded to the server as the `model` field; the server decides the provider.
   */
  model?: string;
  /**
   * URL or relative path from which the runtime fetches `.pilot/manifest.json`.
   * If undefined, the protocol layer is not loaded and the package runs in hook-only mode.
   */
  pilotProtocolUrl?: string;
  /**
   * Optional headers sent with every request (e.g. auth tokens).
   */
  headers?: Record<string, string> | (() => Record<string, string>);
}

/**
 * Parsed entry from `.pilot/RESOLVER.md`.
 */
export interface ResolverEntry {
  trigger: string;
  skillPath: string;
  section: string;
  isExternalPointer: boolean;
}

/**
 * Parsed SKILL.md frontmatter. Fields match the gbrain/Anthropic superset.
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  triggers?: string[];
  tools?: string[];
  mutating?: boolean;
  version?: string;
  allowedTools?: string[];
}

/**
 * A loaded skill from the .pilot/ folder.
 */
export interface LoadedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  path: string;
  /**
   * True when a matching usePilotAction or pilot.config.json binding exists.
   * Skills without a binding are filtered out of the system prompt to
   * prevent the LLM from hallucinating uninvokable capabilities.
   */
  hasBinding: boolean;
}
