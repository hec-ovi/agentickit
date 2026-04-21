import type { z } from "zod";
import type { PilotActionRegistration } from "../types.js";

export interface UsePilotActionOptions<TParams, TResult> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams) => Promise<TResult> | TResult;
  mutating?: boolean;
}

/**
 * Register a typed action the AI can call.
 *
 * Implementation pending — this stub locks the public signature so the
 * public API contract is visible to consumers and the build compiles.
 */
export function usePilotAction<TParams, TResult>(
  _options: UsePilotActionOptions<TParams, TResult>,
): void {
  // Intentionally empty in the scaffold. Real implementation registers the
  // action with the <Pilot> provider context on mount, deregisters on unmount.
  return undefined as unknown as void;
}

export type { PilotActionRegistration };
