import type { ReactNode } from "react";
import type { z } from "zod";

/**
 * Arguments handed to a {@link PilotActionRegistration.renderAndWait} render
 * prop while the model's tool call is suspended. The consumer's UI must
 * eventually call exactly one of `respond` or `cancel` to release the
 * suspended Promise inside the provider's `onToolCall` and let the model
 * see the tool result.
 *
 * Calling neither leaves the tool call hanging indefinitely (the model
 * stays "running"). Calling both is harmless, the second invocation is
 * ignored because the resolver runs at most once.
 */
export interface PilotRenderAndWaitArgs<TParams = unknown, TResult = unknown> {
  /** Parsed tool-call input (already validated against `parameters`). */
  input: TParams;
  /**
   * Resolve with the value the model should observe as the tool's output.
   * The shape must match `TResult`; the value is JSON-serialized into the
   * `output-available` part on the wire.
   */
  respond: (value: TResult) => void;
  /**
   * Cancel the tool call. The model receives a standard
   * `{ ok: false, reason }` payload so the conversation can continue
   * gracefully rather than stall on an unresolved tool call.
   */
  cancel: (reason?: string) => void;
}

/**
 * Render-prop signature for {@link PilotActionRegistration.renderAndWait}.
 * Returns a React node that owns its own UI (form, picker, embedded card,
 * portal, anything the consumer wants) and calls back via `respond` or
 * `cancel` when the user has decided.
 */
export type PilotRenderAndWait<TParams = unknown, TResult = unknown> = (
  args: PilotRenderAndWaitArgs<TParams, TResult>,
) => ReactNode;

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
  /**
   * Pause-and-resume render prop. When set, this REPLACES `handler`: the
   * model's tool call is suspended; the provider renders the returned node
   * inside its own tree (next to the confirm modal) and waits for the
   * consumer to call `respond(value)` (which becomes the tool's output and
   * the model resumes) or `cancel(reason)` (which returns the standard
   * declined payload `{ ok: false, reason }` so the conversation continues).
   *
   * `handler` is still required by the type system but is ignored at
   * dispatch time when `renderAndWait` is set. Idiomatic shape:
   *
   *   usePilotAction({
   *     name: "pick_date",
   *     parameters: z.object({ prompt: z.string() }),
   *     handler: () => null as never,  // unused; renderAndWait responds
   *     renderAndWait: ({ input, respond, cancel }) => (
   *       <DatePicker
   *         label={input.prompt}
   *         onPick={(date) => respond({ date })}
   *         onSkip={() => cancel("user skipped")}
   *       />
   *     ),
   *   });
   *
   * If `mutating: true` is also set, the confirm modal appears first; if
   * declined, the renderAndWait UI never shows and the standard cancelled
   * sentinel is returned. This lets you compose "approve sending email" +
   * "edit before sending" in one action.
   */
  renderAndWait?: PilotRenderAndWait<TParams, TResult>;
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
  | {
      type: "tool-call";
      toolName: string;
      args: unknown;
      status: "generating" | "done";
      result?: unknown;
    };

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

