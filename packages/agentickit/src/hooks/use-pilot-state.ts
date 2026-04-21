"use client";

import { useContext, useEffect, useRef } from "react";
import type { z } from "zod";
import { PilotRegistryContext } from "../context.js";
import { isDev } from "../env.js";
import type { PilotStateRegistration } from "../types.js";

/**
 * Arguments accepted by {@link usePilotState}.
 */
export interface UsePilotStateOptions<T> {
  /**
   * Stable identifier for this state slice. Used both as the context key the
   * LLM sees and (if `setValue` is supplied) as the suffix of the generated
   * `update_<name>` tool.
   */
  name: string;
  /** Human-readable purpose of this state slice. */
  description: string;
  /** Current value. Passed to the LLM verbatim (JSON-serialized). */
  value: T;
  /** Zod schema describing the value. Used to generate the update tool. */
  schema: z.ZodType<T>;
  /**
   * Omit to expose the state read-only. Present → the provider auto-registers
   * an `update_<name>` action whose input schema mirrors `schema`, so the AI
   * can propose whole-value updates through a normal tool call.
   */
  setValue?: (next: T) => void;
}

/**
 * Expose a slice of React state to the AI.
 *
 * The hook re-registers on every `value` change (that's what makes it useful —
 * the LLM sees the live value) but does NOT recreate the update action tool
 * on value changes; only on `name` / `description` / `setValue`-presence
 * changes. This avoids churning the registry on every keystroke.
 *
 * Returns `void` for symmetry with the other hooks.
 */
export function usePilotState<T>(options: UsePilotStateOptions<T>): void {
  const ctx = useContext(PilotRegistryContext);

  // Volatile bits live in refs so inline callers (who typically pass a fresh
  // `z.number()` every render) don't churn the registry id on every keystroke.
  // The provider reads these lazily at tool-execution time.
  const setValueRef = useRef(options.setValue);
  setValueRef.current = options.setValue;
  const schemaRef = useRef(options.schema);
  schemaRef.current = options.schema;

  // Stable id-holder across renders. We register exactly once per
  // name/description pair and then push fresh values through
  // `updateStateValue` — deregister/register on every keystroke would cause
  // subscriber flicker and churn the id the consumer already dereferenced.
  const stateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ctx) {
      if (isDev()) {
        console.warn(
          `[agentickit] usePilotState("${options.name}") was called outside a <Pilot> provider. The state will be ignored.`,
        );
      }
      return;
    }

    const id = ctx.registerState({
      name: options.name,
      description: options.description,
      value: options.value,
      schema: schemaRef.current,
      ...(setValueRef.current ? { setValue: (next: T) => setValueRef.current?.(next) } : {}),
    });
    stateIdRef.current = id;

    return () => {
      stateIdRef.current = null;
      ctx.deregisterState(id);
    };
    // Intentionally excludes `options.value` (pushed via `updateStateValue`
    // below) and `options.schema` (lives in a ref so inline `z.number()`
    // instances don't force a full re-register on every render).
  }, [ctx, options.name, options.description]);

  // Push the latest `value` on every render without touching the registry
  // entry's id. The provider's `updateStateValue` no-ops when the reference
  // hasn't changed, so this is safe to call unconditionally.
  useEffect(() => {
    if (!ctx || stateIdRef.current === null) return;
    ctx.updateStateValue(stateIdRef.current, options.value);
  }, [ctx, options.value]);

  // Auto-generate an `update_<name>` action when the consumer supplied a
  // setter. Registered separately so its lifecycle doesn't couple to `value`
  // churn. Schema is read from a ref for the same inline-construction reason.
  const hasSetValue = options.setValue !== undefined;
  useEffect(() => {
    if (!ctx || !hasSetValue) return;

    const actionName = `update_${options.name}`;
    const id = ctx.registerAction({
      name: actionName,
      description: `Replace the current value of "${options.name}" with a new value. ${options.description}`,
      parameters: schemaRef.current,
      handler: (next) => {
        setValueRef.current?.(next as T);
        return { ok: true };
      },
      mutating: true,
    });

    return () => {
      ctx.deregisterAction(id);
    };
  }, [ctx, hasSetValue, options.name, options.description]);
}

export type { PilotStateRegistration };
