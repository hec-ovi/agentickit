/**
 * AG-UI ↔ AI SDK 6 bridge for the example's specialist endpoints.
 *
 * Each specialist receives a `RunAgentInput` (AG-UI shape: threadId,
 * runId, messages, tools) and needs to emit AG-UI SSE events back. We
 * call `streamText` with a real model + a filtered tool subset and
 * translate AI SDK's `fullStream` events into AG-UI events.
 *
 * The result: each specialist is a real LLM with its own personality
 * and a curated tool subset, instead of a hardcoded scripted tape.
 */

import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  dynamicTool,
  generateId,
  streamText,
  type LanguageModel,
  type ToolSet,
} from "ai";
import { z } from "zod";

interface AgUiToolDecl {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface AgUiMessageContentPart {
  type: string;
  text?: string;
}

interface AgUiMessage {
  role: "user" | "assistant" | "tool" | "system";
  content?: string | AgUiMessageContentPart[];
  toolCallId?: string;
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  name?: string;
}

interface RunAgentInput {
  threadId: string;
  runId: string;
  messages: AgUiMessage[];
  tools?: AgUiToolDecl[];
}

export interface SpecialistConfig {
  /** LanguageModel from `@ai-sdk/openai` (or another adapter). */
  model: LanguageModel;
  /** Domain-scoped system prompt. */
  system: string;
  /**
   * Names of client-declared tools this specialist is allowed to call.
   * The full tool list arrives from the client on every request; we filter
   * down to the subset relevant to this specialist's role.
   */
  allowTools: ReadonlyArray<string>;
  /** Optional providerOptions forwarded to streamText (e.g., vLLM store=false).
   *  Typed loosely here because AI SDK's SharedV3ProviderOptions isn't
   *  in the public type surface; the streamText call below validates. */
  providerOptions?: Record<string, Record<string, unknown>>;
}

function extractText(part: AgUiMessage["content"]): string {
  if (!part) return "";
  if (typeof part === "string") return part;
  return part
    .filter((p): p is AgUiMessageContentPart & { text: string } =>
      p?.type === "text" && typeof p.text === "string",
    )
    .map((p) => p.text)
    .join("");
}

/**
 * Convert AG-UI messages to AI SDK ModelMessage shape. Best-effort:
 * tool messages map to "tool" role with their content as the result.
 */
function agUiMessagesToModelMessages(
  messages: ReadonlyArray<AgUiMessage>,
): Array<{ role: "user" | "assistant" | "system" | "tool"; content: unknown }> {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: msg.toolCallId ?? "unknown",
            toolName: msg.name ?? "unknown",
            output: { type: "json", value: tryParse(msg.content) },
          },
        ],
      };
    }
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant" as const,
        content: [
          ...(extractText(msg.content)
            ? [{ type: "text" as const, text: extractText(msg.content) }]
            : []),
          ...msg.toolCalls.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: tryParse(tc.function.arguments),
          })),
        ],
      };
    }
    return {
      role: msg.role as "user" | "assistant" | "system",
      content: extractText(msg.content),
    };
  });
}

function tryParse(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Build an AI SDK ToolSet from the client-declared tools, filtered to
 * the subset this specialist is allowed to call.
 */
function buildToolSet(
  declared: ReadonlyArray<AgUiToolDecl> | undefined,
  allow: ReadonlyArray<string>,
): ToolSet | undefined {
  if (!declared || declared.length === 0) return undefined;
  const allowSet = new Set(allow);
  const out: ToolSet = {};
  for (const tool of declared) {
    if (!allowSet.has(tool.name)) continue;
    out[tool.name] = dynamicTool({
      description: tool.description ?? "",
      inputSchema: (tool.parameters ?? { type: "object" }) as never,
      // Tool execution happens client-side via the agentickit registry;
      // we only ever surface the call from streamText. The execute fn
      // here is therefore unreachable in normal flow, but the AI SDK
      // type requires it. Throw if it is somehow invoked server-side.
      execute: async () => {
        throw new Error("Specialist tools execute on the client; server execute should never run.");
      },
    });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Run a specialist turn. Reads the AG-UI input, calls streamText with a
 * filtered tool subset, and emits AG-UI SSE events back to the client.
 */
export async function runSpecialistTurn(
  c: Context,
  config: SpecialistConfig,
): Promise<Response> {
  let input: RunAgentInput;
  try {
    input = (await c.req.json()) as RunAgentInput;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const tools = buildToolSet(input.tools, config.allowTools);
  const messages = agUiMessagesToModelMessages(input.messages);

  return streamSSE(c, async (stream) => {
    const writeEvent = async (event: Record<string, unknown>) => {
      await stream.writeSSE({ data: JSON.stringify(event) });
    };

    await writeEvent({
      type: "RUN_STARTED",
      threadId: input.threadId,
      runId: input.runId,
    });

    let textMessageId: string | null = null;
    const openToolCalls = new Set<string>();

    try {
      const result = streamText({
        model: config.model,
        system: config.system,
        // The tool messages above have `output` shaped for AI SDK v5+.
        // Cast is necessary because AG-UI / AI SDK types diverge slightly.
        messages: messages as never,
        ...(tools ? { tools } : {}),
        // providerOptions intentionally cast through `unknown` because the
        // public AI SDK type (`SharedV3ProviderOptions`) is a JSON-only
        // shape and our looser local typing here is opt-in.
        ...(config.providerOptions
          ? { providerOptions: config.providerOptions as unknown as Record<string, never> }
          : {}),
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-start": {
            textMessageId = generateId();
            await writeEvent({
              type: "TEXT_MESSAGE_START",
              messageId: textMessageId,
              role: "assistant",
            });
            break;
          }
          case "text-delta": {
            if (!textMessageId) {
              textMessageId = generateId();
              await writeEvent({
                type: "TEXT_MESSAGE_START",
                messageId: textMessageId,
                role: "assistant",
              });
            }
            await writeEvent({
              type: "TEXT_MESSAGE_CONTENT",
              messageId: textMessageId,
              delta: part.text,
            });
            break;
          }
          case "text-end": {
            if (textMessageId) {
              await writeEvent({ type: "TEXT_MESSAGE_END", messageId: textMessageId });
              textMessageId = null;
            }
            break;
          }
          case "tool-input-start": {
            // streamText emits this when it begins streaming arguments
            // for a tool call. Translate to TOOL_CALL_START.
            openToolCalls.add(part.id);
            await writeEvent({
              type: "TOOL_CALL_START",
              toolCallId: part.id,
              toolCallName: part.toolName,
              parentMessageId: textMessageId ?? generateId(),
            });
            break;
          }
          case "tool-input-delta": {
            await writeEvent({
              type: "TOOL_CALL_ARGS",
              toolCallId: part.id,
              delta: part.delta,
            });
            break;
          }
          case "tool-input-end": {
            if (openToolCalls.has(part.id)) {
              openToolCalls.delete(part.id);
              await writeEvent({ type: "TOOL_CALL_END", toolCallId: part.id });
            }
            break;
          }
          case "tool-call": {
            // Some providers emit tool-call without the streaming
            // start/delta/end trio. Emit a synthetic START + ARGS + END
            // so the client sees a complete tool call.
            if (!openToolCalls.has(part.toolCallId)) {
              await writeEvent({
                type: "TOOL_CALL_START",
                toolCallId: part.toolCallId,
                toolCallName: part.toolName,
                parentMessageId: textMessageId ?? generateId(),
              });
              await writeEvent({
                type: "TOOL_CALL_ARGS",
                toolCallId: part.toolCallId,
                delta: JSON.stringify(part.input),
              });
              await writeEvent({ type: "TOOL_CALL_END", toolCallId: part.toolCallId });
            }
            break;
          }
          case "error": {
            // Surface the error to the client. AG-UI doesn't have a
            // first-class ERROR event, so we emit a text message with
            // the error string so the user sees something.
            const errId = generateId();
            await writeEvent({ type: "TEXT_MESSAGE_START", messageId: errId, role: "assistant" });
            await writeEvent({
              type: "TEXT_MESSAGE_CONTENT",
              messageId: errId,
              delta: `(specialist error) ${String(part.error)}`,
            });
            await writeEvent({ type: "TEXT_MESSAGE_END", messageId: errId });
            break;
          }
          default:
            // text-end was handled, finish/finish-step handled by RUN_FINISHED;
            // ignore other shape variants.
            break;
        }
      }
    } finally {
      // Make sure any open text or tool slot closes cleanly.
      if (textMessageId) {
        await writeEvent({ type: "TEXT_MESSAGE_END", messageId: textMessageId });
      }
      for (const id of openToolCalls) {
        await writeEvent({ type: "TOOL_CALL_END", toolCallId: id });
      }
      await writeEvent({
        type: "RUN_FINISHED",
        threadId: input.threadId,
        runId: input.runId,
      });
    }
  });
}

// Re-export z so the host doesn't need to import zod separately when
// declaring per-specialist parameter schemas (currently unused but a
// nice convenience for future tools added to the bridge).
export { z };
