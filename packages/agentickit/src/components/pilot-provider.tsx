"use client";

import { generateId } from "ai";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
  PilotChatContext,
  PilotRegistryContext,
  type PilotRegistryContextValue,
  type PilotRegistrySnapshot,
} from "../context.js";
import { isDev } from "../env.js";
import { localRuntime } from "../runtime/local-runtime.js";
import type {
  PilotIncomingToolCall,
  PilotRuntime,
  PilotRuntimeConfig,
} from "../runtime/types.js";
import type {
  PilotActionRegistration,
  PilotConfig,
  PilotFormRegistration,
  PilotRenderAndWait,
  PilotStateRegistration,
} from "../types.js";
import {
  PilotConfirmModal,
  type PilotConfirmRender,
  type PilotConfirmRenderArgs,
} from "./pilot-confirm-modal.js";

// `lastAssistantMessageNeedsContinuation` previously lived here; it
// moved to `runtime/local-runtime.ts` next to its caller during Phase
// 3a. Internal callers should import it from the new home.

/** Approval outcome from the themed modal or consumer override. */
type ConfirmOutcome = "approved" | "cancelled";

/**
 * Internal state for the currently-pending confirm dialog. A single slot ,
 * mutating tool calls arrive serialized (the model emits them one by one via
 * `onToolCall`), so we never need to queue more than one card at a time.
 */
interface PendingConfirm {
  name: string;
  description: string;
  input: unknown;
  resolve: (outcome: ConfirmOutcome) => void;
}

/**
 * Internal state for the currently-pending HITL render prop. Like
 * `PendingConfirm`, only one slot is needed because tool calls arrive
 * serialized.
 *
 * `resolve` is a tagged-union callback so `respond` and `cancel` map to the
 * same suspended Promise: both fire `resolve({ kind, ... })` and the awaiting
 * `onToolCall` branch dispatches accordingly.
 */
interface PendingHitl {
  name: string;
  description: string;
  input: unknown;
  render: PilotRenderAndWait;
  resolve: (
    outcome: { kind: "respond"; value: unknown } | { kind: "cancel"; reason: string },
  ) => void;
}

/**
 * Props accepted by `<Pilot>`. All configuration is optional; a bare
 * `<Pilot>apiUrl</Pilot>` will work against the default `/api/pilot` route.
 */
export interface PilotProps extends PilotConfig {
  children: ReactNode;
  /**
   * Render-prop override for the confirm modal shown before every
   * `mutating: true` action. Receives the action metadata plus `approve`
   * and `cancel` callbacks. When omitted, the package's default themed
   * modal is used.
   *
   * Callers must invoke `approve` or `cancel` exactly once per render, the
   * provider's `onToolCall` is suspended on a promise that only settles when
   * one of the two fires. Returning `null` is legal (the modal becomes
   * invisible) but will leave the tool call hanging forever.
   */
  renderConfirm?: PilotConfirmRender;
  /**
   * Override the chat runtime. When omitted, the package's built-in
   * `localRuntime()` is used (the AI SDK 6 `useChat`-driven HTTP/SSE
   * default). Pass a different `PilotRuntime` (for example a future
   * `agUiRuntime({ runtimeUrl, agentId })`) to swap the chat backend
   * without changing any UI components.
   *
   * The runtime instance must be stable across renders. Define it at
   * module scope or memoize via `useMemo` in the consumer; passing a new
   * runtime literal each render would invalidate the chat lifecycle and
   * tear down the message stream on every parent re-render.
   */
  runtime?: PilotRuntime;
}

/**
 * Top-level client-side provider.
 *
 * Responsibilities:
 *   1. Own the **registry** of tools/state/forms via a mutable `Map` in a
 *      ref. A subscription set lets `useSyncExternalStore` consumers re-read
 *      lazily instead of re-rendering on every registration.
 *   2. Drive AI SDK 6's `useChat` with a transport that appends the current
 *      registry as a `body.tools` field on every send, via
 *      `prepareSendMessagesRequest`. The server consumes that list and wires
 *      it into `streamText({ tools })`.
 *   3. Intercept `onToolCall`, if the tool name matches a registered
 *      action, run the handler locally and push the result back to the chat
 *      with `addToolOutput`. After the output lands the SDK resubmits so the
 *      model can continue.
 *   4. Compose per-request body: a live snapshot of registered tools,
 *      state, and (optionally) a client-supplied system prompt via `body`.
 *      The server owns its own system prompt (auto-loaded from `.pilot/`).
 *
 * Strict-mode safety: all registrations are idempotent and clean up in the
 * returned `useEffect` teardown. The registry Map is keyed by a random `id`
 * the provider hands back, so double-invocation yields a replacement rather
 * than a duplicate.
 */
export function Pilot(props: PilotProps): ReactNode {
  // `model` is intentionally undefined by default: when omitted the server
  // handler's own model (or its auto-detection) picks the provider. Pass a
  // string to override per-request from the client.
  const { children, apiUrl, model, renderConfirm } = props;
  // The runtime is the swappable chat-stream layer. When the consumer
  // passes one, it's used as-is and `apiUrl` / `model` are ignored
  // (the consumer's runtime owns its own connection details). When
  // the consumer doesn't pass one, we auto-construct a `localRuntime`
  // with the provider's `apiUrl` / `model` props.
  //
  // Memoized over the relevant inputs so identity is stable across
  // unrelated parent re-renders. With default options, `localRuntime()`
  // returns its module-level singleton; with custom options, this
  // useMemo prevents per-render churn that would re-mount the chat.
  const runtime = useMemo(() => {
    if (props.runtime) return props.runtime;
    return localRuntime({ apiUrl, model });
  }, [props.runtime, apiUrl, model]);

  // ------------------------------------------------------------------
  // Confirm-modal state.
  // ------------------------------------------------------------------
  //
  // A single pending-confirm slot. The `onToolCall` handler below pushes a
  // PendingConfirm here and awaits the resolver; the themed `<PilotConfirmModal>`
  // at the bottom of this component (or the caller's override) invokes
  // `approve` / `cancel` which calls the stored `resolve`. Putting the state
  // on the provider means the modal sits inside the Pilot tree and inherits
  // its theme variables naturally.
  //
  // We track recent approvals keyed by `actionName` so repeated same-action
  // confirms within 5 seconds skip the modal. A micro-UX win that matches
  // Arc/Raycast flows where "yes, yes, yes" is clearly the user's state.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pendingHitl, setPendingHitl] = useState<PendingHitl | null>(null);
  const recentApprovalsRef = useRef<Map<string, number>>(new Map());
  const AUTO_CONFIRM_WINDOW_MS = 5000;

  // ------------------------------------------------------------------
  // Registry, mutable Map + subscription set.
  // ------------------------------------------------------------------

  // A single source of truth that outlives renders; `useRef` guarantees
  // identity so registration/deregistration never fire on a stale closure.
  const actionsRef = useRef<Map<string, PilotActionRegistration>>(new Map());
  const statesRef = useRef<Map<string, PilotStateRegistration>>(new Map());
  const formsRef = useRef<Map<string, PilotFormRegistration>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());
  // Monotonic version bumped on every mutation, enables memoized snapshots.
  const versionRef = useRef(0);
  // Cached snapshot (returned to consumers). Recomputed lazily when the
  // version changes, so `getSnapshot()` can be called repeatedly without
  // allocating on every call (a requirement of `useSyncExternalStore`).
  const snapshotRef = useRef<{ version: number; value: PilotRegistrySnapshot }>({
    version: -1,
    value: { actions: [], states: [], forms: [] },
  });

  const notify = useCallback(() => {
    versionRef.current += 1;
    // Copy to avoid mutation during iteration if a listener deregisters.
    for (const listener of Array.from(listenersRef.current)) listener();
  }, []);

  const registerAction = useCallback(
    <TParams, TResult>(
      registration: Omit<PilotActionRegistration<TParams, TResult>, "id">,
    ): string => {
      const id = generateId();
      const existing = Array.from(actionsRef.current.values()).find(
        (a) => a.name === registration.name,
      );
      if (existing && isDev()) {
        console.warn(
          `[agentickit] Duplicate action name "${registration.name}", the second registration will override the first.`,
        );
      }
      // Erase generics at the storage boundary, the registry stores a
      // `PilotActionRegistration<unknown, unknown>` and each hook's
      // caller-side signature preserves the precise types for the consumer.
      actionsRef.current.set(id, {
        id,
        ...registration,
      } as unknown as PilotActionRegistration);
      notify();
      return id;
    },
    [notify],
  );

  const deregisterAction = useCallback(
    (id: string) => {
      const entry = actionsRef.current.get(id);
      if (!entry) return;
      actionsRef.current.delete(id);
      notify();

      // If this action is currently suspended in a HITL or confirm slot,
      // auto-cancel so the model loop doesn't hang on a tool call whose
      // owning component just unmounted. We match by name (not by id)
      // because re-registration during a name change deliberately destroys
      // the old id, so the slot's name is the only stable identifier.
      // setState callbacks read `current` so we don't capture stale state.
      setPendingHitl((current) => {
        if (current && current.name === entry.name) {
          current.resolve({ kind: "cancel", reason: "Action unmounted." });
          return null;
        }
        return current;
      });
      setPendingConfirm((current) => {
        if (current && current.name === entry.name) {
          current.resolve("cancelled");
          return null;
        }
        return current;
      });
    },
    [notify],
  );

  const registerState = useCallback(
    <T,>(registration: Omit<PilotStateRegistration<T>, "id">): string => {
      const id = generateId();
      const existing = Array.from(statesRef.current.values()).find(
        (s) => s.name === registration.name,
      );
      if (existing && isDev()) {
        console.warn(
          `[agentickit] Duplicate state name "${registration.name}", the second registration will override the first.`,
        );
      }
      statesRef.current.set(id, {
        id,
        ...registration,
      } as unknown as PilotStateRegistration);
      notify();
      return id;
    },
    [notify],
  );

  const deregisterState = useCallback(
    (id: string) => {
      if (statesRef.current.delete(id)) notify();
    },
    [notify],
  );

  const updateStateValue = useCallback(
    <T,>(id: string, nextValue: T) => {
      const existing = statesRef.current.get(id);
      // No-op if the entry was removed between renders (e.g., the component
      // unmounted while a stale effect was still queued).
      if (!existing) return;
      // Cheap identity guard avoids a notify storm when the value reference is
      // already current (common when parent re-renders pass through unchanged).
      if (existing.value === nextValue) return;
      statesRef.current.set(id, {
        ...existing,
        value: nextValue as unknown,
      } as PilotStateRegistration);
      notify();
    },
    [notify],
  );

  const registerForm = useCallback(
    (registration: Omit<PilotFormRegistration, "id">): string => {
      const id = generateId();
      formsRef.current.set(id, { id, ...registration });
      notify();
      return id;
    },
    [notify],
  );

  const deregisterForm = useCallback(
    (id: string) => {
      if (formsRef.current.delete(id)) notify();
    },
    [notify],
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback((): PilotRegistrySnapshot => {
    if (snapshotRef.current.version === versionRef.current) {
      return snapshotRef.current.value;
    }
    const value: PilotRegistrySnapshot = {
      actions: Array.from(actionsRef.current.values()),
      states: Array.from(statesRef.current.values()),
      forms: Array.from(formsRef.current.values()),
    };
    snapshotRef.current = { version: versionRef.current, value };
    return value;
  }, []);

  const registryValue = useMemo<PilotRegistryContextValue>(
    () => ({
      registerAction,
      deregisterAction,
      registerState,
      updateStateValue,
      deregisterState,
      registerForm,
      deregisterForm,
      subscribe,
      getSnapshot,
    }),
    [
      registerAction,
      deregisterAction,
      registerState,
      updateStateValue,
      deregisterState,
      registerForm,
      deregisterForm,
      subscribe,
      getSnapshot,
    ],
  );

  // ------------------------------------------------------------------
  // Tool-call dispatcher. The runtime invokes this whenever the model
  // emits a client-dispatched tool call. We run the confirm gate, the
  // HITL gate, and the handler call here, then settle the result via
  // the runtime-supplied `output` / `outputError` callbacks. The
  // runtime owns how those callbacks reach the wire (LocalRuntime
  // funnels through `chat.addToolOutput`; AgUiRuntime will emit a
  // `TOOL_CALL_RESULT` AG-UI event back upstream).
  // ------------------------------------------------------------------

  const handleToolCall = useCallback(
    async (call: PilotIncomingToolCall): Promise<void> => {
      const snapshot = getSnapshot();
      // Match the last-wins semantics of the registry: when two
      // components register an action with the same name, the most-recent
      // registration is the one the runtime advertised to the model, so
      // it must also be the one we execute. Using `find` (first match)
      // would execute the older handler against the newer handler's
      // schema.
      let action: PilotActionRegistration | undefined;
      for (const candidate of snapshot.actions) {
        if (candidate.name === call.toolName) action = candidate;
      }
      if (!action) {
        call.outputError(`Unknown tool: ${call.toolName}`);
        return;
      }

      // Mutating actions require explicit confirmation. The themed modal at
      // the bottom of this component renders above the page; `handleToolCall`
      // is suspended on the promise until the user clicks Confirm or Cancel
      // (or hits Enter/Escape, or clicks the backdrop). An optional
      // `renderConfirm` prop lets consumers drop in a fully custom modal,
      // the default implementation matches the sidebar's aesthetic.
      //
      // Auto-confirm window: if the user approved the same action within
      // AUTO_CONFIRM_WINDOW_MS, skip the modal. This is the "yes, yes, yes"
      // UX polish for tight multi-step loops (e.g., several submit_detail
      // calls in a row during a form fill). The window is intentionally
      // short, long enough to feel responsive on a tight sequence, short
      // enough that a stale approval doesn't leak into a new context.
      if (action.mutating) {
        const now = Date.now();
        const lastApproval = recentApprovalsRef.current.get(action.name) ?? 0;
        const withinGrace = now - lastApproval <= AUTO_CONFIRM_WINDOW_MS;
        if (!withinGrace) {
          const outcome = await new Promise<ConfirmOutcome>((resolve) => {
            setPendingConfirm({
              name: action.name,
              description: action.description,
              input: call.input,
              resolve,
            });
          });
          if (outcome === "cancelled") {
            // Loop-friendly decline: `ok: false` returned as a normal output,
            // not an error, so the model can react conversationally rather
            // than surfacing a red error banner in the sidebar.
            call.output({ ok: false, reason: "User declined." });
            return;
          }
        }
        recentApprovalsRef.current.set(action.name, Date.now());
      }

      try {
        const parsed = action.parameters.parse(call.input);

        // renderAndWait branch: instead of running `handler`, mount the
        // consumer's render-prop and await `respond` / `cancel`. Layered
        // with `mutating`, the confirm gate above has already cleared.
        if (action.renderAndWait) {
          const render = action.renderAndWait;
          const outcome = await new Promise<
            { kind: "respond"; value: unknown } | { kind: "cancel"; reason: string }
          >((resolve) => {
            setPendingHitl({
              name: action.name,
              description: action.description,
              input: parsed,
              render,
              resolve,
            });
          });
          if (outcome.kind === "cancel") {
            call.output({ ok: false, reason: outcome.reason });
            return;
          }
          call.output(outcome.value);
          return;
        }

        const result = await action.handler(parsed);
        call.output(result);
      } catch (err) {
        call.outputError(err instanceof Error ? err.message : String(err));
      }
    },
    [getSnapshot],
  );

  // Resolve consumer-supplied headers (object or function form). Memoized
  // so the runtime sees a stable reference across renders unless the
  // consumer's prop actually changes.
  const resolveHeaders = useCallback((): Record<string, string> => {
    const raw = props.headers;
    if (!raw) return {};
    return typeof raw === "function" ? raw() : raw;
  }, [props.headers]);

  // The runtime hook is called inside <PilotRuntimeBridge> below, keyed by
  // runtime identity. This is critical: localRuntime and agUiRuntime have
  // different hook signatures (different useState / useRef / useCallback
  // sequences), so calling them from the SAME component instance across
  // renders would violate the Rules of Hooks. By extracting the call into
  // a child component keyed by runtime identity, swapping runtimes triggers
  // a clean unmount + remount of the runtime's hooks, which is what we
  // want anyway: the chat lifecycle (transport, subscriber, message buffer)
  // belongs to the runtime, not to a continuous Pilot render.

  // Stable approve / cancel callbacks bound to the currently pending confirm.
  // Whichever fires first settles the suspended promise inside `onToolCall`
  // and clears the slot so the modal unmounts. We reset to `null` synchronously
  // with the resolve so React unmounts the portal before the next
  // tool-call arrives (which would otherwise get stacked on top).
  const handleApprove = useCallback(() => {
    setPendingConfirm((current) => {
      if (current) current.resolve("approved");
      return null;
    });
  }, []);
  const handleCancel = useCallback(() => {
    setPendingConfirm((current) => {
      if (current) current.resolve("cancelled");
      return null;
    });
  }, []);

  // Render either the custom override (via renderConfirm) or the default
  // themed modal. Both paths share the same approve/cancel callbacks so the
  // provider's resolver logic doesn't care which UI is in play.
  const confirmArgs: PilotConfirmRenderArgs | null = pendingConfirm
    ? {
        name: pendingConfirm.name,
        description: pendingConfirm.description,
        input: pendingConfirm.input,
        approve: handleApprove,
        cancel: handleCancel,
      }
    : null;

  const confirmNode: ReactNode = renderConfirm ? (
    confirmArgs ? (
      renderConfirm(confirmArgs)
    ) : null
  ) : (
    <PilotConfirmModal
      open={Boolean(confirmArgs)}
      name={confirmArgs?.name ?? ""}
      description={confirmArgs?.description ?? ""}
      input={confirmArgs?.input}
      approve={handleApprove}
      cancel={handleCancel}
    />
  );

  // Stable respond / cancel callbacks bound to the currently-pending HITL.
  // Mirror the confirm-modal pattern: whichever fires first settles the
  // suspended promise inside `onToolCall` and clears the slot. We reset
  // synchronously so the next tool call (which may arrive immediately after
  // resubmit) lands in a clean slot rather than stacking on a stale render.
  const handleHitlRespond = useCallback((value: unknown) => {
    setPendingHitl((current) => {
      if (current) current.resolve({ kind: "respond", value });
      return null;
    });
  }, []);
  const handleHitlCancel = useCallback((reason?: string) => {
    setPendingHitl((current) => {
      if (current)
        current.resolve({
          kind: "cancel",
          reason: reason ?? "User cancelled.",
        });
      return null;
    });
  }, []);

  // The HITL render prop runs on every provider re-render while pendingHitl
  // is set. The consumer's UI (a date picker, an inline form, a portal,
  // anything) owns its own rendering details. We only supply `input`,
  // `respond`, and `cancel`.
  const hitlNode: ReactNode = pendingHitl
    ? pendingHitl.render({
        input: pendingHitl.input,
        respond: handleHitlRespond,
        cancel: handleHitlCancel,
      })
    : null;

  return (
    <PilotRegistryContext.Provider value={registryValue}>
      <PilotRuntimeBridge
        key={getRuntimeKey(runtime)}
        runtime={runtime}
        config={{
          headers: resolveHeaders,
          getSnapshot,
          onToolCall: handleToolCall,
        }}
      >
        {children}
        {confirmNode}
        {hitlNode}
      </PilotRuntimeBridge>
    </PilotRegistryContext.Provider>
  );
}

/**
 * Stable, identity-based key for `<PilotRuntimeBridge>`. We can't use the
 * runtime object as a React key (must be string/number), so we assign each
 * distinct runtime an auto-incrementing id once and remember it in a
 * `WeakMap` keyed by runtime identity. Two consecutive renders with the
 * same runtime get the same key (no remount); a runtime swap produces a
 * different key (forces remount, which is exactly the point).
 */
let runtimeIdCounter = 0;
const runtimeIds = new WeakMap<PilotRuntime, string>();
function getRuntimeKey(runtime: PilotRuntime): string {
  let id = runtimeIds.get(runtime);
  if (!id) {
    runtimeIdCounter += 1;
    id = `r${runtimeIdCounter}`;
    runtimeIds.set(runtime, id);
  }
  return id;
}

/**
 * Bridge that calls `runtime.useRuntime(config)` and provides the resulting
 * `PilotChatContextValue` to descendants. Must be a child component (rather
 * than an inline call inside <Pilot>) so the parent can key it by runtime
 * identity and React unmounts the old runtime cleanly when the prop swaps.
 *
 * Without this indirection, swapping `runtime={localRuntime()}` for
 * `runtime={agUiRuntime({ agent })}` mid-mount would call two different
 * hook sequences from the same component instance and React would throw
 * "change in the order of Hooks called by Pilot."
 */
function PilotRuntimeBridge(props: {
  runtime: PilotRuntime;
  config: PilotRuntimeConfig;
  children: ReactNode;
}): ReactNode {
  const chatValue = props.runtime.useRuntime(props.config);
  return (
    <PilotChatContext.Provider value={chatValue}>
      {props.children}
    </PilotChatContext.Provider>
  );
}

// The transport-shape helpers (`buildToolsPayload`, `buildStateContext`)
// and the `lastAssistantMessageNeedsContinuation` resubmission predicate
// now live in `runtime/local-runtime.ts` next to the `useChat` invocation
// they wire up. The export above re-routes existing imports to the new
// home so consumers and tests don't notice the move.
