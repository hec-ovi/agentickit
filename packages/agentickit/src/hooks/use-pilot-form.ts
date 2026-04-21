import type { UseFormReturn } from "react-hook-form";
import type { PilotFormRegistration } from "../types.js";

export interface UsePilotFormOptions {
  /**
   * Human-readable name used in tool definitions. Defaults to "form".
   */
  name?: string;
  /**
   * Enable ghost-fill preview (the AI's proposed values render as dimmed
   * placeholders that the user confirms with Tab). Defaults to true.
   */
  ghostFill?: boolean;
}

/**
 * Integrate a react-hook-form `useForm` result with the copilot.
 *
 * Auto-exposes three tools: set_form_field, submit_form, reset_form,
 * with schemas derived from the form's resolver.
 *
 * Implementation pending.
 */
export function usePilotForm<TFieldValues extends Record<string, unknown>>(
  form: UseFormReturn<TFieldValues>,
  _options: UsePilotFormOptions = {},
): UseFormReturn<TFieldValues> {
  // Real implementation wraps the form and registers tools on mount.
  // For now we pass it through unchanged so the public API compiles.
  return form;
}

export type { PilotFormRegistration };
