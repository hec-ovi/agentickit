"use client";

/**
 * `useAgent(id)`, read an agent from the multi-agent registry by id.
 *
 * Subscribes via `useSyncExternalStore` so the calling component
 * re-renders when:
 *   - the requested id is registered (returning the agent reference);
 *   - the id is replaced by a new registration (returning the new ref);
 *   - the id is unregistered (returning `undefined`).
 *
 * Returns `undefined` when no `<PilotAgentRegistry>` is mounted above
 * the caller, or when the requested id has no registered agent. The
 * undefined case is the consumer's to handle, typically by rendering
 * a placeholder until the agent is registered, or by guarding the
 * Pilot mount.
 *
 * Companion to `useRegisterAgent` (writes) and `useAgents` (lists).
 */

import { useCallback, useContext, useSyncExternalStore } from "react";
import type { AbstractAgent } from "@ag-ui/client";
import { PilotAgentRegistryContext } from "../context.js";

export function useAgent(id: string): AbstractAgent | undefined {
  const registry = useContext(PilotAgentRegistryContext);

  // Stable subscribe / getSnapshot bound to this id. The empty-fallback
  // pair makes the hook safe to call when no registry is mounted: it
  // returns undefined and never subscribes.
  const subscribe = useCallback(
    (listener: () => void): (() => void) =>
      registry ? registry.subscribe(listener) : () => {},
    [registry],
  );
  const getSnapshot = useCallback(
    (): AbstractAgent | undefined => registry?.getAgent(id),
    [registry, id],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
