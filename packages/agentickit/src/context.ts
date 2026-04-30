/**
 * Shared React contexts that connect the <Pilot> provider to the hooks.
 *
 * Two contexts are intentionally split:
 *
 *   1. `PilotRegistryContext` — mutation surface for hooks that register
 *      actions / state / forms. Consumed by `usePilotAction`, `usePilotState`,
 *      `usePilotForm`. The registry itself is a mutable `Map` living in a
 *      `useRef`; the context only exposes stable registration functions plus
 *      a `subscribe` / `getSnapshot` pair so other code can listen for
 *      changes without causing re-renders on every keystroke.
 *
 *   2. `PilotChatContext` — read/write chat state (messages, status, helpers)
 *      that `<PilotSidebar>` or any custom UI consumes. Split from the
 *      registry so UI components don't re-render when tools register.
 *
 * Both contexts default to `null` and consumers must treat that case
 * gracefully — either throw a clear dev error (hooks that must live under
 * `<Pilot>`) or no-op (optional integrations).
 */

import type { AbstractAgent } from "@ag-ui/client";
import { createContext } from "react";
import type {
  PilotActionRegistration,
  PilotFormRegistration,
  PilotStateRegistration,
} from "./types.js";

/**
 * Tool registry exposed to hooks. Functions are stable (identity preserved
 * across renders by the provider) so they can be used as `useEffect`
 * dependencies without churn.
 *
 * `registerAction` and `registerState` are generic so callers keep full
 * type inference on the handler's parameters and the state's value — the
 * registry erases the parameter type to `unknown` internally (the AI SDK
 * deals in JSON) but hooks downstream preserve it for the consumer.
 */
export interface PilotRegistryContextValue {
  /** Register (or replace) an action. Returns an `id` used by `deregisterAction`. */
  registerAction: <TParams, TResult>(
    registration: Omit<PilotActionRegistration<TParams, TResult>, "id">,
  ) => string;
  deregisterAction: (id: string) => void;

  /** Register (or update) a readable state entry. Returns an `id`. */
  registerState: <T>(registration: Omit<PilotStateRegistration<T>, "id">) => string;
  /**
   * Update the live `value` of an already-registered state entry without
   * churning its id. Called by `usePilotState` on every render so the model
   * always sees the latest snapshot without forcing a deregister/register
   * cycle on every keystroke.
   */
  updateStateValue: <T>(id: string, nextValue: T) => void;
  deregisterState: (id: string) => void;

  /** Register a form integration (three tools: set_field / submit / reset). */
  registerForm: (registration: Omit<PilotFormRegistration, "id">) => string;
  deregisterForm: (id: string) => void;

  /** useSyncExternalStore-compatible subscribe. Fires when the registry mutates. */
  subscribe: (listener: () => void) => () => void;

  /** Snapshot of the current registry. Immutable to consumers. */
  getSnapshot: () => PilotRegistrySnapshot;
}

/**
 * A read-only snapshot of everything currently registered. Returned by
 * `getSnapshot`. The provider uses this at `sendMessage` time to build the
 * tool list that ships to the server.
 */
export interface PilotRegistrySnapshot {
  actions: ReadonlyArray<PilotActionRegistration>;
  states: ReadonlyArray<PilotStateRegistration>;
  forms: ReadonlyArray<PilotFormRegistration>;
}

/**
 * Chat runtime state surfaced by the provider. Thin typed alias over the
 * `@ai-sdk/react` `useChat` return — consumers are insulated from that
 * import path so the package can evolve independently.
 */
export interface PilotChatContextValue {
  /** All messages in the conversation, in UI form. */
  messages: ReadonlyArray<unknown>;
  /** `"submitted" | "streaming" | "ready" | "error"` from the AI SDK. */
  status: "submitted" | "streaming" | "ready" | "error";
  /** Error from the most recent request, if any. */
  error: Error | undefined;
  /** True while the chat is awaiting or receiving a response. */
  isLoading: boolean;
  /** Send a new user message. Text-only convenience wrapper. */
  sendMessage: (text: string) => Promise<void>;
  /** Abort the current request. */
  stop: () => Promise<void>;
}

export const PilotRegistryContext = createContext<PilotRegistryContextValue | null>(null);
PilotRegistryContext.displayName = "PilotRegistryContext";

export const PilotChatContext = createContext<PilotChatContextValue | null>(null);
PilotChatContext.displayName = "PilotChatContext";

/**
 * Multi-agent registry surface (Phase 7). The provider owns a
 * `Map<agentId, AbstractAgent>` and exposes register / unregister methods
 * plus a `useSyncExternalStore`-compatible subscribe / getSnapshot pair.
 *
 * Why a separate context (not the existing `PilotRegistryContext`):
 *
 *   - `PilotRegistryContext` owns actions / state / forms (per-Pilot-tree
 *     concepts that namespace by `<Pilot>`). The agent registry is at a
 *     LARGER scope: typically a single root provider holds every agent
 *     the app might mount, and individual `<Pilot>` trees consume from
 *     it. Mixing them would force every Pilot to re-publish the agent
 *     map.
 *   - The registry can be mounted ABOVE one or more Pilots, so multiple
 *     surfaces (sidebar + popup + inline) can each look up the same
 *     agent by id without duplicating construction.
 *   - Default `null` means "no agent registry mounted"; consumer hooks
 *     return `undefined` / empty list gracefully so an app without
 *     multi-agent support never crashes.
 */
export interface PilotAgentRegistryContextValue {
  /**
   * Register an agent under `id`. Last-wins on duplicate id (matches the
   * action registry's last-wins semantics so component remounts under
   * `id` replace cleanly). Returns the registration's internal handle so
   * `unregister` can target the exact registration even when the same
   * `id` has been replaced.
   */
  register: (id: string, agent: AbstractAgent) => RegistrationHandle;
  /** Remove a specific registration by handle. No-op if already removed. */
  unregister: (handle: RegistrationHandle) => void;
  /**
   * `useSyncExternalStore`-compatible subscribe. Fires whenever the
   * registry mutates (register / unregister / replace).
   */
  subscribe: (listener: () => void) => () => void;
  /**
   * Read the agent registered under `id`, or `undefined` if none. The
   * agent reference under a given `id` is stable until a new
   * registration replaces it (or the id is unregistered); each call to
   * `getAgent` performs a fresh lookup.
   */
  getAgent: (id: string) => AbstractAgent | undefined;
  /**
   * Snapshot of every registered agent in registration order. The
   * returned array reference changes on every mutation, so consumers can
   * memoize on it for `useSyncExternalStore` correctness.
   */
  list: () => ReadonlyArray<{ readonly id: string; readonly agent: AbstractAgent }>;
}

/**
 * Handle returned by `register`. Opaque to consumers; the registry uses
 * it internally to identify a specific registration when deregistering,
 * so a stale `useEffect` cleanup from a remounted hook can't accidentally
 * deregister a fresh agent that was registered under the same `id` after
 * the prior one unmounted.
 */
export interface RegistrationHandle {
  /** Internal monotonic id, opaque to consumers. */
  readonly token: number;
  /** The registry id this handle was created for. */
  readonly id: string;
}

export const PilotAgentRegistryContext =
  createContext<PilotAgentRegistryContextValue | null>(null);
PilotAgentRegistryContext.displayName = "PilotAgentRegistryContext";
