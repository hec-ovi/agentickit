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
