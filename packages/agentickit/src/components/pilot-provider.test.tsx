/**
 * Tests for `<Pilot>`. Covers basic rendering and context wiring. We
 * deliberately avoid triggering any `sendMessage` calls so the tests don't
 * reach out to the fake `/api/pilot` endpoint.
 */

import { cleanup, render } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PilotChatContext, PilotRegistryContext } from "../context.js";
import { Pilot, lastAssistantMessageNeedsContinuation } from "./pilot-provider.js";

afterEach(() => {
  cleanup();
});

describe("<Pilot>", () => {
  it("renders children", () => {
    const { getByText } = render(
      <Pilot apiUrl="/api/test">
        <div>hello</div>
      </Pilot>,
    );
    expect(getByText("hello")).toBeDefined();
  });

  it("provides both contexts to descendants", () => {
    let reg: React.ContextType<typeof PilotRegistryContext> = null;
    let chat: React.ContextType<typeof PilotChatContext> = null;

    function Spy() {
      reg = useContext(PilotRegistryContext);
      chat = useContext(PilotChatContext);
      return null;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
      </Pilot>,
    );

    expect(reg).not.toBeNull();
    expect(chat).not.toBeNull();
    expect(chat?.status).toBe("ready");
    expect(chat?.isLoading).toBe(false);
    expect(Array.isArray(chat?.messages)).toBe(true);
  });
});

describe("lastAssistantMessageNeedsContinuation", () => {
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

  it("returns false for empty message list", () => {
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
    // A new step can begin before the model's text lands.
    const messages = [
      user("add a todo"),
      { role: "assistant", parts: [stepStart, toolOut(), stepStart] },
    ];
    expect(lastAssistantMessageNeedsContinuation(messages)).toBe(true);
  });

  it("returns false once the model has produced text after the tool outputs", () => {
    // This is the loop-prevention case: three completed tool calls followed
    // by the model's text reply. A prior implementation kept resubmitting
    // forever because it only checked "does ANY part have output-available".
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
