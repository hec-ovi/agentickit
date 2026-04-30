/**
 * Unit tests for `lastAssistantMessageNeedsContinuation`. The function
 * decides whether the AI SDK should resubmit after a client-side mutation,
 * so a regression here would either stall conversations or drive an
 * infinite resubmit loop.
 *
 * The integration suite (`pilot-integration.test.tsx`) covers the same
 * function indirectly via fetch-count assertions on real `<Pilot>` runs;
 * these tests cover the predicate in isolation.
 */

import { describe, expect, it } from "vitest";
import { lastAssistantMessageNeedsContinuation } from "./local-runtime.js";

const user = (text: string) => ({
  role: "user",
  parts: [{ type: "text", text }],
});
const toolOut = (name = "add_todo") => ({
  type: "dynamic-tool",
  toolName: name,
  state: "output-available",
});
const textPart = (text = "ok") => ({ type: "text", text });
const stepStart = { type: "step-start" };

describe("lastAssistantMessageNeedsContinuation", () => {
  it("returns false for an empty message list", () => {
    expect(lastAssistantMessageNeedsContinuation([])).toBe(false);
  });

  it("returns false when the last message is from the user", () => {
    expect(lastAssistantMessageNeedsContinuation([user("hi")])).toBe(false);
  });

  it("returns true when the last assistant part is a completed tool output", () => {
    const messages = [
      user("add a todo"),
      { role: "assistant", parts: [stepStart, toolOut()] },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(true);
  });

  it("returns true even when step-start parts follow the tool output", () => {
    const messages = [
      user("add a todo"),
      { role: "assistant", parts: [stepStart, toolOut(), stepStart] },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(true);
  });

  it("returns false once the model has produced text after the tool outputs", () => {
    // Loop-prevention case: three completed tool calls followed by the
    // model's text reply. A naive "any completed tool output" check
    // resubmits forever.
    const messages = [
      user("add three todos: buy milk, call mom, pay rent"),
      {
        role: "assistant",
        parts: [
          stepStart,
          toolOut(),
          stepStart,
          toolOut(),
          stepStart,
          toolOut(),
          stepStart,
          textPart("Added all three."),
        ],
      },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(false);
  });

  it("returns false after a reasoning part (treated like text)", () => {
    const messages = [
      user("hi"),
      {
        role: "assistant",
        parts: [stepStart, toolOut(), stepStart, { type: "reasoning" }],
      },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(false);
  });

  it("returns true for output-error (the model should still observe the failure)", () => {
    const messages = [
      user("add todo"),
      {
        role: "assistant",
        parts: [
          stepStart,
          { type: "dynamic-tool", toolName: "add_todo", state: "output-error" },
        ],
      },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(true);
  });

  it("returns false for an in-flight streaming tool call (no output yet)", () => {
    const messages = [
      user("add"),
      {
        role: "assistant",
        parts: [
          stepStart,
          { type: "dynamic-tool", toolName: "add_todo", state: "input-streaming" },
        ],
      },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(false);
  });
});
