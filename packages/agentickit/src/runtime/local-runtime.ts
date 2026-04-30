"use client";

/**
 * Default agentickit runtime: drives `useChat` from `@ai-sdk/react` against
 * an HTTP route that streams AI SDK 6 UIMessage frames.
 *
 * Behavioral parity: this file lifts the chat lifecycle out of `<Pilot>`
 * verbatim. Phase 3a's success criterion is that no test changes its
 * assertions; the seam between runtime and provider is purely structural.
 *
 * What lives here:
 *   - `DefaultChatTransport` configuration with `prepareSendMessagesRequest`.
 *   - `useChat` invocation and its three callback wires (`onToolCall`,
 *     `sendAutomaticallyWhen`, transport).
 *   - The runtime-shape adapter that translates AI SDK 6's tool-call
 *     payload into `PilotIncomingToolCall` so the provider's dispatcher
 *     stays SDK-agnostic.
 *
 * What does NOT live here (intentional):
 *   - The action / state / form registry.
 *   - Confirm-modal and HITL UI state and rendering.
 *   - The Zod parse, confirm gate, handler call, HITL render-prop dispatch.
 *
 * Those all sit in the provider because they're React state and rendering,
 * not protocol-shaped logic. A future `agUiRuntime` will reuse the same
 * provider unchanged; only this file will have an AG-UI-shaped sibling.
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, zodSchema } from "ai";
import { useCallback, useMemo, useRef } from "react";
import type { PilotChatContextValue, PilotRegistrySnapshot } from "../context.js";
import type { PilotRuntime, PilotRuntimeConfig } from "./types.js";

/**
 * Construction-time options for {@link localRuntime}. These are the
 * connection-shaped fields the local (AI-SDK-6 over HTTP) backend needs.
 * The provider's per-render config carries the protocol-agnostic seam
 * (`headers`, `getSnapshot`, `onToolCall`); URL and model id live here.
 */
export interface LocalRuntimeOptions {
  /** API route the runtime POSTs to. Defaults to `"/api/pilot"`. */
  apiUrl?: string;
  /**
   * Default model id forwarded with each request, in AI SDK 6 format
   * (e.g. `"openai/gpt-4o"`). When omitted, the server handler's own
   * default (or its env-var auto-detection) takes effect.
   */
  model?: string;
}

const DEFAULT_API_URL = "/api/pilot";

/**
 * Opaque shape of an outgoing tool definition. The server's `streamText`
 * call reconstitutes proper `Tool` objects from `{ description, inputSchema }`
 * entries. `mutating` is a runtime-only flag; the model never sees it.
 */
interface OutgoingToolSpec {
  description: string;
  inputSchema: unknown;
  mutating?: boolean;
}

/**
 * Compile every registered action into the body shape the server handler
 * expects. We extract the JSON Schema directly rather than shipping the
 * full `zodSchema()` wrapper: the wrapper carries methods (`.validate`)
 * that don't survive JSON serialization, so the server would receive a
 * stripped object and fail with "schema is not a function". Plain JSON
 * Schema round-trips cleanly and is what `dynamicTool({ inputSchema })`
 * actually wants.
 */
function buildToolsPayload(snapshot: PilotRegistrySnapshot): Record<string, OutgoingToolSpec> {
  const out: Record<string, OutgoingToolSpec> = {};
  for (const action of snapshot.actions) {
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
 * system prompt. Values are JSON-stringified by the server; the LLM reads
 * the current UI state verbatim alongside the system prompt.
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
 * True when the most recent assistant message contains a tool result the
 * model has not yet observed. Walks parts from the tail and stops at the
 * first text or reasoning part, the model's text reply, even when followed
 * by completed tool parts in the message buffer, signals the loop is done.
 *
 * A naive "any part is a completed tool output" check causes an infinite
 * loop: once the model answers with text, completed tool parts are still
 * in the message, so the naive check keeps firing resubmissions that each
 * produce the same text, forever. The integration suite has a dedicated
 * 3-tools-then-text scenario that fails the moment this regresses.
 */
export function lastAssistantMessageNeedsContinuation(
  messages: ReadonlyArray<unknown>,
): boolean {
  const last = messages[messages.length - 1] as
    | { role?: string; parts?: Array<{ type?: string; state?: string }> }
    | undefined;
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) return false;
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    if (!part || typeof part.type !== "string") continue;
    const type = part.type;
    // `step-start` is a structural marker between model steps, not content
    // the model has "emitted" in the answer sense, skip and keep walking.
    if (type === "step-start") continue;
    if (type === "text" || type === "reasoning") return false;
    if (
      (type.startsWith("tool-") || type === "dynamic-tool") &&
      (part.state === "output-available" || part.state === "output-error")
    ) {
      return true;
    }
    // Unknown / in-progress part. Don't force a resubmit; the SDK still
    // owns the normal streaming lifecycle.
    return false;
  }
  return false;
}

/**
 * The actual hook implementation. Capture-by-ref for every config field
 * the `useChat` callbacks read so the provider can pass fresh closures
 * without churning the chat lifecycle.
 *
 * `apiUrl` and `model` come from the runtime's construction-time options
 * (closed over by the wrapper in `makeLocalRuntime`); only the protocol-
 * agnostic seam (`headers`, `getSnapshot`, `onToolCall`) flows through
 * the per-render config.
 */
function useLocalRuntimeImpl(
  apiUrl: string,
  model: string | undefined,
  config: PilotRuntimeConfig,
): PilotChatContextValue {
  // Refs hold the latest config so the transport's `prepareSendMessagesRequest`
  // and the `onToolCall` closure can read live values without us re-creating
  // the transport / re-arming the hook on every render.
  const liveSnapshotRef = useRef(config.getSnapshot);
  liveSnapshotRef.current = config.getSnapshot;
  const headersRef = useRef(config.headers);
  headersRef.current = config.headers;
  const onToolCallRef = useRef(config.onToolCall);
  onToolCallRef.current = config.onToolCall;
  const modelRef = useRef<string | undefined>(model);
  modelRef.current = model;

  const resolveHeaders = useCallback((): Record<string, string> => {
    const fn = headersRef.current;
    return fn ? fn() : {};
  }, []);

  // Transport built exactly once per mount. Changing apiUrl post-mount is
  // not supported (AI SDK limitation, not ours), so capturing it on first
  // render and treating it as immutable is the cheapest correct option.
  // The provider memoizes localRuntime over [apiUrl] anyway, so a changed
  // apiUrl naturally remounts this hook.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        headers: () => resolveHeaders(),
        prepareSendMessagesRequest: ({ messages, body }) => {
          const snapshot = liveSnapshotRef.current();
          const tools = buildToolsPayload(snapshot);
          const context = buildStateContext(snapshot);
          return {
            body: {
              ...(body ?? {}),
              // Forward `model` only when the consumer supplied one. Omitting
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl],
  );

  const chat = useChat({
    id: "agentickit-default",
    transport,

    // Adapt AI SDK 6's tool-call payload to the runtime-agnostic shape and
    // hand it to the provider's dispatcher. The provider returns when it
    // has scheduled an `output()` or `outputError()` call; we don't await
    // anything beyond that.
    onToolCall: async ({ toolCall }) => {
      const dispatch = onToolCallRef.current;
      await dispatch({
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
        output: (value) => {
          chatRef.current?.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: value as never,
          });
        },
        outputError: (errorText) => {
          chatRef.current?.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText,
          });
        },
      });
    },

    // Resubmit after every tool result so the model keeps going until the
    // next text reply lands.
    sendAutomaticallyWhen: ({ messages }) => lastAssistantMessageNeedsContinuation(messages),
  });

  // Stable ref to the chat helpers so the captured `onToolCall` closure can
  // reach the latest `addToolOutput` even though it was captured once.
  const chatRef = useRef<typeof chat | null>(null);
  chatRef.current = chat;

  const sendMessage = useCallback(
    async (text: string) => {
      await chat.sendMessage({ text });
    },
    [chat],
  );

  // The chat object's internal fields change every render; we project a
  // stable subset into PilotChatContextValue. `useMemo` here would be a
  // micro-optimization on already-cheap object construction; we let React
  // handle it.
  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    isLoading: chat.status === "submitted" || chat.status === "streaming",
    sendMessage,
    stop: chat.stop,
  };
}

/**
 * Internal: build a runtime that closes over the given options. Used both
 * for `localRuntime()` (singleton when defaults) and for non-default
 * options where each call constructs a fresh wrapper.
 */
function makeLocalRuntime(options: LocalRuntimeOptions): PilotRuntime {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const model = options.model;
  return {
    useRuntime: (config) => useLocalRuntimeImpl(apiUrl, model, config),
  };
}

/**
 * Module-level singleton for the default-options case. Returning the same
 * object across all `localRuntime()` calls (no options) means the provider's
 * fallback path doesn't churn runtime identity on every render. The
 * provider should still memoize over [apiUrl, model] when constructing
 * with custom options, since those create fresh wrappers.
 */
const DEFAULT_LOCAL_RUNTIME = makeLocalRuntime({});

/**
 * Construct a runtime that drives `useChat` from `@ai-sdk/react` against
 * an HTTP route. The default for `apiUrl` is `"/api/pilot"`, matching the
 * shape `createPilotHandler` listens on.
 *
 * Calling with no arguments returns a stable singleton; calling with
 * options creates a fresh wrapper. Memoize the call when options can
 * change across renders, otherwise the provider will see a new runtime
 * identity on every parent render and remount the chat lifecycle.
 *
 * Most consumers do not call this directly: `<Pilot apiUrl="..." model="...">`
 * auto-constructs one when no `runtime` prop is supplied.
 */
export function localRuntime(options: LocalRuntimeOptions = {}): PilotRuntime {
  // Singleton fast-path: when called with default options, hand back the
  // same module-level object so reference identity is rock-stable.
  if (options.apiUrl === undefined && options.model === undefined) {
    return DEFAULT_LOCAL_RUNTIME;
  }
  return makeLocalRuntime(options);
}
