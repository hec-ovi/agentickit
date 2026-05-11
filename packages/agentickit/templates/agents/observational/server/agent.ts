/**
 * `{{NAME}}` agent — observational pattern.
 *
 * The user does NOT chat with this agent. Instead, the agent runs a
 * long task in the background and streams structured progress events
 * over Server-Sent Events (SSE). The frontend renders those events as
 * a live status panel with no chat composer.
 *
 * Concrete example: an indexing job, a long compile, a model warm-up,
 * a multi-step deployment. The agent does the work; the human watches.
 *
 * What this template ships:
 *
 *   GET /api/{{NAME}}/run     start the task, stream JSON events:
 *                             { type: "step", index, total, label }
 *                             { type: "log", level, message }
 *                             { type: "done", summary }
 *
 * The events are intentionally simple JSON-over-SSE rather than full
 * AG-UI events; that keeps the template self-contained. Once you
 * graduate to a real backend agent (LangGraph, CrewAI, Mastra, etc.),
 * swap this stub for the AG-UI bridge and pipe real STATE_SNAPSHOT /
 * ACTIVITY_DELTA events through.
 */

import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

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

// Replace with the actual steps your task performs.
const STEPS: ReadonlyArray<string> = [
  "Connecting to data source",
  "Fetching latest snapshot",
  "Validating schema",
  "Computing summary",
  "Writing report",
  "Notifying subscribers",
];

const STEP_DELAY_MS = 800;

export async function {{NAME_CAMEL}}RunRoute(c: Context): Promise<Response> {
  return streamSSE(c, async (stream) => {
    const send = async (ev: {{NAME_PASCAL}}Event) => {
      await stream.writeSSE({ data: JSON.stringify(ev) });
    };

    for (let i = 0; i < STEPS.length; i += 1) {
      await send({
        type: "step",
        index: i + 1,
        total: STEPS.length,
        label: STEPS[i] as string,
      });
      // Replace this sleep with your real step's work.
      await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      // Optional: emit a log line per step.
      await send({
        type: "log",
        level: "info",
        message: `Completed: ${STEPS[i]}`,
      });
    }

    await send({
      type: "done",
      summary: `Completed ${STEPS.length} steps in ${(STEPS.length * STEP_DELAY_MS) / 1000}s.`,
    });
  });
}
