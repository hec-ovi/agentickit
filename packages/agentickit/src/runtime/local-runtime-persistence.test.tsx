/**
 * Tests for the `initialMessages` + `onMessagesChange` options on
 * `localRuntime`. The contract these tests lock down:
 *
 *   1. `initialMessages` seeds the chat on mount; the user sees the seeded
 *      messages immediately without sending anything.
 *   2. `onMessagesChange` fires when the chat's messages array changes
 *      (a user send, a tool result, etc.).
 *   3. A consumer can wire the two together to round-trip per-thread
 *      history across runtime swaps. The harness here simulates that
 *      pattern: a parent component holds a `Map<channelId, messages[]>`,
 *      seeds the runtime from it, writes back, swaps channels, and
 *      asserts that the prior thread's messages reappear when the
 *      original channel comes back.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotSidebar } from "../components/pilot-sidebar.js";
import {
  installPilotFetchMock,
  textReplyTurn,
  type MockPilotFetchController,
} from "../test-utils/stream-mock.js";
import { localRuntime } from "./local-runtime.js";

let mock: MockPilotFetchController;

afterEach(() => {
  cleanup();
  mock?.restore();
});

interface ChannelHarnessProps {
  channels: ReadonlyArray<string>;
}

/**
 * Minimal multi-channel harness: a parent holds a per-channel message map,
 * lets the user pick which channel is active, and constructs a runtime
 * seeded with that channel's history. Mirrors what a real consumer would
 * do for per-agent persistence in `<PilotAgentRegistry>`.
 */
function ChannelHarness({ channels }: ChannelHarnessProps) {
  const [active, setActive] = useState(channels[0] ?? "default");
  const storeRef = useRef<Map<string, ReadonlyArray<unknown>>>(new Map());

  const handleMessagesChange = useCallback(
    (messages: ReadonlyArray<unknown>) => {
      storeRef.current.set(active, messages);
    },
    [active],
  );

  const initial = storeRef.current.get(active) ?? [];

  const runtime = useMemo(
    () =>
      localRuntime({
        apiUrl: "/api/pilot",
        initialMessages: initial,
        onMessagesChange: handleMessagesChange,
      }),
    // initial is the captured seed for THIS runtime instance; we
    // intentionally re-create the runtime when active changes so the
    // new chat picks up the new initial messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  );

  return (
    <Pilot apiUrl="/api/pilot" runtime={runtime}>
      <div>
        {channels.map((c) => (
          <button key={c} type="button" onClick={() => setActive(c)}>
            select {c}
          </button>
        ))}
        <span data-testid="active-channel">{active}</span>
      </div>
      <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
    </Pilot>
  );
}

describe("localRuntime persistence options", () => {
  it("forwards onMessagesChange when the user sends a message", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "r1", text: "hi back" }));

    const seen: ReadonlyArray<unknown>[] = [];
    const runtime = localRuntime({
      apiUrl: "/api/pilot",
      onMessagesChange: (messages) => {
        seen.push(messages);
      },
    });

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      // At minimum: an initial empty snapshot, then the user message,
      // then optionally the assistant's. The exact count depends on
      // streaming chunks, but it must grow.
      expect(seen.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("seeds useChat from initialMessages on mount", () => {
    mock = installPilotFetchMock();
    const seedMessages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello from yesterday" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "hello from yesterday too" }],
      },
    ];

    const runtime = localRuntime({
      apiUrl: "/api/pilot",
      initialMessages: seedMessages,
    });

    render(
      <Pilot apiUrl="/api/pilot" runtime={runtime}>
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    expect(screen.getByText("hello from yesterday")).toBeTruthy();
    expect(screen.getByText("hello from yesterday too")).toBeTruthy();
  });

  it("preserves per-channel history across channel switches", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "r1", text: "ack one" }));
    mock.push(textReplyTurn({ id: "r2", text: "ack two" }));
    mock.push(textReplyTurn({ id: "r3", text: "ack three" }));

    render(<ChannelHarness channels={["A", "B"]} />);

    expect(screen.getByTestId("active-channel").textContent).toBe("A");

    // Send "msg-on-A" while on channel A.
    const taA = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(taA, { target: { value: "msg-on-A" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.getByText("msg-on-A")).toBeTruthy();
    });

    // Switch to channel B; A's message should disappear from the view.
    fireEvent.click(screen.getByRole("button", { name: "select B" }));
    expect(screen.getByTestId("active-channel").textContent).toBe("B");
    await waitFor(() => {
      expect(screen.queryByText("msg-on-A")).toBeNull();
    });

    // Send "msg-on-B" while on channel B.
    const taB = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(taB, { target: { value: "msg-on-B" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.getByText("msg-on-B")).toBeTruthy();
    });

    // Switch back to channel A; A's prior message must reappear, B's gone.
    fireEvent.click(screen.getByRole("button", { name: "select A" }));
    await waitFor(() => {
      expect(screen.getByText("msg-on-A")).toBeTruthy();
      expect(screen.queryByText("msg-on-B")).toBeNull();
    });
  });
});
