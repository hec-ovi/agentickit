"use client";

/**
 * `<PilotAgentRegistry>`, a top-level provider that holds a
 * `Map<agentId, AbstractAgent>` for multi-agent apps (Phase 7,
 * Agent Lock Mode).
 *
 * Mount once at the app root, ABOVE any `<Pilot>` tree that consumes
 * registered agents. Children call `useRegisterAgent(id, factory)` to
 * publish an agent; sibling components call `useAgent(id)` or
 * `useAgents()` to read.
 *
 * The provider does NOT mount any `<Pilot>` of its own; it only owns the
 * agent map. This keeps the multi-agent registry decoupled from any
 * specific chat surface, so a consumer can drive several agents from
 * different parts of the UI (sidebar for one, popup for another) and
 * still share the registry.
 *
 * Lifecycle decisions:
 *
 *   - **Last-wins on duplicate id.** Mirrors the action / state registry
 *     semantics: a remount under the same id replaces the previous
 *     registration. The handle returned by `register` includes a
 *     monotonic token so a stale `useRegisterAgent` cleanup from the
 *     unmounted-then-remounted instance only deregisters its own
 *     registration, not the fresh one that took its place.
 *   - **No automatic agent abort.** The registry stores agent references;
 *     it does not call `agent.abortRun()` when an id is unregistered
 *     because the agent may still be referenced (and running) elsewhere.
 *     `useRegisterAgent`'s cleanup explicitly calls `abortRun` since the
 *     hook owns the agent's lifecycle.
 *   - **Strict-mode safety.** `useRef` for the map + listener set means
 *     identity is stable across the dev double-invocation; the
 *     `useEffect` cleanup deregisters via the stored handle so the
 *     mount-unmount-remount sequence under StrictMode always converges
 *     to a single live registration.
 */

import { type ReactNode, useCallback, useMemo, useRef } from "react";
import type { AbstractAgent } from "@ag-ui/client";
import {
  PilotAgentRegistryContext,
  type PilotAgentRegistryContextValue,
  type RegistrationHandle,
} from "../context.js";
import { isDev } from "../env.js";

interface RegistryEntry {
  readonly id: string;
  readonly token: number;
  agent: AbstractAgent;
}

export interface PilotAgentRegistryProps {
  children: ReactNode;
}

export function PilotAgentRegistry(props: PilotAgentRegistryProps): ReactNode {
  // Mutable Map of id -> entry (last-wins). Entry includes the monotonic
  // token so a stale cleanup can verify it's deregistering the right
  // registration before mutating.
  const entriesRef = useRef<Map<string, RegistryEntry>>(new Map());
  // Subscriber set for `useSyncExternalStore`. Listeners fire whenever
  // the registry mutates. Identity is preserved across renders.
  const listenersRef = useRef<Set<() => void>>(new Set());
  // Monotonic token counter so each registration gets a unique handle
  // that can be matched on deregister.
  const tokenRef = useRef(0);
  // Cached snapshot of `list()`. Recomputed lazily when the registry
  // mutates (versioned), so `getSnapshot` returns a stable reference
  // when nothing has changed (a `useSyncExternalStore` requirement).
  const versionRef = useRef(0);
  const cacheRef = useRef<{
    version: number;
    value: ReadonlyArray<{ readonly id: string; readonly agent: AbstractAgent }>;
  }>({
    version: -1,
    value: [],
  });

  const notify = useCallback((): void => {
    versionRef.current += 1;
    // Copy to avoid mutation during iteration if a listener triggers a
    // cleanup (which would mutate the listener set).
    for (const listener of Array.from(listenersRef.current)) listener();
  }, []);

  const register = useCallback(
    (id: string, agent: AbstractAgent): RegistrationHandle => {
      // Mirror the action / state registry: warn in dev when a duplicate
      // id replaces an existing registration. Last-wins is intentional
      // (matches React's render-order semantics under remount), but a
      // duplicate is almost always a typo or a missing component cleanup,
      // worth a console line to surface.
      if (entriesRef.current.has(id) && isDev()) {
        console.warn(
          `[agentickit] Duplicate agent id "${id}", the second registration will replace the first.`,
        );
      }
      tokenRef.current += 1;
      const token = tokenRef.current;
      entriesRef.current.set(id, { id, token, agent });
      notify();
      return { token, id };
    },
    [notify],
  );

  const unregister = useCallback(
    (handle: RegistrationHandle): void => {
      const existing = entriesRef.current.get(handle.id);
      // Only remove if the existing entry is the one this handle owns.
      // A later registration under the same id replaces the entry; in
      // that case this handle's cleanup must NOT delete the newer entry.
      if (!existing || existing.token !== handle.token) return;
      entriesRef.current.delete(handle.id);
      notify();
    },
    [notify],
  );

  const subscribe = useCallback((listener: () => void): (() => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getAgent = useCallback(
    (id: string): AbstractAgent | undefined => entriesRef.current.get(id)?.agent,
    [],
  );

  const list = useCallback((): ReadonlyArray<{
    readonly id: string;
    readonly agent: AbstractAgent;
  }> => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.value;
    }
    const value = Array.from(entriesRef.current.values()).map((e) => ({
      id: e.id,
      agent: e.agent,
    }));
    cacheRef.current = { version: versionRef.current, value };
    return value;
  }, []);

  const value = useMemo<PilotAgentRegistryContextValue>(
    () => ({ register, unregister, subscribe, getAgent, list }),
    [register, unregister, subscribe, getAgent, list],
  );

  return (
    <PilotAgentRegistryContext.Provider value={value}>
      {props.children}
    </PilotAgentRegistryContext.Provider>
  );
}
