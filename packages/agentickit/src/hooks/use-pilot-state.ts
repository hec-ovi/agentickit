import type { z } from "zod";
import type { PilotStateRegistration } from "../types.js";

export interface UsePilotStateOptions<T> {
  name: string;
  description: string;
  value: T;
  schema: z.ZodType<T>;
  /**
   * Omit to expose the state as read-only. Present → AI auto-gets an
   * `update_<name>` tool generated from the Zod schema, mirroring
   * assistant-ui's Interactables pattern.
   */
  setValue?: (next: T) => void;
}

/**
 * Expose a slice of app state to the AI.
 *
 * Implementation pending — this stub locks the public signature.
 */
export function usePilotState<T>(_options: UsePilotStateOptions<T>): void {
  return undefined as unknown as void;
}

export type { PilotStateRegistration };
