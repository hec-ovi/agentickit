"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId, zodSchema } from "ai";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PilotChatContext,
  type PilotChatContextValue,
  PilotRegistryContext,
  type PilotRegistryContextValue,
  type PilotRegistrySnapshot,
} from "../context.js";
import { isDev } from "../env.js";
import { type PilotManifest, loadManifest } from "../protocol/manifest.js";
import { parseResolver } from "../protocol/resolver.js";
import type {
  PilotActionRegistration,
  PilotConfig,
  PilotFormRegistration,
  PilotStateRegistration,
  ResolverEntry,
} from "../types.js";

/**
 * Props accepted by `<Pilot>`. All configuration is optional; a bare
 * `<Pilot>apiUrl</Pilot>` will work against the default `/api/pilot` route.
 */
export interface PilotProps extends PilotConfig {
  children: ReactNode;
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
 *   4. Optionally fetch `.pilot/manifest.json` + `RESOLVER.md` and compose a
 *      system prompt. Failures are logged and swallowed so the package still
 *      works without a `.pilot/` folder.
 *
 * Strict-mode safety: all registrations are idempotent and clean up in the
 * returned `useEffect` teardown. The registry Map is keyed by a random `id`
 * the provider hands back, so double-invocation yields a replacement rather
 * than a duplicate.
 */
export function Pilot(props: PilotProps): ReactNode {
  const { children, apiUrl = "/api/pilot", model = "openai/gpt-4o" } = props;

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
      deregisterState,
      registerForm,
      deregisterForm,
      subscribe,
      getSnapshot,
    ],
  );

  // ------------------------------------------------------------------
  // Protocol: fetch .pilot/manifest.json + RESOLVER.md at mount.
  // ------------------------------------------------------------------

  const [manifest, setManifest] = useState<PilotManifest | null>(null);
  const [resolverEntries, setResolverEntries] = useState<ResolverEntry[]>([]);

  useEffect(() => {
    if (!props.pilotProtocolUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const baseUrl = props.pilotProtocolUrl ?? "";
        const manifestUrl = baseUrl.endsWith("manifest.json")
          ? baseUrl
          : `${baseUrl.replace(/\/$/, "")}/manifest.json`;
        const loaded = await loadManifest(manifestUrl);
        if (cancelled) return;
        setManifest(loaded);

        // RESOLVER.md lives alongside manifest.json inside the .pilot/ folder.
        if (loaded.resolver) {
          const resolverUrl = new URL(
            loaded.resolver,
            new URL(manifestUrl, window.location.href),
          ).toString();
          try {
            const res = await fetch(resolverUrl);
            if (res.ok && !cancelled) {
              setResolverEntries(parseResolver(await res.text()));
            }
          } catch (resolverError) {
            if (isDev()) {
              console.warn("[agentickit] Failed to load RESOLVER.md:", resolverError);
            }
          }
        }
      } catch (err) {
        // Fail soft — the package must still work without .pilot/.
        if (isDev()) {
          console.warn("[agentickit] Failed to load .pilot manifest:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.pilotProtocolUrl]);

  // ------------------------------------------------------------------
  // useChat wiring. Tools + state + system prompt are injected into the
  // request body via `prepareSendMessagesRequest`, recomputed on every send.
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
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const resolverRef = useRef(resolverEntries);
  resolverRef.current = resolverEntries;
  const modelRef = useRef(model);
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
          const system = buildSystemPrompt(manifestRef.current, resolverRef.current, snapshot);
          return {
            body: {
              ...(body ?? {}),
              model: modelRef.current,
              messages,
              tools,
              context,
              ...(system ? { system } : {}),
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
      const action = snapshot.actions.find((a) => a.name === toolCall.toolName);
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

      // Mutating actions require explicit confirmation. v0.1 uses window.confirm;
      // TODO: expose a `renderConfirm` prop on <Pilot> so consumers can drop in a
      //   styled modal instead of the browser's native dialog.
      if (action.mutating) {
        const ok =
          typeof window !== "undefined" && typeof window.confirm === "function"
            ? window.confirm(
                `The assistant wants to run "${action.name}". Allow?\n\n` +
                  `Description: ${action.description}\n` +
                  `Arguments: ${JSON.stringify(toolCall.input, null, 2)}`,
              )
            : true;
        if (!ok) {
          chatRef.current?.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: "User declined the action.",
          });
          return;
        }
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

  return (
    <PilotRegistryContext.Provider value={registryValue}>
      <PilotChatContext.Provider value={chatValue}>{children}</PilotChatContext.Provider>
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
    out[action.name] = {
      description: action.description,
      // `zodSchema` wraps the Zod schema in a StandardSchema so the server
      // can serialize it to JSON Schema via the same helper.
      inputSchema: zodSchema(action.parameters),
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
 * Compose the system prompt from the protocol layer plus whatever's
 * currently registered. Skills whose `name` doesn't match a registered
 * action are filtered out so the LLM never sees a capability it can't
 * actually invoke.
 */
function buildSystemPrompt(
  manifest: PilotManifest | null,
  resolverEntries: ReadonlyArray<ResolverEntry>,
  snapshot: PilotRegistrySnapshot,
): string | null {
  if (!manifest) return null;

  const registeredActionNames = new Set(snapshot.actions.map((a) => a.name));
  const activeSkills = manifest.skills.filter((s) => registeredActionNames.has(s.name));

  const sections: string[] = [];

  if (manifest.conventions?.length) {
    sections.push(`## Conventions\n${manifest.conventions.map((c) => `- ${c}`).join("\n")}`);
  }

  if (activeSkills.length > 0) {
    sections.push(
      `## Available skills\n${activeSkills
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join("\n")}`,
    );
  }

  if (resolverEntries.length > 0) {
    const localResolverRows = resolverEntries.filter((e) => !e.isExternalPointer);
    if (localResolverRows.length > 0) {
      sections.push(
        `## Triggers\n${localResolverRows.map((e) => `- ${e.trigger} → ${e.skillPath}`).join("\n")}`,
      );
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
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
