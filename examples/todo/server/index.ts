/**
 * Tiny Hono server for the example.
 *
 * Three endpoints:
 *   POST /api/pilot        -> createPilotHandler (the localRuntime path; real LLM)
 *   POST /api/agui         -> mock AG-UI server (the agUiRuntime path; scripted, no LLM)
 *   GET  /api/pilot-log    -> SSE of structured log events for the live log panel
 *
 * The Vite dev server proxies /api/* to this process (see vite.config.ts).
 * Run with:  tsx watch --env-file=.env.local server/index.ts
 *
 * The /api/agui route is intentionally scripted (no LLM call) so the AG-UI
 * runtime can be demoed end-to-end without burning credits and without a real
 * LangGraph / CrewAI / Mastra backend. It emits AG-UI SSE events directly.
 * In production you would point HttpAgent at a real AG-UI server URL.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createPilotHandler, type PilotLogEvent } from "@hec-ovi/agentickit/server";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const MODEL = process.env.PILOT_MODEL ?? "openai/gpt-oss-120b";

// -- Log broadcaster --------------------------------------------------------
// The handler emits one PilotLogEvent per log line via onLogEvent. We keep
// a small ring buffer so a tab opened mid-conversation still sees context,
// and a Set of subscribers so SSE clients get live events.

const RING_LIMIT = 500;
const ring: PilotLogEvent[] = [];
type Subscriber = (event: PilotLogEvent) => void;
const subscribers = new Set<Subscriber>();

function broadcast(event: PilotLogEvent): void {
  ring.push(event);
  if (ring.length > RING_LIMIT) ring.shift();
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch {
      // Subscriber error should never break the handler or other subscribers.
    }
  }
}

// -- Hono app ---------------------------------------------------------------

const app = new Hono();

const pilotHandler = createPilotHandler({
  model: MODEL,
  maxSteps: 8,
  debug: true,
  log: true,
  onLogEvent: broadcast,
});

app.all("/api/pilot", (c) => pilotHandler(c.req.raw));

app.get("/api/pilot-log", (c) =>
  streamSSE(c, async (stream) => {
    // Replay history so the panel has context on reconnect.
    for (const event of ring) {
      await stream.writeSSE({ data: JSON.stringify(event), event: "log" });
    }
    const sub: Subscriber = (event) => {
      stream
        .writeSSE({ data: JSON.stringify(event), event: "log" })
        .catch(() => {
          /* connection dropped */
        });
    };
    subscribers.add(sub);
    const heartbeat = setInterval(() => {
      stream.writeSSE({ data: "", event: "ping" }).catch(() => {});
    }, 15_000);
    // Block until the client aborts. One onAbort, one resolution, one cleanup.
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        subscribers.delete(sub);
        resolve();
      });
    });
  }),
);

// -- Mock AG-UI server ------------------------------------------------------
// Streams AG-UI SSE events for a scripted assistant turn so agUiRuntime can
// be exercised end-to-end without a real agent backend. Looks at the incoming
// RunAgentInput's messages array to decide what to emit:
//
//   1. Last message is `role: "tool"`           -> acknowledge with text reply.
//   2. Last user message mentions "todo"/"add"  -> emit a TOOL_CALL_END for
//      the registered `add_todo` action so the runtime dispatches it locally.
//   3. Otherwise                                -> emit a scripted text reply.
//
// Each event is SSE-framed (`data: <json>\n\n`) per AG-UI's parseSSEStream.

interface AgUiUserMessage {
  role: "user";
  content: string | Array<{ type: string; text?: string }>;
}
interface AgUiToolMessage {
  role: "tool";
  toolCallId: string;
  content: string;
}
interface AgUiAssistantMessage {
  role: "assistant";
  content?: string;
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}
type AgUiMessage = AgUiUserMessage | AgUiToolMessage | AgUiAssistantMessage | { role: string };

interface AgUiRunInput {
  threadId: string;
  runId: string;
  messages: AgUiMessage[];
  tools?: Array<{ name: string }>;
}

function extractText(content: AgUiUserMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

function extractTodoText(userText: string): string {
  // Best-effort: pull the part after "todo" or "add" until end of sentence.
  const match = userText.match(/(?:todo|add)\s*(?:to|:|-)?\s*(.+?)(?:[.!?]|$)/i);
  return match?.[1]?.trim() || "buy milk";
}

function scriptedReply(userText: string): string {
  // Word-boundary checks so substrings ("this" containing "hi") don't fire
  // the wrong branch.
  const t = userText.toLowerCase();
  const matches = (re: RegExp): boolean => re.test(t);
  if (matches(/\b(hi|hello|hey)\b/)) {
    return "Hi! I am the scripted demo agent for `agUiRuntime`. Try saying 'add a todo to call mom' to see a tool call routed through the registry.";
  }
  if (matches(/\b(about|what|who|how)\b/)) {
    return "I am a mock AG-UI server emitting scripted SSE events. In production, `agUiRuntime` points at a real LangGraph CoAgents, CrewAI, or Mastra endpoint.";
  }
  if (matches(/\b(thanks|thank|thx)\b/)) {
    return "You're welcome.";
  }
  return "Got it. Try asking me to add a todo, or ask me about the demo.";
}

/**
 * Step-timeline events for the generative-UI demo. Emits a STATE_SNAPSHOT
 * with three pending steps, then four STATE_DELTA events that walk each
 * step from `pending` -> `active` -> `done` interleaved with text. The
 * runtime applies the JSON Patch deltas through fast-json-patch and
 * surfaces the post-patch state via usePilotAgentState. Consumer renders
 * the steps list in <PilotAgentStateView>.
 */
function timelineEvents(threadId: string): Array<Record<string, unknown>> {
  const messageId = `m-${Date.now()}`;
  return [
    {
      type: "STATE_SNAPSHOT",
      snapshot: {
        steps: [
          { id: "fetch", label: "Fetching context", status: "active" },
          { id: "analyze", label: "Analyzing", status: "pending" },
          { id: "summarize", label: "Summarizing", status: "pending" },
        ],
      },
    },
    {
      type: "STATE_DELTA",
      delta: [
        { op: "replace", path: "/steps/0/status", value: "done" },
        { op: "replace", path: "/steps/1/status", value: "active" },
      ],
    },
    {
      type: "STATE_DELTA",
      delta: [
        { op: "replace", path: "/steps/1/status", value: "done" },
        { op: "replace", path: "/steps/2/status", value: "active" },
      ],
    },
    {
      type: "STATE_DELTA",
      delta: [{ op: "replace", path: "/steps/2/status", value: "done" }],
    },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta:
        "All three steps complete. The thinking-timeline widget below was driven by STATE_SNAPSHOT then three STATE_DELTA events (JSON Patch).",
    },
    { type: "TEXT_MESSAGE_END", messageId },
    void threadId,
  ].filter(Boolean) as Array<Record<string, unknown>>;
}

function scriptEvents(input: AgUiRunInput): Array<Record<string, unknown>> {
  const last = input.messages[input.messages.length - 1];
  const events: Array<Record<string, unknown>> = [];
  events.push({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });

  if (last?.role === "tool") {
    // Acknowledge the tool result with a text reply.
    const messageId = `m-${Date.now()}`;
    events.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
    events.push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: "Done! Added that todo for you.",
    });
    events.push({ type: "TEXT_MESSAGE_END", messageId });
  } else if (last?.role === "user") {
    const text = extractText((last as AgUiUserMessage).content);
    const t = text.toLowerCase();
    const wantsTimeline =
      /\b(think|process|research|analyze|run\s+a?\s*workflow|step)\b/.test(t);
    const wantsTool =
      !wantsTimeline &&
      (t.includes("todo") || t.includes("add")) &&
      input.tools?.some((tool) => tool.name === "add_todo");

    if (wantsTimeline) {
      // Generative UI demo: emit STATE_SNAPSHOT + STATE_DELTA events that
      // drive the timeline widget rendered via <PilotAgentStateView>.
      events.push(...timelineEvents(input.threadId));
    } else if (wantsTool) {
      // Emit a tool-call. The agUiRuntime will dispatch through the local
      // registry; on the next run, we see a `role: "tool"` message in
      // `messages[]` and acknowledge it (branch above).
      const toolCallId = `tc-${Date.now()}`;
      const messageId = `m-${Date.now()}`;
      const todoText = extractTodoText(text);
      events.push({
        type: "TOOL_CALL_START",
        toolCallId,
        toolCallName: "add_todo",
        parentMessageId: messageId,
      });
      events.push({
        type: "TOOL_CALL_ARGS",
        toolCallId,
        delta: JSON.stringify({ text: todoText }),
      });
      events.push({ type: "TOOL_CALL_END", toolCallId });
    } else {
      const messageId = `m-${Date.now()}`;
      events.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
      events.push({
        type: "TEXT_MESSAGE_CONTENT",
        messageId,
        delta: scriptedReply(text),
      });
      events.push({ type: "TEXT_MESSAGE_END", messageId });
    }
  } else {
    // No prior context: greet.
    const messageId = `m-${Date.now()}`;
    events.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
    events.push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: "Hi! I am the scripted demo agent. Ask me to add a todo.",
    });
    events.push({ type: "TEXT_MESSAGE_END", messageId });
  }

  events.push({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
  return events;
}

app.post("/api/agui", async (c) => {
  let input: AgUiRunInput;
  try {
    input = (await c.req.json()) as AgUiRunInput;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const events = scriptEvents(input);
  // Stream events as SSE so AG-UI's parseSSEStream consumes them naturally.
  // We yield a 30 ms beat between events so the streaming UI animates rather
  // than landing in one frame.
  return streamSSE(c, async (stream) => {
    // STATE events get a longer beat (350 ms) so the timeline animation
    // is humanly visible. Text message frames stay snappy at 30 ms.
    for (const event of events) {
      await stream.writeSSE({ data: JSON.stringify(event) });
      const isStateFrame =
        event.type === "STATE_SNAPSHOT" || event.type === "STATE_DELTA";
      await new Promise((r) => setTimeout(r, isStateFrame ? 350 : 30));
    }
  });
});

app.get("/api/health", (c) => c.json({ ok: true, model: MODEL, port: PORT }));

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  // biome-ignore lint/suspicious/noConsole: example server startup banner.
  console.log(`[example] hono listening on http://127.0.0.1:${port} (model: ${MODEL})`);
});
