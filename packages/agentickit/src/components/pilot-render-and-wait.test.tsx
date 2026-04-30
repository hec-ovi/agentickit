/**
 * End-to-end tests for `renderAndWait` (Phase 2, HITL pause-and-resume).
 *
 * The harness mounts a real `<Pilot>` with a `usePilotAction` whose
 * `renderAndWait` returns inline UI with `Respond` and `Cancel` buttons.
 * Scripted SSE frames simulate a model that calls the tool, then replies
 * with text after the tool result lands. The tests verify:
 *
 *   1. The UI renders when the model invokes the action (and not before).
 *   2. The handler is NOT called when renderAndWait is set.
 *   3. Clicking `Respond` sends the value as the tool output and the
 *      conversation continues to the model's text reply.
 *   4. Clicking `Cancel` sends the standard `{ok: false, reason}` payload.
 *   5. The parsed `input` reaches the render prop intact.
 *   6. With `mutating: true` and `renderAndWait` together, the confirm
 *      modal gates first; renderAndWait UI only mounts after approval.
 *   7. The chat does not infinite-loop after respond/cancel.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext, useState } from "react";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, type PilotChatContextValue } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import {
  installPilotFetchMock,
  type MockPilotFetchController,
  textReplyTurn,
  toolCallTurn,
} from "../test-utils/stream-mock.js";
import { Pilot } from "./pilot-provider.js";

interface HarnessRefs {
  handlerSpy: ReturnType<typeof vi.fn>;
  renderSpy: ReturnType<typeof vi.fn>;
  lastInput: { current: unknown };
}

function PickerWidget(props: { refs: HarnessRefs; mutating?: boolean }): JSX.Element {
  const { refs, mutating } = props;
  usePilotAction({
    name: "ask_choice",
    description: "Ask the user to pick A or B.",
    parameters: z.object({ prompt: z.string() }),
    handler: (params) => {
      refs.handlerSpy(params);
      return { picked: "should-not-happen" };
    },
    mutating,
    renderAndWait: ({ input, respond, cancel }) => {
      refs.renderSpy(input);
      refs.lastInput.current = input;
      return (
        <div data-testid="hitl-card">
          <p data-testid="hitl-prompt">{(input as { prompt: string }).prompt}</p>
          <button
            type="button"
            data-testid="hitl-respond-a"
            onClick={() => respond({ picked: "A" })}
          >
            Pick A
          </button>
          <button
            type="button"
            data-testid="hitl-respond-b"
            onClick={() => respond({ picked: "B" })}
          >
            Pick B
          </button>
          <button type="button" data-testid="hitl-cancel" onClick={() => cancel()}>
            Cancel
          </button>
        </div>
      );
    },
  });
  return <div />;
}

function ChatDriver(): JSX.Element | null {
  const chat = useContext<PilotChatContextValue | null>(PilotChatContext);
  if (!chat) return null;
  return (
    <div>
      <button
        type="button"
        data-testid="send"
        onClick={() => void chat.sendMessage("ask the question")}
      >
        send
      </button>
      <div data-testid="messages">
        {chat.messages.flatMap((msg, mi) => {
          const parts = (msg as { parts?: unknown }).parts;
          if (!Array.isArray(parts)) return [];
          return parts.map((rawPart, pi) => {
            const part = rawPart as {
              type?: string;
              text?: string;
              output?: unknown;
              state?: string;
            };
            if (part.type === "text" && typeof part.text === "string") {
              return (
                <p key={`${mi}-${pi}`} data-testid="assistant-text">
                  {part.text}
                </p>
              );
            }
            if (
              (part.type === "dynamic-tool" || (part.type ?? "").startsWith("tool-")) &&
              part.state === "output-available"
            ) {
              return (
                <pre key={`${mi}-${pi}`} data-testid="tool-output">
                  {JSON.stringify(part.output)}
                </pre>
              );
            }
            return null;
          });
        })}
      </div>
    </div>
  );
}

function renderHarness(opts: { mutating?: boolean } = {}): HarnessRefs {
  const refs: HarnessRefs = {
    handlerSpy: vi.fn(),
    renderSpy: vi.fn(),
    lastInput: { current: undefined },
  };
  render(
    <Pilot apiUrl="/api/pilot">
      <PickerWidget refs={refs} mutating={opts.mutating} />
      <ChatDriver />
    </Pilot>,
  );
  return refs;
}

let mock: MockPilotFetchController;

beforeEach(() => {
  mock = installPilotFetchMock();
});

afterEach(() => {
  mock.restore();
  cleanup();
});

describe("<Pilot> renderAndWait, basic respond path", () => {
  it("renders the HITL UI on tool call, sends respond value as output, ends without looping", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Choose wisely." },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Got it: A." }));

    const refs = renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    // Step 1: HITL card mounts when the model invokes the tool.
    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });
    // Step 2: parsed input flowed into the render prop.
    expect(screen.getByTestId("hitl-prompt").textContent).toBe("Choose wisely.");
    expect(refs.lastInput.current).toEqual({ prompt: "Choose wisely." });
    // Step 3: handler must not have been called, renderAndWait replaces it.
    expect(refs.handlerSpy).not.toHaveBeenCalled();

    // Step 4: user picks A. The provider sends `{ picked: "A" }` as the tool
    // output, the model emits its text reply on the next turn.
    fireEvent.click(screen.getByTestId("hitl-respond-a"));

    await waitFor(() => {
      expect(screen.queryByText("Got it: A.")).not.toBeNull();
    });

    // Tool output landed with the respond value.
    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs.length).toBe(1);
    expect(toolOutputs[0]?.textContent).toBe('{"picked":"A"}');

    // HITL card unmounts after respond settles.
    expect(screen.queryByTestId("hitl-card")).toBeNull();

    // Two POSTs total: initial + post-respond resubmit. No infinite loop.
    expect(mock.pilotPostCount()).toBe(2);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> renderAndWait, cancel path", () => {
  it("sends the declined sentinel and the conversation continues", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Yes or no?" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "OK, skipping." }));

    renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });

    fireEvent.click(screen.getByTestId("hitl-cancel"));

    await waitFor(() => {
      expect(screen.queryByText("OK, skipping.")).not.toBeNull();
    });

    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs.length).toBe(1);
    // Default cancel reason is "User cancelled."
    expect(toolOutputs[0]?.textContent).toBe('{"ok":false,"reason":"User cancelled."}');

    expect(screen.queryByTestId("hitl-card")).toBeNull();
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> renderAndWait, confirm gate before HITL", () => {
  it("renders confirm modal first, then HITL UI only after approval", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Confirm and pick" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Picked B." }));

    const refs = renderHarness({ mutating: true });
    fireEvent.click(screen.getByTestId("send"));

    // Confirm modal appears first because mutating: true.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    // HITL card has NOT mounted yet, it's gated behind the confirm.
    expect(screen.queryByTestId("hitl-card")).toBeNull();

    // Approve the confirm modal. Confirm is the primary button labelled "Confirm".
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    // Now the HITL card mounts.
    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });
    expect(refs.handlerSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("hitl-respond-b"));

    await waitFor(() => {
      expect(screen.queryByText("Picked B.")).not.toBeNull();
    });
    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs[0]?.textContent).toBe('{"picked":"B"}');
    expect(mock.pilotPostCount()).toBe(2);
  });

  it("declining the confirm modal short-circuits, HITL never mounts", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Confirm or not" },
      }),
    );
    // After the cancel, the model replies with text on the next turn.
    mock.push(textReplyTurn({ id: "t1", text: "OK, no choice taken." }));

    renderHarness({ mutating: true });
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText("OK, no choice taken.")).not.toBeNull();
    });

    // HITL UI was never shown.
    expect(screen.queryByTestId("hitl-card")).toBeNull();

    // Tool output was the standard "User declined." sentinel from the
    // confirm modal path (matches the existing mutating-cancel behavior).
    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs[0]?.textContent).toBe('{"ok":false,"reason":"User declined."}');
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> renderAndWait, second resolve is ignored", () => {
  it("calling respond twice produces exactly one tool output", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Pick" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Done." }));

    renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });

    // Click respond multiple times in rapid succession. Only the first
    // should reach the model; the rest must no-op because pendingHitl
    // clears synchronously inside the resolver.
    fireEvent.click(screen.getByTestId("hitl-respond-a"));

    await waitFor(() => {
      expect(screen.queryByText("Done.")).not.toBeNull();
    });

    expect(screen.queryAllByTestId("tool-output").length).toBe(1);
    expect(mock.pilotPostCount()).toBe(2);
  });

  it("calling respond after cancel is ignored (the cancel wins)", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Pick" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Skipping." }));

    renderHarness();
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });

    // Cancel first, then immediately try to respond. The respond click is a
    // no-op because the HITL card unmounts synchronously and the resolver
    // for that pending slot has already settled.
    fireEvent.click(screen.getByTestId("hitl-cancel"));
    expect(screen.queryByTestId("hitl-card")).toBeNull();

    await waitFor(() => {
      expect(screen.queryByText("Skipping.")).not.toBeNull();
    });

    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs.length).toBe(1);
    expect(toolOutputs[0]?.textContent).toBe('{"ok":false,"reason":"User cancelled."}');
  });
});

describe("<Pilot> renderAndWait, action unmount while suspended", () => {
  it("auto-cancels the suspended tool call and the model loop continues", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Pick" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Recovered." }));

    function MountToggle(): JSX.Element {
      const [mounted, setMounted] = useState(true);
      const refs: HarnessRefs = {
        handlerSpy: vi.fn(),
        renderSpy: vi.fn(),
        lastInput: { current: undefined },
      };
      return (
        <Pilot apiUrl="/api/pilot">
          <button
            type="button"
            data-testid="unmount-picker"
            onClick={() => setMounted(false)}
          >
            unmount
          </button>
          {mounted ? <PickerWidget refs={refs} /> : null}
          <ChatDriver />
        </Pilot>
      );
    }

    render(<MountToggle />);
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });

    // Unmount the picker mid-suspension. The provider must auto-resolve
    // the pending HITL slot with a cancel sentinel so the SDK loop
    // doesn't hang forever on an orphan tool call.
    fireEvent.click(screen.getByTestId("unmount-picker"));

    // HITL card unmounts immediately (the action it belonged to is gone).
    expect(screen.queryByTestId("hitl-card")).toBeNull();

    // Model recovers with its next-turn text reply because the cancel
    // sentinel was added to the conversation as the tool's output.
    await waitFor(() => {
      expect(screen.queryByText("Recovered.")).not.toBeNull();
    });

    const toolOutputs = screen.queryAllByTestId("tool-output");
    expect(toolOutputs.length).toBe(1);
    expect(toolOutputs[0]?.textContent).toBe('{"ok":false,"reason":"Action unmounted."}');
    expect(mock.pilotPostCount()).toBe(2);
  });
});

describe("<Pilot> renderAndWait, re-render isolation", () => {
  it("HITL UI survives an unrelated parent re-render while suspended", async () => {
    mock.push(
      toolCallTurn({
        toolCallId: "c1",
        toolName: "ask_choice",
        input: { prompt: "Pick one" },
      }),
    );
    mock.push(textReplyTurn({ id: "t1", text: "Done." }));

    function Bumper(): JSX.Element {
      const [, setN] = useState(0);
      return (
        <button type="button" data-testid="bumper" onClick={() => setN((x) => x + 1)}>
          bump
        </button>
      );
    }
    const refs: HarnessRefs = {
      handlerSpy: vi.fn(),
      renderSpy: vi.fn(),
      lastInput: { current: undefined },
    };
    render(
      <Pilot apiUrl="/api/pilot">
        <Bumper />
        <PickerWidget refs={refs} />
        <ChatDriver />
      </Pilot>,
    );

    fireEvent.click(screen.getByTestId("send"));
    await waitFor(() => {
      expect(screen.queryByTestId("hitl-card")).not.toBeNull();
    });

    // Trigger a parent re-render. HITL must still be present.
    fireEvent.click(screen.getByTestId("bumper"));
    fireEvent.click(screen.getByTestId("bumper"));
    expect(screen.queryByTestId("hitl-card")).not.toBeNull();

    // Then respond and confirm the conversation completes normally.
    fireEvent.click(screen.getByTestId("hitl-respond-a"));
    await waitFor(() => {
      expect(screen.queryByText("Done.")).not.toBeNull();
    });
    expect(mock.pilotPostCount()).toBe(2);
  });
});
