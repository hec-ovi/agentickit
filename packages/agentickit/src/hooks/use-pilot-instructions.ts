"use client";

import { useContext, useEffect } from "react";
import { PilotRegistryContext } from "../context.js";
import { isDev } from "../env.js";

/**
 * Register a per-page system-prompt fragment with the active `<Pilot>`.
 *
 * Mounted fragments are serialized into the request body's `instructions`
 * array on every send and appended to the composed system prompt by the
 * server (after server-owned + client-system fragments, before live UI
 * state). Unmounting cleans up automatically.
 *
 * Useful for page-scoped guidance the model needs only while a particular
 * route or component is visible. Examples:
 *
 *   - `usePilotInstructions("On the packing page; favor packing edits over global trip changes.")`
 *   - `usePilotInstructions("Inside the booking review; double-confirm any destructive action.")`
 *
 * Multiple components can each register their own fragment; all live
 * fragments are appended in registration order.
 */
export function usePilotInstructions(text: string): void {
  const ctx = useContext(PilotRegistryContext);

  useEffect(() => {
    if (!ctx) {
      if (isDev()) {
        console.warn(
          "[agentickit] usePilotInstructions was called outside a <Pilot> provider. " +
            "The fragment will not be sent to the model.",
        );
      }
      return;
    }
    if (typeof text !== "string" || text.length === 0) return;
    const id = ctx.registerInstructions(text);
    return () => ctx.deregisterInstructions(id);
  }, [ctx, text]);
}
