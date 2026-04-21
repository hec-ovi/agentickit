/**
 * Message-list rendering for `<PilotSidebar>`.
 *
 * The primary input is the AI SDK 6 `UIMessage[]` the provider exposes on
 * `PilotChatContextValue.messages`. We keep message rendering isolated from
 * the outer chrome so the scroll container, streaming indicator, and empty
 * state can evolve independently of each part-renderer.
 *
 * Design notes:
 *
 *   - We walk `message.parts` in order so an assistant turn that mixes
 *     `text → tool-call → text` reads naturally instead of being grouped by
 *     part type. This matches how users expect streaming to look — the tool
 *     invocation sits inline where the model emitted it.
 *
 *   - Tool parts are rendered as a collapsible `<details>` chip. The state
 *     pill is computed from the AI SDK's granular states (`input-streaming`,
 *     `input-available`, `output-available`, `output-error`, …) collapsed
 *     into a human-friendly label.
 *
 *   - Reasoning parts are muted and collapsed by default. They're mostly for
 *     provider models that stream a chain-of-thought (o1, reasoning tokens).
 *
 *   - Autoscroll: we stick to the bottom only when the user is already near
 *     the bottom. Scrolling up cancels autoscroll until the user returns —
 *     this mirrors how assistant-ui, ChatGPT, Claude and Linear handle it.
 */

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PilotMarkdown } from "./pilot-markdown.js";

/**
 * Narrow structural shape of an AI SDK 6 `UIMessage`. We deliberately keep
 * this internal — the public context still exposes `ReadonlyArray<unknown>`
 * so consumers aren't forced to import AI SDK types, but the renderer needs
 * concrete field access.
 */
interface RenderableMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: ReadonlyArray<RenderablePart>;
}

type RenderablePart =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "reasoning"; text: string; state?: "streaming" | "done" }
  | { type: "step-start" }
  | {
      type: `tool-${string}` | "dynamic-tool";
      toolCallId: string;
      toolName?: string;
      state:
        | "input-streaming"
        | "input-available"
        | "approval-requested"
        | "approval-responded"
        | "output-available"
        | "output-error"
        | "output-denied";
      input?: unknown;
      output?: unknown;
      errorText?: string;
    }
  | { type: string; [key: string]: unknown };

/**
 * Coerce an unknown message value from the context into the shape the
 * renderer expects. Returns `null` when the value doesn't look like a
 * `UIMessage` — defensive because `PilotChatContextValue.messages` is
 * intentionally typed as `ReadonlyArray<unknown>`.
 */
function asRenderableMessage(raw: unknown): RenderableMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : null;
  const role = obj.role;
  const parts = obj.parts;
  if (!id) return null;
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  if (!Array.isArray(parts)) return null;
  return { id, role, parts: parts as ReadonlyArray<RenderablePart> };
}

export interface PilotMessageListProps {
  /** Raw messages from `PilotChatContextValue.messages`. */
  messages: ReadonlyArray<unknown>;
  /** True while the assistant is producing a response — shows a typing dot. */
  isLoading: boolean;
  /** Rendered above the list when there are no messages yet. */
  emptyState: ReactNode;
}

/**
 * Scrollable message list with sticky-to-bottom autoscroll behavior.
 * Exposes no imperative handle — the component is self-contained.
 */
export function PilotMessageList(props: PilotMessageListProps): ReactNode {
  const { messages, isLoading, emptyState } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user is "pinned" to the bottom. We only autoscroll on
  // new content while this is true; if they scroll up, we respect it.
  const stickToBottomRef = useRef(true);

  // Update the pinned flag on every scroll. A small threshold accommodates
  // sub-pixel rounding (observed on Chrome macOS + zoom != 100%).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = (): void => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 32;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Scroll after each render when the user is pinned. `useLayoutEffect` so the
  // jump happens before paint — avoids the visible "catch-up" flash.
  // `messages.length` alone isn't enough: streaming mutates the tail part's
  // text in place, so we also depend on the total serialized length.
  const totalContentSize = summarizeSize(messages);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Reference the content-size fingerprint so the linter sees it as a real
    // dependency; the effect should re-run whenever streaming appends text
    // to the tail message even though the body doesn't otherwise use it.
    void totalContentSize;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [totalContentSize]);

  const hasMessages = messages.length > 0;

  return (
    <div className="pilot-messages" ref={scrollRef} data-testid="pilot-messages">
      {!hasMessages ? (
        <div className="pilot-empty" role="note">
          {emptyState}
        </div>
      ) : (
        <>
          {messages.map((raw, index) => {
            const msg = asRenderableMessage(raw);
            if (!msg) return null;
            const isLastAssistant =
              msg.role === "assistant" && index === messages.length - 1 && isLoading;
            return (
              <PilotMessageItem
                key={msg.id}
                message={msg}
                showStreamingIndicator={isLastAssistant}
              />
            );
          })}
          {/* When the assistant is still "submitted" (no assistant message has
              been appended yet) we still want a visible beat so the sidebar
              doesn't look frozen. */}
          {isLoading && !hasAssistantTail(messages) ? (
            <div className="pilot-message" data-role="assistant">
              <div className="pilot-assistant-body">
                <StreamingDots />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** True if the final message is an assistant message (so we can skip the standalone spinner). */
function hasAssistantTail(messages: ReadonlyArray<unknown>): boolean {
  const last = messages[messages.length - 1];
  const msg = asRenderableMessage(last);
  return msg?.role === "assistant";
}

/**
 * Produce a cheap, comparable fingerprint of the messages array so
 * `useLayoutEffect` can autoscroll on streaming updates (which mutate the
 * tail text without adding a new message). Using a full deep equality would
 * dominate render cost on long chats.
 */
function summarizeSize(messages: ReadonlyArray<unknown>): string {
  let out = `${messages.length}`;
  const last = messages[messages.length - 1];
  const msg = asRenderableMessage(last);
  if (!msg) return out;
  for (const part of msg.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      const text = (part as { text?: string }).text ?? "";
      out += `|${part.type}:${text.length}`;
    } else if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      const state = (part as { state?: string }).state ?? "";
      out += `|tool:${state}`;
    }
  }
  return out;
}

interface PilotMessageItemProps {
  message: RenderableMessage;
  showStreamingIndicator: boolean;
}

function PilotMessageItem(props: PilotMessageItemProps): ReactNode {
  const { message, showStreamingIndicator } = props;

  if (message.role === "user") {
    const text = extractText(message.parts);
    // Empty user message would be a stray tool result that somehow got the
    // `user` role; render nothing rather than an empty bubble.
    if (!text) return null;
    return (
      <div className="pilot-message" data-role="user">
        <div className="pilot-user-bubble">{text}</div>
      </div>
    );
  }

  // Assistant (or system, rendered the same way for simplicity).
  return (
    <div className="pilot-message" data-role="assistant">
      <div className="pilot-assistant-body">
        {message.parts.map((part, index) => (
          <PilotPart
            // Tool parts carry a stable `toolCallId`; text/reasoning parts don't,
            // but their ordering within a message is stable so index is safe.
            key={partKey(part, index)}
            part={part}
            index={index}
          />
        ))}
        {showStreamingIndicator ? <StreamingDots /> : null}
      </div>
    </div>
  );
}

function partKey(part: RenderablePart, index: number): string {
  if ("toolCallId" in part && typeof part.toolCallId === "string") {
    return part.toolCallId;
  }
  return `${part.type}-${index}`;
}

function extractText(parts: ReadonlyArray<RenderablePart>): string {
  let out = "";
  for (const part of parts) {
    if (part.type === "text" && typeof (part as { text?: string }).text === "string") {
      out += (part as { text: string }).text;
    }
  }
  return out;
}

function PilotPart(props: { part: RenderablePart; index: number }): ReactNode {
  const { part, index } = props;

  // Per-part staggered fade — 50ms offset, capped at 250ms so a long
  // tool-heavy turn doesn't delay the final text noticeably. The stagger is
  // applied via inline style so the shared keyframe can stay in CSS.
  const stagger = Math.min(index * 50, 250);
  const partStyle = stagger > 0 ? { animationDelay: `${stagger}ms` } : undefined;

  if (part.type === "text") {
    const text = (part as { text?: string }).text ?? "";
    if (!text) return null;
    // Assistant text is parsed as markdown — user messages render as plain
    // text inside `pilot-user-bubble` a few lines up, so this branch only
    // fires for assistant/system output where markdown is intended.
    return (
      <div className="pilot-part-text pilot-part-enter" style={partStyle}>
        <PilotMarkdown text={text} />
      </div>
    );
  }

  if (part.type === "reasoning") {
    const text = (part as { text?: string }).text ?? "";
    const state = (part as { state?: string }).state;
    return (
      <details className="pilot-reasoning pilot-part-enter" style={partStyle}>
        <summary>{state === "streaming" ? "Thinking..." : "Thought"}</summary>
        <div className="pilot-reasoning-body">{text}</div>
      </details>
    );
  }

  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    return <PilotToolPart part={part as ToolPart} stagger={stagger} />;
  }

  // step-start, file, source-*, data-* — unrendered in v0.1. We return null
  // instead of failing so forward-compatibility with newer SDK parts is safe.
  return null;
}

interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function PilotToolPart(props: { part: ToolPart; stagger: number }): ReactNode {
  const { part, stagger } = props;
  const name =
    part.toolName ?? (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "tool");
  const label = describeToolState(part.state);
  const style = stagger > 0 ? { animationDelay: `${stagger}ms` } : undefined;

  return (
    <details
      className="pilot-tool pilot-part-enter"
      data-tool-name={name}
      data-tool-state={part.state}
      style={style}
    >
      <summary>
        <span className="pilot-tool-name">{name}</span>
        <span className="pilot-tool-status" data-state={label.category}>
          {label.text}
        </span>
      </summary>
      <div className="pilot-tool-body">
        {part.input !== undefined ? (
          <>
            <span className="pilot-tool-section-label">Arguments</span>
            <pre className="pilot-tool-code">{formatValue(part.input)}</pre>
          </>
        ) : null}
        {part.state === "output-available" ? (
          <>
            <span className="pilot-tool-section-label">Result</span>
            <pre className="pilot-tool-code">{formatValue(part.output)}</pre>
          </>
        ) : null}
        {part.state === "output-error" && part.errorText ? (
          <>
            <span className="pilot-tool-section-label">Error</span>
            <pre className="pilot-tool-code">{part.errorText}</pre>
          </>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Collapse the AI SDK's fine-grained tool lifecycle states into three
 * display buckets that consumers actually care about: idle, running, error.
 */
function describeToolState(state: ToolPart["state"]): {
  text: string;
  category: "idle" | "running" | "error";
} {
  switch (state) {
    case "input-streaming":
      return { text: "preparing", category: "running" };
    case "input-available":
      return { text: "running", category: "running" };
    case "approval-requested":
    case "approval-responded":
      return { text: "awaiting approval", category: "running" };
    case "output-available":
      return { text: "done", category: "idle" };
    case "output-error":
      return { text: "error", category: "error" };
    case "output-denied":
      return { text: "denied", category: "error" };
    default:
      return { text: "pending", category: "idle" };
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Three-dot typing indicator. Purely presentational. */
function StreamingDots(): ReactNode {
  return (
    <output className="pilot-streaming-dots" aria-label="Assistant is typing">
      <span />
      <span />
      <span />
    </output>
  );
}
