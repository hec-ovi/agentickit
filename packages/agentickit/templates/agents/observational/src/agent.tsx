/**
 * `{{NAME}}` agent — observational view.
 *
 * Mounts a chat-shaped surface with no input box. The user clicks
 * "Run" and watches structured progress events stream in. The
 * underlying transport is a plain SSE feed from `/api/{{NAME}}/run`,
 * NOT the standard agentickit chat protocol — observational agents
 * don't have a back-and-forth conversation, so the chat protocol
 * would be the wrong shape.
 *
 * If you DO want this agent to support a chat sidebar alongside the
 * progress stream, swap the SSE feed for the AG-UI runtime and feed
 * the same events through `STATE_SNAPSHOT` / `ACTIVITY_DELTA`. Then
 * mount `<PilotChatView composer="off" />` next to a
 * `<PilotAgentStateView agent={...} />`.
 */

import { useCallback, useEffect, useState } from "react";

interface StepEvent {
  type: "step";
  index: number;
  total: number;
  label: string;
}
interface LogEvent {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
}
interface DoneEvent {
  type: "done";
  summary: string;
}
type {{NAME_PASCAL}}Event = StepEvent | LogEvent | DoneEvent;

interface AgentState {
  status: "idle" | "running" | "done" | "error";
  step: { index: number; total: number; label: string } | null;
  logs: ReadonlyArray<LogEvent>;
  summary: string | null;
  error: string | null;
}

const INITIAL: AgentState = {
  status: "idle",
  step: null,
  logs: [],
  summary: null,
  error: null,
};

export function {{NAME_PASCAL}}Agent() {
  const [state, setState] = useState<AgentState>(INITIAL);

  const start = useCallback(() => {
    setState({ ...INITIAL, status: "running" });
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/{{NAME}}/run", { signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE delimiter: blank line. Each frame is `data: <json>\n`.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice("data:".length).trim();
            if (!json) continue;
            const event = JSON.parse(json) as {{NAME_PASCAL}}Event;
            setState((prev) => apply(prev, event));
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    return () => controller.abort();
  }, []);

  // Optional: kick off automatically on mount. Remove if you prefer
  // the user to click "Run".
  useEffect(() => {
    return start();
  }, [start]);

  const progress = state.step ? Math.round((state.step.index / state.step.total) * 100) : 0;

  return (
    <section className="observational-agent">
      <header className="row space-between">
        <h2>{{NAME_PASCAL}}</h2>
        <span className="badge" data-status={state.status}>
          {state.status}
        </span>
      </header>

      {state.step ? (
        <div className="step-info">
          <p>
            Step {state.step.index} of {state.step.total}: {state.step.label}
          </p>
          <div className="progress-bar" aria-label="Progress">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {state.summary ? <p className="summary">{state.summary}</p> : null}
      {state.error ? <p className="error">Error: {state.error}</p> : null}

      <div className="logs">
        {state.logs.map((log, i) => (
          <div key={i} className={`log log-${log.level}`}>
            {log.message}
          </div>
        ))}
      </div>

      {state.status !== "running" ? (
        <button type="button" onClick={start}>
          {state.status === "idle" ? "Run" : "Run again"}
        </button>
      ) : null}
    </section>
  );
}

function apply(prev: AgentState, event: {{NAME_PASCAL}}Event): AgentState {
  switch (event.type) {
    case "step":
      return {
        ...prev,
        step: { index: event.index, total: event.total, label: event.label },
      };
    case "log":
      return { ...prev, logs: [...prev.logs, event] };
    case "done":
      return { ...prev, status: "done", summary: event.summary };
  }
}
