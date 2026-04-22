import { useEffect, useMemo, useRef, useState } from "react";
import type { PilotLogEvent } from "@hec-ovi/agentickit/server";

/**
 * Live transcript of every structured log event coming from the server.
 *
 * Subscribes to /api/pilot-log via EventSource. The server keeps a ring
 * buffer, so reconnects land on recent history automatically. All rendering
 * is read-only — the panel never mutates the stream.
 */
export function LogPanel() {
  const [events, setEvents] = useState<ReadonlyArray<PilotLogEvent>>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource("/api/pilot-log");
    source.addEventListener("log", (msg) => {
      try {
        const event = JSON.parse(msg.data) as PilotLogEvent;
        setEvents((prev) => {
          // Cap the UI buffer; the server already caps its own at 500.
          const next = [...prev, event];
          if (next.length > 500) next.splice(0, next.length - 500);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    // Keep the tail in view. If the user scrolled up we leave them alone.
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, []);

  const grouped = useMemo(() => events, [events]);

  return (
    <div className="panel">
      <div className="row space-between">
        <h2>Live log</h2>
        <span className="badge">
          {connected ? "connected" : "reconnecting…"} · {events.length} events
        </span>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        Every line the server writes lands here. Tool calls, token usage, finish
        reasons, errors. No credits burn silently.
      </p>
      <div ref={listRef} className="log-panel">
        {grouped.length === 0 ? (
          <p className="empty">No events yet. Send a message in the sidebar.</p>
        ) : (
          grouped.map((event, i) => <LogEntry key={`${event.ts}-${i}`} event={event} />)
        )}
      </div>
    </div>
  );
}

function LogEntry({ event }: { event: PilotLogEvent }) {
  const time = event.ts.slice(11, 19);
  const isToolCall = event.kind === "out" && event.meta?.toolName !== undefined;
  return (
    <>
      <div className={`log-entry ${isToolCall ? "tool" : ""}`} data-kind={event.kind}>
        <span className="ts">{time}</span>
        <span className="req">{event.requestId.slice(0, 5)}</span>
        <span>
          <KindSymbol kind={event.kind} /> {event.message}
        </span>
      </div>
      {event.meta?.toolInput !== undefined ? (
        <div className="log-meta">args: {safeStringify(event.meta.toolInput)}</div>
      ) : null}
      {event.meta?.usage ? (
        <div className="log-meta">
          usage: in={event.meta.usage.inputTokens ?? "?"} · out=
          {event.meta.usage.outputTokens ?? "?"} · total=
          {event.meta.usage.totalTokens ?? "?"}
        </div>
      ) : null}
    </>
  );
}

function KindSymbol({ kind }: { kind: PilotLogEvent["kind"] }) {
  const map: Record<PilotLogEvent["kind"], string> = {
    in: "→",
    out: "←",
    step: "·",
    done: "✓",
    err: "✗",
    info: "i",
  };
  return <span>{map[kind]}</span>;
}

function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 280 ? `${s.slice(0, 279)}…` : s;
  } catch {
    return String(value);
  }
}
