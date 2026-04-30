"use client";

/**
 * `<PilotAgentStateView>`, a JSX-friendly wrapper around
 * `usePilotAgentState`. The hook is the primary API; this component is
 * pure sugar for consumers who prefer render-prop / declarative JSX over
 * extracting a child component just to call the hook.
 *
 * Generative UI in agentickit means: the AG-UI agent emits structured
 * state via `STATE_SNAPSHOT` and `STATE_DELTA` (JSON Patch) events, the
 * runtime applies them through the agent's apply pipeline, and React
 * components that subscribe via this view (or `usePilotAgentState`
 * directly) re-render with the latest state. The component renders
 * whatever the `render` prop returns, the agent's state shape is fully
 * up to the consumer; the runtime makes no assumptions beyond "JSON".
 *
 * Usage:
 *
 * ```tsx
 * import { PilotAgentStateView } from "@hec-ovi/agentickit";
 * import { HttpAgent } from "@ag-ui/client";
 *
 * interface ResearchState {
 *   currentStep: string;
 *   steps: Array<{ id: string; label: string; status: "pending" | "active" | "done" }>;
 * }
 *
 * const agent = new HttpAgent({ url: "/agent" });
 *
 * <PilotAgentStateView<ResearchState>
 *   agent={agent}
 *   render={(state) => (
 *     <ol>
 *       {state?.steps.map((s) => (
 *         <li key={s.id} data-state={s.status}>{s.label}</li>
 *       ))}
 *     </ol>
 *   )}
 * />
 * ```
 *
 * The `render` callback receives the agent's current state cast to `T`.
 * It returns `undefined` until the first `STATE_SNAPSHOT` arrives (or the
 * agent's `initialState` is non-empty); render must handle that. The
 * generic is unsafe at the protocol boundary (state is `any` in AG-UI)
 * so callers should validate with Zod or a runtime check if they don't
 * fully trust the agent.
 */

import type { AbstractAgent } from "@ag-ui/client";
import { type ReactNode } from "react";
import { usePilotAgentState } from "../runtime/ag-ui-runtime.js";

export interface PilotAgentStateViewProps<T> {
  /**
   * The AG-UI agent to subscribe to. Must be the same reference passed to
   * the runtime (`agUiRuntime({ agent })`); the per-agent state store is
   * keyed by reference identity, so two different agent instances would
   * read different stores.
   */
  agent: AbstractAgent;
  /**
   * Render function called with the agent's current state on every change.
   * Returns `undefined` until the first `STATE_SNAPSHOT` lands (or the
   * agent was constructed with a non-default `initialState`). Handle the
   * `undefined` case explicitly, e.g. `state?.steps?.map(...)` or a
   * fallback skeleton.
   */
  render: (state: T | undefined) => ReactNode;
}

/**
 * Subscribe to an AG-UI agent's state and render it via the supplied
 * `render` callback. Re-renders on every `STATE_SNAPSHOT` / `STATE_DELTA`.
 * See file docstring for the generative-UI motivation.
 */
export function PilotAgentStateView<T = unknown>(
  props: PilotAgentStateViewProps<T>,
): ReactNode {
  const state = usePilotAgentState<T>(props.agent);
  return props.render(state);
}
