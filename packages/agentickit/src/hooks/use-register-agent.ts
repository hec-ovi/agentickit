"use client";

/**
 * `useRegisterAgent(id, factory)`, the consumer-facing primitive for
 * publishing an `AbstractAgent` into the multi-agent registry under a
 * stable `id`.
 *
 * Lifecycle:
 *
 *   1. On mount, `factory` is called once via `useState`'s lazy
 *      initializer. The returned agent is held in component state so the
 *      same instance survives re-renders without being constructable
 *      twice.
 *   2. The agent is registered via `PilotAgentRegistryContext.register`,
 *      which returns a `RegistrationHandle`. The handle is what cleanup
 *      hands back so a stale unmount only deregisters the exact
 *      registration this hook owns (not a later one that replaced it
 *      under the same id).
 *   3. On unmount, the cleanup calls `unregister(handle)`. We do NOT
 *      call `agent.abortRun()` here. Aborting a run is a runtime-layer
 *      concern (the runtime owns the in-flight stream and already
 *      handles abort via its `stop` callback). If multiple
 *      `useRegisterAgent` calls share the same agent reference under
 *      different ids, an unmount-time abort on one would tear down a
 *      run the other registration's runtime is mid-stream on; the
 *      registry can't tell, so it stays out of the way.
 *
 * Strict-mode safety: in dev StrictMode, React mounts -> runs effects ->
 * runs cleanups -> remounts -> runs effects again. Without the handle
 * token, the second mount would deregister the first mount's registration
 * AND register itself, leaving the registry in the right state by luck.
 * With the handle, the cleanup explicitly targets its own registration,
 * so the sequence is unambiguous.
 *
 * Last-wins on duplicate id: if two `useRegisterAgent` calls publish under
 * the same `id` simultaneously, the most recent registration wins. The
 * provider logs a dev-mode `console.warn` on the duplicate to match the
 * action / state / form registries' diagnostic behavior; the losing
 * registration's cleanup is a no-op (its handle's token won't match the
 * current entry).
 *
 * Stable id contract: changing `id` mid-lifetime is supported (the effect
 * deps include `id`, so we deregister-old and register-new), but the
 * factory will not be called again, so the same agent will move under a
 * new id. If you need a different agent, remount the hook via parent
 * `key` so the factory runs against fresh state.
 *
 * Returns the registered agent so the caller can pass it directly to
 * `agUiRuntime({ agent })`, hooks like `usePilotAgentState(agent)`, etc.
 * The returned reference is stable across renders for the lifetime of
 * the hook.
 */

import { useContext, useEffect, useState } from "react";
import type { AbstractAgent } from "@ag-ui/client";
import { PilotAgentRegistryContext } from "../context.js";

export function useRegisterAgent(
  id: string,
  factory: () => AbstractAgent,
): AbstractAgent {
  const registry = useContext(PilotAgentRegistryContext);

  // Construct the agent exactly once per component-instance lifetime via
  // `useState`'s lazy initializer. Equivalent to a `useRef(null) + if
  // null` lazy init but cleaner: state is locked, can never be reset
  // accidentally by a future maintainer, and the typecheck doesn't need
  // a `null` discriminator.
  const [agent] = useState<AbstractAgent>(factory);

  useEffect(() => {
    if (!registry) {
      // No provider mounted. The hook is still safe to call; we just
      // can't publish anywhere. The agent reference is still returned
      // so consumers can use it directly without the registry.
      return;
    }
    const handle = registry.register(id, agent);
    return () => {
      registry.unregister(handle);
    };
    // We DELIBERATELY exclude `agent` from deps. The agent is constructed
    // once via the lazy `useState` initializer and never changes for the
    // lifetime of the hook. Adding `agent` here would tempt a future
    // maintainer to allow mid-lifetime swaps which would conflict with
    // the "factory is called once" contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, id]);

  return agent;
}
