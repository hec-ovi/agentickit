/**
 * Generative-UI demo widget for Phase 5.
 *
 * Subscribes to the AG-UI agent's state via `<PilotAgentStateView>` and
 * renders a step-by-step timeline. The mock server at `/api/agui` emits
 * `STATE_SNAPSHOT` (initial 3 steps with `status: "active"|"pending"`)
 * followed by `STATE_DELTA` events (JSON Patch) that walk each step from
 * `pending` -> `active` -> `done` interleaved with the assistant text.
 *
 * To trigger end-to-end:
 *   1. Switch the runtime picker to "agUiRuntime".
 *   2. In the sidebar / popup / modal, ask "process my data" or "run
 *      a workflow" or any phrase containing think / research / analyze.
 *   3. Watch the steps below transition in real time.
 *
 * In production with a real AG-UI agent (LangGraph CoAgents, CrewAI,
 * Mastra), the agent would emit STATE_DELTA events as the workflow
 * progresses; the widget renders identically without changes.
 */

import type { AbstractAgent } from "@ag-ui/client";
import { PilotAgentStateView } from "@hec-ovi/agentickit";

interface TimelineStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

interface TimelineState {
  steps?: TimelineStep[];
}

interface TimelineWidgetProps {
  agent: AbstractAgent;
}

export function TimelineWidget(props: TimelineWidgetProps) {
  return (
    <PilotAgentStateView<TimelineState>
      agent={props.agent}
      render={(state) => (
        <section className="timeline" data-testid="timeline">
          <header>
            <h2>Thinking timeline</h2>
            <p className="caption">
              Driven by the agent&rsquo;s STATE_SNAPSHOT + STATE_DELTA events.{" "}
              {state?.steps?.length
                ? null
                : "Switch to agUiRuntime, then ask the assistant to 'process my data'."}
            </p>
          </header>
          {state?.steps?.length ? (
            <ol>
              {state.steps.map((step) => (
                <li key={step.id} data-status={step.status}>
                  <span className="timeline-status" aria-hidden>
                    {step.status === "done" ? "✔" : step.status === "active" ? "●" : "○"}
                  </span>
                  <span className="timeline-label">{step.label}</span>
                  <span className="timeline-status-text">{step.status}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      )}
    />
  );
}
