/**
 * Tiny Hono server for the example.
 *
 * Two endpoints:
 *   POST /api/pilot        → createPilotHandler (the copilot stream)
 *   GET  /api/pilot-log    → SSE of structured log events for the live log panel
 *
 * The Vite dev server proxies /api/* to this process (see vite.config.ts).
 * Run with:  tsx watch --env-file=.env.local server/index.ts
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createPilotHandler, type PilotLogEvent } from "agentickit/server";

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

app.get("/api/health", (c) => c.json({ ok: true, model: MODEL, port: PORT }));

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  // biome-ignore lint/suspicious/noConsole: example server startup banner.
  console.log(`[example] hono listening on http://127.0.0.1:${port} (model: ${MODEL})`);
});
