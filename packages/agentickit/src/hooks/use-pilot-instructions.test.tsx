/**
 * Tests for usePilotInstructions.
 *
 * Style follows the user's "test as if real interaction" rule: we mount
 * a real <Pilot> with a sidebar, register an instructions fragment from
 * a child component, type into the composer, click the send button, and
 * then assert the actual fetch body the runtime sent. No internal
 * registry probes; the contract under test is "fragments end up in
 * body.instructions on every send".
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotSidebar } from "../components/pilot-sidebar.js";
import {
  installPilotFetchMock,
  textReplyTurn,
  type MockPilotFetchController,
} from "../test-utils/stream-mock.js";
import { usePilotInstructions } from "./use-pilot-instructions.js";

let mock: MockPilotFetchController;

afterEach(() => {
  cleanup();
  mock?.restore();
});

function Page({ text }: { text: string }) {
  usePilotInstructions(text);
  return null;
}

function ToggleHarness() {
  const [showPage, setShowPage] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setShowPage((s) => !s)}>
        toggle
      </button>
      {showPage ? <Page text="On the booking page; double-confirm any destructive action." /> : null}
    </div>
  );
}

describe("usePilotInstructions", () => {
  it("ships the registered fragment on body.instructions when the user sends a message", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "reply", text: "ack" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <Page text="Always answer in fewer than 50 words." />
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
    });

    const sentBody = mock.calls[mock.calls.length - 1]?.body as { instructions?: string[] };
    expect(sentBody.instructions).toEqual(["Always answer in fewer than 50 words."]);
  });

  it("appends multiple fragments in registration order", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "reply", text: "ack" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <Page text="Fragment A." />
        <Page text="Fragment B." />
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
    });

    const sentBody = mock.calls[mock.calls.length - 1]?.body as { instructions?: string[] };
    expect(sentBody.instructions).toEqual(["Fragment A.", "Fragment B."]);
  });

  it("removes a fragment from the next request when the component unmounts", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "r1", text: "ack 1" }));
    mock.push(textReplyTurn({ id: "r2", text: "ack 2" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <ToggleHarness />
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Send #1 with the fragment present.
    fireEvent.change(textarea, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
    });
    const first = mock.calls[mock.calls.length - 1]?.body as { instructions?: string[] };
    expect(first.instructions).toEqual([
      "On the booking page; double-confirm any destructive action.",
    ]);

    // Toggle the page off: the fragment unregisters.
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));

    // Send #2 without the fragment. Textarea stays mounted across the toggle.
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(2);
    });
    const second = mock.calls[mock.calls.length - 1]?.body as { instructions?: string[] };
    // Either undefined (no fragments → field omitted) or empty array; both
    // are valid as long as the unregistered text is gone.
    expect(second.instructions ?? []).not.toContain(
      "On the booking page; double-confirm any destructive action.",
    );
  });

  it("ignores empty strings without registering anything", async () => {
    mock = installPilotFetchMock();
    mock.push(textReplyTurn({ id: "reply", text: "ack" }));

    render(
      <Pilot apiUrl="/api/pilot">
        <Page text="" />
        <PilotSidebar defaultOpen autoFocus={false} showSkillsPanel={false} />
      </Pilot>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
    });
    const sentBody = mock.calls[mock.calls.length - 1]?.body as { instructions?: string[] };
    // Empty fragments must not appear; the field is either omitted or empty.
    expect(sentBody.instructions ?? []).toEqual([]);
  });
});
