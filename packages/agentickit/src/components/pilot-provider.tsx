"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId, zodSchema } from "ai";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
  PilotChatContext,
  type PilotChatContextValue,
  PilotRegistryContext,
  type PilotRegistryContextValue,
  type PilotRegistrySnapshot,
} from "../context.js";
import { isDev } from "../env.js";
import type {
  PilotActionRegistration,
  PilotConfig,
  PilotFormRegistration,
  PilotStateRegistration,
} from "../types.js";
import {
  PilotConfirmModal,
  type PilotConfirmRender,
  type PilotConfirmRenderArgs,
} from "./pilot-confirm-modal.js";

/** Approval outcome from the themed modal or consumer override. */
type ConfirmOutcome = "approved" | "cancelled";

/**
 * Internal state for the currently-pending confirm dialog. A single slot —
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
   * Callers must invoke `approve` or `cancel` exactly once per render — the
   * provider's `onToolCall` is suspended on a promise that only settles when
   * one of the two fires. Returning `null` is legal (the modal becomes
   * invisible) but will leave the tool call hanging forever.
   */
  renderConfirm?: PilotConfirmRender;
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
 *   3. Intercept `onToolCall` — if the tool name matches a registered
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
  const { children, apiUrl = "/api/pilot", model, renderConfirm } = props;

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
  const recentApprovalsRef = useRef<Map<string, number>>(new Map());
  const AUTO_CONFIRM_WINDOW_MS = 5000;

  // ------------------------------------------------------------------
  // Registry — mutable Map + subscription set.
  // ------------------------------------------------------------------

  // A single source of truth that outlives renders; `useRef` guarantees
  // identity so registration/deregistration never fire on a stale closure.
  const actionsRef = useRef<Map<string, PilotActionRegistration>>(new Map());
  const statesRef = useRef<Map<string, PilotStateRegistration>>(new Map());
  const formsRef = useRef<Map<string, PilotFormRegistration>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());
  // Monotonic version bumped on every mutation — enables memoized snapshots.
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
          `[agentickit] Duplicate action name "${registration.name}" — the second registration will override the first.`,
        );
      }
      // Erase generics at the storage boundary — the registry stores a
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
      if (actionsRef.current.delete(id)) notify();
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
          `[agentickit] Duplicate state name "${registration.name}" — the second registration will override the first.`,
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
  // useChat wiring. Tools + state are injected into the request body via
  // `prepareSendMessagesRequest`, recomputed on every send. The server
  // owns the system prompt (auto-loaded from `.pilot/` at handler startup).
  // ------------------------------------------------------------------

  // Snapshot that's always current — avoids closure staleness in the
  // callbacks passed to useChat (which are captured once by the SDK).
  const liveSnapshotRef = useRef(getSnapshot);
  liveSnapshotRef.current = getSnapshot;

  // Stable headers resolver — accepts static or function-valued headers.
  const resolveHeaders = useCallback((): Record<string, string> => {
    const raw = props.headers;
    if (!raw) return {};
    return typeof raw === "function" ? raw() : raw;
  }, [props.headers]);

  // Stable refs so the transport closure (captured once) can see live values
  // without us recreating the transport on every render.
  const modelRef = useRef<string | undefined>(model);
  modelRef.current = model;
  const resolveHeadersRef = useRef(resolveHeaders);
  resolveHeadersRef.current = resolveHeaders;

  // Transport is built exactly once per mount. `apiUrl` is captured on first
  // render; changing it post-mount is not supported (AI SDK limitation, not ours).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        headers: () => resolveHeadersRef.current(),
        // Every send recomputes the tool list + state snapshot so the server
        // sees exactly what's registered right now.
        prepareSendMessagesRequest: ({ messages, body }) => {
          const snapshot = liveSnapshotRef.current();
          const tools = buildToolsPayload(snapshot);
          const context = buildStateContext(snapshot);
          return {
            body: {
              ...(body ?? {}),
              // Only forward `model` when the consumer supplied one. Omitting
              // it lets the server handler's own (possibly auto-detected)
              // default take effect.
              ...(modelRef.current ? { model: modelRef.current } : {}),
              messages,
              tools,
              context,
            },
          };
        },
      }),
    // We intentionally capture `apiUrl` on first mount only; changing it at
    // runtime would orphan the existing stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl],
  );

  const chat = useChat({
    id: "agentickit-default",
    transport,

    // When the model emits a tool call, look up the registered handler and
    // execute it in the browser. The result is pushed with `addToolOutput`,
    // which — combined with `sendAutomaticallyWhen` below — triggers the
    // SDK to resubmit so the model can observe the tool result.
    onToolCall: async ({ toolCall }) => {
      const snapshot = liveSnapshotRef.current();
      // Match the last-wins semantics of `buildToolsPayload`: when two
      // components register an action with the same name, the most-recent
      // registration is the one the model's tool list advertised, so it must
      // also be the one we execute. Using `find` (first match) would execute
      // the older handler — potentially against the newer handler's schema.
      let action: PilotActionRegistration | undefined;
      for (const candidate of snapshot.actions) {
        if (candidate.name === toolCall.toolName) action = candidate;
      }
      if (!action) {
        // Unknown tool. Report an error result so the loop doesn't stall.
        chatRef.current?.addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: `Unknown tool: ${toolCall.toolName}`,
        });
        return;
      }

      // Mutating actions require explicit confirmation. The themed modal at
      // the bottom of this component renders above the page; `onToolCall` is
      // suspended on the promise until the user clicks Confirm or Cancel
      // (or hits Enter/Escape, or clicks the backdrop). An optional
      // `renderConfirm` prop lets consumers drop in a fully custom modal —
      // the default implementation matches the sidebar's aesthetic.
      //
      // Auto-confirm window: if the user approved the same action within
      // AUTO_CONFIRM_WINDOW_MS, skip the modal. This is the "yes, yes, yes"
      // UX polish for tight multi-step loops (e.g., several submit_detail
      // calls in a row during a form fill). The window is intentionally
      // short — long enough to feel responsive on a tight sequence, short
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
              input: toolCall.input,
              resolve,
            });
          });
          if (outcome === "cancelled") {
            // Loop-friendly decline: `ok: false` returned as a normal output,
            // not an error, so the model can react conversationally rather
            // than surfacing a red error banner in the sidebar.
            chatRef.current?.addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: { ok: false, reason: "User declined." } as never,
            });
            return;
          }
        }
        recentApprovalsRef.current.set(action.name, Date.now());
      }

      try {
        const parsed = action.parameters.parse(toolCall.input);
        const result = await action.handler(parsed);
        chatRef.current?.addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result as never,
        });
      } catch (err) {
        chatRef.current?.addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : String(err),
        });
      }
    },

    // Resubmit after every tool result so the model keeps going.
    sendAutomaticallyWhen: ({ messages }) => lastAssistantMessageNeedsContinuation(messages),
  });

  // Stable ref to the chat helpers so onToolCall (captured once) can reach
  // the latest `addToolOutput` without re-registering the handler.
  const chatRef = useRef<typeof chat | null>(null);
  chatRef.current = chat;

  // ------------------------------------------------------------------
  // PilotChatContext — slim, UI-friendly shape.
  // ------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      await chat.sendMessage({ text });
    },
    [chat],
  );

  const chatValue = useMemo<PilotChatContextValue>(
    () => ({
      messages: chat.messages,
      status: chat.status,
      error: chat.error,
      isLoading: chat.status === "submitted" || chat.status === "streaming",
      sendMessage,
      stop: chat.stop,
    }),
    [chat.messages, chat.status, chat.error, sendMessage, chat.stop],
  );

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

  return (
    <PilotRegistryContext.Provider value={registryValue}>
      <PilotChatContext.Provider value={chatValue}>
        {children}
        {confirmNode}
      </PilotChatContext.Provider>
    </PilotRegistryContext.Provider>
  );
}

// ----------------------------------------------------------------------
// Helpers — pure functions that turn the registry into tool JSON.
// ----------------------------------------------------------------------

/**
 * Opaque shape of an outgoing tool definition. We keep this loose on
 * purpose; the server's `streamText` call reconstitutes proper `Tool`
 * objects from `{ description, inputSchema }` entries.
 */
interface OutgoingToolSpec {
  description: string;
  inputSchema: unknown;
  mutating?: boolean;
}

/**
 * Compile every registered action + form + state-update tool into the
 * payload shape the server handler expects.
 */
function buildToolsPayload(snapshot: PilotRegistrySnapshot): Record<string, OutgoingToolSpec> {
  const out: Record<string, OutgoingToolSpec> = {};

  for (const action of snapshot.actions) {
    // We extract the JSON Schema directly rather than shipping the full
    // `zodSchema()` wrapper: the wrapper carries methods (`.validate`)
    // that don't survive JSON serialization, so the server would receive
    // a stripped object and fail with "schema is not a function" when the
    // AI SDK tries to invoke them. Plain JSON Schema round-trips cleanly
    // and is what `dynamicTool({ inputSchema })` actually wants.
    out[action.name] = {
      description: action.description,
      inputSchema: zodSchema(action.parameters).jsonSchema,
      ...(action.mutating ? { mutating: true } : {}),
    };
  }

  return out;
}

/**
 * Serialize registered state into a plain object the server prepends to the
 * system prompt. Values are JSON-stringified so the LLM can read the
 * current UI state verbatim.
 */
function buildStateContext(snapshot: PilotRegistrySnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const state of snapshot.states) {
    out[state.name] = {
      description: state.description,
      value: state.value,
    };
  }
  return out;
}

/**
 * True when the most recent assistant message contains a tool call whose
 * output has just been added. The AI SDK calls this after every mutation so
 * it can decide whether to spin the loop again.
 *
 * We hand this to `sendAutomaticallyWhen` rather than rely on the SDK's
 * built-in `lastAssistantMessageIsCompleteWithToolCalls` because that
 * helper assumes a specific provider-execution pattern; our client-side
 * handlers need the simpler "any tool just produced output" check.
 */
function lastAssistantMessageNeedsContinuation(messages: ReadonlyArray<unknown>): boolean {
  const last = messages[messages.length - 1] as
    | { role?: string; parts?: Array<{ type?: string; state?: string }> }
    | undefined;
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) return false;
  // Any tool part in an `output-available` or `output-error` state means the
  // loop should resubmit so the model observes the result.
  return last.parts.some(
    (p) =>
      typeof p.type === "string" &&
      (p.type.startsWith("tool-") || p.type === "dynamic-tool") &&
      (p.state === "output-available" || p.state === "output-error"),
  );
}
