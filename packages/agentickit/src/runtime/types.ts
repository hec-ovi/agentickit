/**
 * Runtime abstraction for agentickit.
 *
 * The `<Pilot>` provider is split into two layers:
 *
 *   1. The **provider** owns the registry (actions / state / forms), the
 *      pending-confirm and pending-HITL slots, the confirm and HITL render
 *      output, and the `handleToolCall` dispatcher (Zod parse, confirm gate,
 *      HITL gate, handler call).
 *
 *   2. The **runtime** owns the chat lifecycle: the transport, the message
 *      stream, the SDK-shape-to-runtime-shape adaptation for tool calls, and
 *      `sendMessage` / `stop`.
 *
 * The default runtime, `localRuntime()`, drives `useChat` from
 * `@ai-sdk/react` against an HTTP route that streams AI SDK 6 UIMessage
 * frames. A future `agUiRuntime()` will consume the AG-UI protocol via
 * `@ag-ui/client` and surface the same `PilotChatContextValue` shape, so
 * neither the provider nor the consumer's UI components need to change to
 * swap backends.
 *
 * The contract is a single hook: a runtime is anything that, given the
 * provider's per-render config, returns a `PilotChatContextValue`. The
 * provider calls exactly one runtime hook per render. Switching runtimes
 * at runtime unmounts the chat and remounts it.
 *
 * Connection-shaped fields (URL, agent id, model id) belong on the
 * runtime's CONSTRUCTOR, not on `PilotRuntimeConfig`. This keeps the
 * per-render config protocol-agnostic. `localRuntime({ apiUrl, model })`
 * configures the AI-SDK-6 HTTP path; `agUiRuntime({ runtimeUrl, agentId })`
 * (Phase 3b) configures the AG-UI path. The provider doesn't know which.
 */

import type { PilotChatContextValue, PilotRegistrySnapshot } from "../context.js";

/**
 * Configuration the provider passes into a runtime hook on every render.
 * This is the protocol-agnostic seam: only data the runtime can't know
 * without help from the provider goes here. URL / agent-id / model-id
 * live on the runtime's constructor instead.
 *
 * `getSnapshot` and `onToolCall` are stable references (useCallback with
 * stable deps inside the provider). Runtimes are still expected to capture
 * them via refs internally so the chat lifecycle isn't re-created on every
 * parent render, since the surrounding config object is a fresh literal
 * each render.
 */
export interface PilotRuntimeConfig {
  /** Resolver for headers attached to each outgoing request. */
  headers?: () => Record<string, string>;
  /**
   * Live snapshot accessor. The runtime calls this on every send to pick up
   * the freshest registered tools / state. The provider returns a stable
   * snapshot when nothing has changed (registry-level memoization), so this
   * is cheap to call repeatedly.
   */
  getSnapshot: () => PilotRegistrySnapshot;
  /**
   * Called by the runtime when the model emits a tool call that the client
   * is expected to dispatch. The provider runs its confirm-modal / HITL /
   * handler flow and resolves the call by invoking either `output(value)`
   * or `outputError(text)` on the supplied call object.
   *
   * The Promise resolves when the provider has finished its dispatch (or
   * has scheduled the output via the supplied callbacks). The runtime is
   * responsible for ensuring the output reaches the model on the wire,
   * `localRuntime` does this by funneling through `chat.addToolOutput`,
   * which AI SDK 6 batches into the UIMessage stream.
   */
  onToolCall: (call: PilotIncomingToolCall) => Promise<void>;
}

/**
 * The shape the runtime hands to the provider's `onToolCall`. Decoupled
 * from any specific SDK so a non-`useChat` runtime (AG-UI, custom WebSocket
 * transport, in-memory test harness) can use the same dispatcher logic.
 *
 * `output` and `outputError` are TERMINAL: each call sends a final result
 * to the model for this tool-call id. The runtime is allowed to ignore
 * subsequent invocations on the same call object; the provider is
 * responsible for calling exactly one of them per dispatch.
 */
export interface PilotIncomingToolCall {
  /** Tool name as advertised in the request body's `tools` field. */
  readonly toolName: string;
  /** Server-issued correlation id for this specific call. */
  readonly toolCallId: string;
  /**
   * Tool-call arguments as the model emitted them. The provider parses
   * with Zod before dispatching to the handler; AG-UI runtimes pass
   * already-deserialized JSON here.
   */
  readonly input: unknown;
  /**
   * Send a successful tool result back into the runtime's stream.
   * Terminal; calling more than once is a no-op or undefined behavior
   * depending on the runtime. Mutually exclusive with `outputError`.
   */
  output: (value: unknown) => void;
  /**
   * Send an error tool result back into the runtime's stream.
   * Terminal; same semantics as `output`. Mutually exclusive.
   */
  outputError: (errorText: string) => void;
}

/**
 * A runtime is a hook factory. Calling `runtime.useRuntime(config)` inside
 * the provider returns the chat-context value that flows to the rest of
 * the app via `PilotChatContext`.
 *
 * `useRuntime` is a regular React hook and follows all the rules thereof:
 * called unconditionally, on every render of the provider, with the same
 * config shape (though the `config` object itself is allowed to be a fresh
 * literal each render).
 */
export interface PilotRuntime {
  useRuntime: (config: PilotRuntimeConfig) => PilotChatContextValue;
}
