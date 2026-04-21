"use client";

import { useContext, useEffect, useRef } from "react";
import type { z } from "zod";
import { PilotRegistryContext } from "../context.js";
import { isDev } from "../env.js";
import type { PilotActionRegistration } from "../types.js";

/**
 * Arguments accepted by {@link usePilotAction}.
 *
 * Why Zod rather than a generic schema contract? It's the AI SDK 6 native
 * input format (`zodSchema(...)`), it's type-inferred into `handler`, and
 * every competitor we looked at (assistant-ui, CopilotKit) also standardized
 * on it in 2025-26. Keeping the contract narrow here avoids a schema
 * conversion layer.
 */
export interface UsePilotActionOptions<TParams, TResult> {
  /**
   * Tool name the LLM sees. Must be kebab-case or snake_case to stay
   * compatible with every major provider's tool-naming rules.
   */
  name: string;
  /** Human-readable purpose of the tool. Shown to the model verbatim. */
  description: string;
  /** Zod schema for the tool input. Parsed before `handler` runs. */
  parameters: z.ZodType<TParams>;
  /**
   * Runs in-browser when the AI calls this tool. The return value is
   * serialized and fed back into the model's context on the next step.
   */
  handler: (params: TParams) => Promise<TResult> | TResult;
  /**
   * When true, the runtime prompts the user for confirmation before the
   * handler runs. See {@link PilotActionRegistration.mutating}.
   */
  mutating?: boolean;
}

/**
 * Register an AI-callable action in the nearest {@link Pilot} provider.
 *
 * The registration is idempotent: the effect runs once per mount, cleans up
 * on unmount, and re-registers only when `name` or `description` changes.
 * Handler identity is captured through a ref so inline callbacks don't
 * thrash the registry on every render.
 *
 * Returns `void` — the hook is purely additive. The AI will see the tool on
 * the next `sendMessage` call, which is exactly the ergonomic shape
 * assistant-ui's `useAssistantInteractable` established.
 */
export function usePilotAction<TParams, TResult>(
  options: UsePilotActionOptions<TParams, TResult>,
): void {
  const ctx = useContext(PilotRegistryContext);

  // Stable refs for the "volatile" bits — handler / parameters / mutating —
  // so changing those between renders doesn't force a re-registration.
  const handlerRef = useRef(options.handler);
  handlerRef.current = options.handler;
  const parametersRef = useRef(options.parameters);
  parametersRef.current = options.parameters;
  const mutatingRef = useRef(options.mutating);
  mutatingRef.current = options.mutating;

  useEffect(() => {
    if (!ctx) {
      if (isDev()) {
        console.warn(
          `[agentickit] usePilotAction("${options.name}") was called outside a <Pilot> provider. The action will be ignored.`,
        );
      }
      return;
    }

    const id = ctx.registerAction({
      name: options.name,
      description: options.description,
      // We register live refs — the provider reads the current value at
      // tool-execution time, so handler/parameters updates propagate.
      parameters: parametersRef.current,
      handler: (params) => handlerRef.current(params as TParams),
      ...(mutatingRef.current !== undefined ? { mutating: mutatingRef.current } : {}),
    });

    return () => {
      ctx.deregisterAction(id);
    };
    // Re-register when identity-relevant fields change. `handler`,
    // `parameters`, and `mutating` live in refs and are consulted lazily.
  }, [ctx, options.name, options.description]);
}

export type { PilotActionRegistration };
