"use client";

/**
 * `useAgents()`, list every agent currently in the multi-agent registry.
 *
 * Subscribes via `useSyncExternalStore` and returns
 * `ReadonlyArray<{ id, agent }>` in registration order. Re-renders the
 * calling component when any registration changes (add / replace /
 * remove). The returned array reference is stable when the registry
 * has not mutated, so `.map` over it in render is safe.
 *
 * Returns an empty array when no `<PilotAgentRegistry>` is mounted.
 * Useful for building agent-picker UIs:
 *
 * ```tsx
 * function AgentPicker(props: { value: string; onChange: (id: string) => void }) {
 *   const agents = useAgents();
 *   return (
 *     <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
 *       {agents.map(({ id }) => <option key={id} value={id}>{id}</option>)}
 *     </select>
 *   );
 * }
 * ```
 */

import { useCallback, useContext, useSyncExternalStore } from "react";
import type { AbstractAgent } from "@ag-ui/client";
import { PilotAgentRegistryContext } from "../context.js";

const EMPTY: ReadonlyArray<{ readonly id: string; readonly agent: AbstractAgent }> =
  Object.freeze([]);

export function useAgents(): ReadonlyArray<{
  readonly id: string;
  readonly agent: AbstractAgent;
}> {
  const registry = useContext(PilotAgentRegistryContext);

  const subscribe = useCallback(
    (listener: () => void): (() => void) =>
      registry ? registry.subscribe(listener) : () => {},
    [registry],
  );
  const getSnapshot = useCallback(() => registry?.list() ?? EMPTY, [registry]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
