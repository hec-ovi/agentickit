"use client";

/**
 * AG-UI runtime for agentickit. Drives an `AbstractAgent` instance from
 * `@ag-ui/client` and adapts its event stream into the protocol-agnostic
 * `PilotChatContextValue` shape that `<PilotChatView>` consumes.
 *
 * Why an AG-UI runtime exists alongside `localRuntime`: AG-UI is the wire
 * format CopilotKit uses to talk to long-running agents (LangGraph, CrewAI,
 * Mastra, Pydantic AI). Mounting the same `<PilotSidebar>` / `<PilotPopup>`
 * / `<PilotModal>` chrome on top of an AG-UI agent lets a consumer reuse
 * agentickit's UI primitives, registry, confirm modal, and HITL gating
 * without re-implementing them once they leave the AI-SDK-6 path.
 *
 * Responsibilities of this file:
 *   1. Subscribe to the consumer's `AbstractAgent` and convert AG-UI's
 *      `Message[]` shape (OpenAI-style discriminated union, `role` + content)
 *      into the AI SDK 6 `UIMessage[]` shape (`{ id, role, parts }`) the
 *      sidebar's renderer expects.
 *   2. Map AG-UI lifecycle events (RUN_STARTED, TEXT_MESSAGE_START,
 *      TOOL_CALL_*, RUN_FINISHED, RUN_ERROR) onto the
 *      `submitted | streaming | ready | error` status the chat context
 *      surfaces.
 *   3. Bridge AG-UI tool calls to the provider's dispatcher: when the agent
 *      emits TOOL_CALL_END for a registered action, we hand it through
 *      `config.onToolCall(...)`, settle via `output()` / `outputError()`,
 *      append a `role: "tool"` message to the agent, and re-run so the
 *      conversation continues with the new tool result.
 *   4. Maintain a per-agent state-and-activity store keyed by agent
 *      reference (a `WeakMap`). `usePilotAgentState(agent)` and
 *      `usePilotAgentActivity(agent)` subscribe to it via
 *      `useSyncExternalStore` so STATE_DELTA / STATE_SNAPSHOT events and
 *      ACTIVITY_* / REASONING_* events surface in consumer components
 *      without crossing the chat context.
 *
 * Design choices worth flagging:
 *
 *   - `@ag-ui/client` is an OPTIONAL peer dependency. agentickit imports
 *     types from it via `import type` only, so this file compiles to a
 *     module that does not pull `@ag-ui/client` (or rxjs) into the bundle
 *     for consumers who only use `localRuntime`. The consumer brings the
 *     agent, we adapt it.
 *   - The agent reference must be stable across renders. Consumers should
 *     construct `HttpAgent` (or any `AbstractAgent` subclass) once with
 *     `useMemo` (or as a module constant) and feed the same reference into
 *     both `agUiRuntime({ agent })` and the state/activity hooks. Identity
 *     drives the `WeakMap` key, so a fresh agent each render would also
 *     remount the chat lifecycle.
 *   - Tool-call continuation is client-driven. AG-UI servers can either
 *     emit `TOOL_CALL_RESULT` themselves (server-side execution, the run
 *     keeps going), or emit `TOOL_CALL_END` and stop, expecting the client
 *     to dispatch and re-run. This file handles the second case: every run
 *     finishes with `agent.runAgent` resolving, we check whether any tool
 *     was dispatched in that run, and re-run with the appended tool result
 *     if so. The loop terminates when the assistant produces a text reply
 *     with no further tool calls.
 */

import type {
  AbstractAgent,
  ActivityMessage,
  AgentStateMutation,
  AgentSubscriber,
  Message as AgUiMessage,
  ReasoningMessage,
  RunAgentParameters,
  State,
  Tool as AgUiTool,
  ToolCall as AgUiToolCall,
} from "@ag-ui/client";
import { zodSchema } from "ai";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PilotChatContextValue, PilotRegistrySnapshot } from "../context.js";
import type { PilotRuntime, PilotRuntimeConfig } from "./types.js";

/* ------------------------------------------------------------------ */
/* Public construction options                                        */
/* ------------------------------------------------------------------ */

export interface AgUiRuntimeOptions {
  /**
   * The AG-UI agent to drive. Construct once at app root (e.g.,
   * `useMemo(() => new HttpAgent({ url, agentId }), [...])`) and pass the
   * same reference into both `agUiRuntime({ agent })` and the
   * `usePilotAgentState` / `usePilotAgentActivity` hooks. Agent identity is
   * the `WeakMap` key for the per-agent state store, so a fresh instance
   * per render would lose state and remount the chat.
   */
  agent: AbstractAgent;
  /**
   * Optional override for the per-run AG-UI parameters payload. The runtime
   * builds tools and context from the registry on every send; if you need
   * to inject `forwardedProps` or override anything else, return a partial
   * here and it merges over the defaults.
   */
  prepareRunParameters?: (snapshot: PilotRegistrySnapshot) => Partial<RunAgentParameters>;
}

/* ------------------------------------------------------------------ */
/* Internal: per-agent state/activity store, keyed by agent reference  */
/* ------------------------------------------------------------------ */

type Listener = () => void;

interface ActivitySnapshot {
  activities: ReadonlyArray<ActivityMessage>;
  reasoning: ReadonlyArray<ReasoningMessage>;
}

const EMPTY_ACTIVITY: ActivitySnapshot = Object.freeze({
  activities: Object.freeze([]) as ReadonlyArray<ActivityMessage>,
  reasoning: Object.freeze([]) as ReadonlyArray<ReasoningMessage>,
});

interface AgentStore {
  subscribe: (l: Listener) => () => void;
  getState: () => State | undefined;
  getActivity: () => ActivitySnapshot;
  setState: (s: State | undefined) => void;
  setActivity: (next: ActivitySnapshot) => void;
}

const agentStores = new WeakMap<AbstractAgent, AgentStore>();

function getAgentStore(agent: AbstractAgent): AgentStore {
  let store = agentStores.get(agent);
  if (!store) {
    store = createAgentStore();
    agentStores.set(agent, store);
  }
  return store;
}

function createAgentStore(): AgentStore {
  let state: State | undefined;
  let activity: ActivitySnapshot = EMPTY_ACTIVITY;
  const listeners = new Set<Listener>();
  const notify = (): void => {
    for (const l of listeners) l();
  };
  return {
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getState: () => state,
    getActivity: () => activity,
    setState(next) {
      if (state === next) return;
      state = next;
      notify();
    },
    setActivity(next) {
      // Identity-stable when no change so useSyncExternalStore doesn't churn.
      if (
        next.activities === activity.activities &&
        next.reasoning === activity.reasoning
      ) {
        return;
      }
      activity = next;
      notify();
    },
  };
}

/**
 * Read the AG-UI agent's current state. Re-renders the calling component
 * whenever the agent emits STATE_SNAPSHOT or STATE_DELTA. Returns
 * `undefined` until the first snapshot arrives.
 *
 * The generic `T` is unsafe (the agent's state is `any` at the protocol
 * level); cast at the call site to your real shape.
 */
export function usePilotAgentState<T = State>(agent: AbstractAgent): T | undefined {
  const store = getAgentStore(agent);
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  ) as T | undefined;
}

/**
 * Read the agent's activity and reasoning streams. Activity messages are
 * structured progress updates the agent emits via ACTIVITY_SNAPSHOT /
 * ACTIVITY_DELTA; reasoning blocks are chain-of-thought entries from
 * REASONING_*. Both are filtered out of the chat-message list and surfaced
 * here separately so consumers can render them in their own UI.
 */
export function usePilotAgentActivity(agent: AbstractAgent): ActivitySnapshot {
  const store = getAgentStore(agent);
  return useSyncExternalStore(store.subscribe, store.getActivity, store.getActivity);
}

/* ------------------------------------------------------------------ */
/* Public factory                                                     */
/* ------------------------------------------------------------------ */

/**
 * Construct a `PilotRuntime` that drives an AG-UI `AbstractAgent`. The
 * returned runtime is intended to be passed to `<Pilot runtime={...}>`.
 *
 * Stability: when called with only `{ agent }`, the factory returns the
 * SAME runtime object across calls (cached by agent reference in a
 * `WeakMap`), so the provider's `useMemo` sees a stable identity and
 * doesn't remount the chat lifecycle on every parent render. When called
 * with a custom `prepareRunParameters` the cache is bypassed (the function
 * identity is part of the runtime's behavior, not just its config), and
 * the consumer is responsible for memoization.
 *
 * Mirrors the singleton fast-path in {@link localRuntime}: the common case
 * is correct by default, the unusual case is documented.
 */
const runtimeCache = new WeakMap<AbstractAgent, PilotRuntime>();

export function agUiRuntime(options: AgUiRuntimeOptions): PilotRuntime {
  if (!options.prepareRunParameters) {
    const cached = runtimeCache.get(options.agent);
    if (cached) return cached;
    const fresh: PilotRuntime = {
      useRuntime: (config) => useAgUiRuntimeImpl(options, config),
    };
    runtimeCache.set(options.agent, fresh);
    return fresh;
  }
  return {
    useRuntime: (config) => useAgUiRuntimeImpl(options, config),
  };
}

/* ------------------------------------------------------------------ */
/* Runtime hook                                                       */
/* ------------------------------------------------------------------ */

function useAgUiRuntimeImpl(
  options: AgUiRuntimeOptions,
  config: PilotRuntimeConfig,
): PilotChatContextValue {
  const { agent, prepareRunParameters } = options;

  // Refs hold the latest config so the long-lived subscriber can read
  // current values without us tearing it down on every parent render.
  // (Headers are not used by the AG-UI runtime: HttpAgent owns its own
  // headers field at construction. If a future runtime extension needs
  // per-request headers, expose it on AgUiRuntimeOptions and merge into
  // the agent's requestInit there.)
  const onToolCallRef = useRef(config.onToolCall);
  onToolCallRef.current = config.onToolCall;
  const getSnapshotRef = useRef(config.getSnapshot);
  getSnapshotRef.current = config.getSnapshot;
  const prepareRef = useRef(prepareRunParameters);
  prepareRef.current = prepareRunParameters;

  // UI-shaped chat state. `messages` mirrors `agent.messages` converted
  // into UIMessage shape; status flips on RUN_STARTED / RUN_FINISHED /
  // RUN_ERROR; error captures the latest run-error payload. Status is
  // seeded from `agent.isRunning` so a remount mid-run reflects the
  // agent's actual state instead of falsely showing "ready".
  const [messages, setMessages] = useState<unknown[]>(() =>
    convertMessages(agent.messages),
  );
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">(
    () => (agent.isRunning ? "streaming" : "ready"),
  );
  const [error, setError] = useState<Error | undefined>(undefined);

  // Per-run flag tracking whether the run dispatched any client tool. After
  // each runAgent resolves we re-run if the assistant is waiting on tool
  // outputs we just produced.
  const toolDispatchedRef = useRef(false);
  // Re-entry guard: blocks concurrent sendMessage invocations. The chat
  // view already disables the send button while loading, but a programmatic
  // caller could bypass that and produce two overlapping runs that AG-UI
  // does not refuse. This guard makes the runtime self-defending.
  const runningRef = useRef(false);

  const store = getAgentStore(agent);

  // Sync the per-agent state/activity store on mount and on every messages
  // change in the long-lived subscriber.
  useEffect(() => {
    // Seed both stores from the current agent state so consumers reading
    // before the first run see whatever was passed via initialState /
    // initialMessages.
    store.setState(agent.state);
    store.setActivity(extractActivity(agent.messages));
    setMessages(convertMessages(agent.messages));

    const subscriber: AgentSubscriber = {
      onMessagesChanged: ({ messages: next }) => {
        setMessages(convertMessages(next));
        store.setActivity(extractActivity(next));
      },
      onStateChanged: ({ state }) => {
        store.setState(state);
      },
      onRunStartedEvent: () => {
        setStatus("submitted");
        setError(undefined);
        toolDispatchedRef.current = false;
      },
      onTextMessageStartEvent: () => {
        setStatus("streaming");
      },
      onToolCallStartEvent: () => {
        setStatus("streaming");
      },
      onRunFinishedEvent: () => {
        setStatus("ready");
      },
      onRunErrorEvent: ({ event }) => {
        const message = (event as { message?: string }).message ?? "AG-UI run error";
        setError(new Error(message));
        setStatus("error");
      },
      // Bridge the tool call to the provider's dispatcher, but only if
      // the tool is registered locally. AG-UI servers can mix client-side
      // and server-side tools in the same run; if we dispatched every
      // TOOL_CALL_END the server would receive a duplicate `tool` message
      // (ours via this mutation, theirs via TOOL_CALL_RESULT). Skipping
      // unknown tools lets the server's own resolver handle them.
      //
      // Returning a mutation appends the tool result to the messages list
      // for the next `runAgent` call to see.
      onToolCallEndEvent: async (params): Promise<AgentStateMutation | void> => {
        const { event, toolCallName, toolCallArgs } = params as {
          event: { toolCallId: string };
          toolCallName: string;
          toolCallArgs: Record<string, unknown>;
        };
        const snapshot = getSnapshotRef.current();
        const isLocalTool = snapshot.actions.some((a) => a.name === toolCallName);
        if (!isLocalTool) return;
        toolDispatchedRef.current = true;

        const result = await dispatchToolCall(
          onToolCallRef.current,
          toolCallName,
          event.toolCallId,
          toolCallArgs,
        );

        const toolMessage: AgUiMessage = result.kind === "ok"
          ? ({
              id: randomId(),
              role: "tool",
              toolCallId: event.toolCallId,
              content: serializeToolOutput(result.value),
            } as AgUiMessage)
          : ({
              id: randomId(),
              role: "tool",
              toolCallId: event.toolCallId,
              content: "",
              error: result.errorText,
            } as AgUiMessage);

        return { messages: [...params.messages, toolMessage] };
      },
    };

    const sub = agent.subscribe(subscriber);
    return () => {
      sub.unsubscribe();
    };
  }, [agent, store]);

  /**
   * Run the agent until the run resolves AND no client tool result is
   * pending. The loop has a 16-iteration cap; if a misconfigured server
   * emits tool calls forever, we surface a chat error rather than spin
   * silently.
   *
   * Tool / context merge: when `prepareRunParameters` is supplied, its
   * `tools` and `context` ARE CONCATENATED with the registry-derived
   * defaults rather than replacing them. Other fields (forwardedProps,
   * runId) replace via shallow merge. Most consumers want to add to the
   * registry's tools, not throw them away.
   */
  const runUntilSettled = useCallback(async () => {
    const MAX_ITERATIONS = 16;
    let safety = 0;
    do {
      toolDispatchedRef.current = false;
      const snapshot = getSnapshotRef.current();
      const overrides = prepareRef.current?.(snapshot) ?? {};
      const params: RunAgentParameters = {
        ...overrides,
        tools: [...buildTools(snapshot), ...(overrides.tools ?? [])],
        context: [...buildContext(snapshot), ...(overrides.context ?? [])],
      };
      try {
        await agent.runAgent(params);
      } catch (err) {
        // Treat thrown errors as run errors so the chat surfaces them.
        const message = err instanceof Error ? err.message : String(err);
        setError(new Error(message));
        setStatus("error");
        return;
      }
      safety += 1;
    } while (toolDispatchedRef.current && safety < MAX_ITERATIONS);

    if (toolDispatchedRef.current && safety >= MAX_ITERATIONS) {
      const msg = `AG-UI runtime: tool-call continuation cap (${MAX_ITERATIONS}) reached, aborting loop. The agent may be emitting tool calls without ever resolving them.`;
      console.warn(msg);
      setError(new Error(msg));
      setStatus("error");
    }
  }, [agent]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      // Re-entry guard: a programmatic caller could fire two sendMessage
      // calls in the same tick. AG-UI's AbstractAgent doesn't refuse re-entry,
      // so without this guard both runs would interleave.
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        agent.addMessage({
          id: randomId(),
          role: "user",
          content: text,
        } as AgUiMessage);
        await runUntilSettled();
      } finally {
        runningRef.current = false;
      }
    },
    [agent, runUntilSettled],
  );

  const stop = useCallback(async (): Promise<void> => {
    // Reset the continuation flag so the run loop won't trigger a
    // follow-up runAgent after the user explicitly aborted.
    toolDispatchedRef.current = false;
    agent.abortRun();
  }, [agent]);

  return {
    messages,
    status,
    error,
    isLoading: status === "submitted" || status === "streaming",
    sendMessage,
    stop,
  };
}

/* ------------------------------------------------------------------ */
/* Tool-call bridge                                                   */
/* ------------------------------------------------------------------ */

type DispatchResult =
  | { kind: "ok"; value: unknown }
  | { kind: "error"; errorText: string };

/**
 * Wrap the provider's `onToolCall` dispatcher in a Promise that resolves
 * with whichever terminal callback fires first. The dispatcher is allowed
 * to call `output` or `outputError` synchronously (most do) or after a
 * confirm/HITL await (mutating actions); either way we wait.
 */
function dispatchToolCall(
  onToolCall: PilotRuntimeConfig["onToolCall"],
  toolName: string,
  toolCallId: string,
  input: unknown,
): Promise<DispatchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: DispatchResult): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    void onToolCall({
      toolName,
      toolCallId,
      input,
      output: (value) => settle({ kind: "ok", value }),
      outputError: (errorText) => settle({ kind: "error", errorText }),
    }).catch((err) => {
      // The provider's dispatch shouldn't throw, but if it does (custom
      // runtime, weird subclass, etc.) treat it as an error result so the
      // run can continue with a tool error rather than wedging.
      settle({
        kind: "error",
        errorText: err instanceof Error ? err.message : String(err),
      });
    });
  });
}

function serializeToolOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* ------------------------------------------------------------------ */
/* Tools / context builders                                           */
/* ------------------------------------------------------------------ */

/**
 * Compile the registry into AG-UI Tool entries for the next run. Mirrors
 * the localRuntime's `buildToolsPayload`, except AG-UI's tool shape is
 * `{ name, description, parameters }` (parameters as JSON Schema) rather
 * than the AI-SDK-6 dynamic-tool wrapper.
 */
function buildTools(snapshot: PilotRegistrySnapshot): AgUiTool[] {
  const out: AgUiTool[] = [];
  for (const action of snapshot.actions) {
    const tool: AgUiTool = {
      name: action.name,
      description: action.description,
      parameters: zodSchema(action.parameters).jsonSchema,
    };
    out.push(tool);
  }
  return out;
}

/**
 * Compile the registry's state entries into AG-UI Context entries. AG-UI
 * Context is `{ value: string, description: string }[]`; we serialize the
 * state's value to JSON so the agent sees the live UI snapshot prepended
 * to its system prompt.
 */
function buildContext(
  snapshot: PilotRegistrySnapshot,
): { value: string; description: string }[] {
  const out: { value: string; description: string }[] = [];
  for (const state of snapshot.states) {
    let serialized: string;
    try {
      serialized = JSON.stringify(state.value);
    } catch {
      serialized = String(state.value);
    }
    out.push({
      value: `${state.name}: ${serialized}`,
      description: state.description,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Activity / reasoning extraction                                    */
/* ------------------------------------------------------------------ */

/**
 * Filter out activity and reasoning messages from the agent's messages
 * list and bundle them into the activity store snapshot. Identity-stable
 * across calls when nothing new is appended, so `useSyncExternalStore`
 * sees the same reference and skips re-renders.
 */
function extractActivity(messages: ReadonlyArray<AgUiMessage>): ActivitySnapshot {
  const activities: ActivityMessage[] = [];
  const reasoning: ReasoningMessage[] = [];
  for (const m of messages) {
    if (m.role === "activity") activities.push(m as ActivityMessage);
    else if (m.role === "reasoning") reasoning.push(m as ReasoningMessage);
  }
  if (activities.length === 0 && reasoning.length === 0) return EMPTY_ACTIVITY;
  return { activities, reasoning };
}

/* ------------------------------------------------------------------ */
/* Message conversion: AG-UI -> AI-SDK-6 UIMessage                    */
/* ------------------------------------------------------------------ */

interface UiPart {
  type: string;
  [key: string]: unknown;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: UiPart[];
}

/**
 * Convert AG-UI's discriminated-union `Message[]` into the AI SDK 6 shape
 * `<PilotChatView>` renders. Tool result messages (`role: "tool"`) are
 * folded into the preceding assistant message's tool part so the renderer
 * shows the input-and-output pair as a single chip rather than a hanging
 * "tool message" bubble. Activity and reasoning messages are dropped here
 * (they live in the activity store).
 */
export function convertMessages(messages: ReadonlyArray<AgUiMessage>): UiMessage[] {
  // Index tool results by toolCallId for O(1) lookup while emitting
  // assistant tool parts.
  const toolResultsByCallId = new Map<
    string,
    { content: string; error?: string }
  >();
  for (const m of messages) {
    if (m.role === "tool") {
      const tm = m as { toolCallId: string; content: string; error?: string };
      toolResultsByCallId.set(tm.toolCallId, {
        content: tm.content,
        error: tm.error,
      });
    }
  }

  const out: UiMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool" || m.role === "activity" || m.role === "reasoning") {
      // Tool messages fold into the preceding assistant; activity and
      // reasoning live in the side store.
      continue;
    }
    if (m.role === "user") {
      const um = m as { id: string; content: unknown };
      const text = stringifyUserContent(um.content);
      out.push({
        id: um.id,
        role: "user",
        parts: [{ type: "text", text }],
      });
      continue;
    }
    if (m.role === "assistant") {
      const am = m as {
        id: string;
        content?: string;
        toolCalls?: AgUiToolCall[];
      };
      const parts: UiPart[] = [];
      if (typeof am.content === "string" && am.content.length > 0) {
        parts.push({ type: "text", text: am.content });
      }
      for (const tc of am.toolCalls ?? []) {
        const result = toolResultsByCallId.get(tc.id);
        const part: UiPart = {
          type: `tool-${tc.function.name}`,
          toolName: tc.function.name,
          toolCallId: tc.id,
          input: safeParseJson(tc.function.arguments),
          state: result
            ? result.error !== undefined
              ? "output-error"
              : "output-available"
            : "input-available",
        };
        if (result) {
          if (result.error !== undefined) {
            part.errorText = result.error;
          } else {
            part.output = safeParseJson(result.content);
          }
        }
        parts.push(part);
      }
      out.push({ id: am.id, role: "assistant", parts });
      continue;
    }
    if (m.role === "system" || m.role === "developer") {
      const sm = m as { id: string; content: string };
      out.push({
        id: sm.id,
        role: "system",
        parts: [{ type: "text", text: sm.content }],
      });
      continue;
    }
  }
  return out;
}

/**
 * AG-UI user messages can carry multimodal content (string or array of
 * input parts: text, image, audio, video, document, binary). We only
 * surface the text-shaped pieces in v3b; multimodal rendering is a
 * separate phase. Non-text parts collapse to a placeholder so the bubble
 * doesn't render empty.
 */
function stringifyUserContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (part && typeof part === "object" && "type" in part) {
      const p = part as { type: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") {
        out += p.text;
      } else {
        out += `[${p.type}]`;
      }
    }
  }
  return out;
}

/**
 * Tool calls and results travel as JSON-encoded strings on the AG-UI wire
 * (`tc.function.arguments`, `toolMessage.content`). Try to parse so the
 * renderer's `<pre>` block shows pretty JSON; fall back to the raw string
 * when parsing fails (the tool may have legitimately returned plain text).
 */
function safeParseJson(raw: string): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/* ------------------------------------------------------------------ */
/* IDs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Generate a UUID-shaped id for runtime-issued messages (user input, tool
 * results). We don't import `uuid` directly since `@ag-ui/client` already
 * pulls it transitively; using `crypto.randomUUID` when present and a
 * fallback PRNG keeps this file's dep graph minimal and works under both
 * Node and the browser without extra polyfills.
 */
function randomId(): string {
  // crypto.randomUUID exists on Node 19+, modern browsers, happy-dom.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback: 16 hex chars is enough for in-process correlation. AG-UI
  // doesn't require a specific id format.
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}
