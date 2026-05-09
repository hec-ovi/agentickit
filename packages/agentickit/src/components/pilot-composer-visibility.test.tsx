/**
 * Tests for the `composer="full" | "suggestions" | "off"` prop on the
 * chat surfaces.
 *
 * Real RTL: render <PilotSidebar> mounted, then assert on actual rendered
 * DOM. No internal state probing. The contract under test is:
 *
 *   - "full" (default): textarea + send button + suggestion chips all
 *     visible. Clicking a chip fires a send.
 *   - "suggestions": no textarea, no send button, but chips render and
 *     clicking still sends a message via the chat context.
 *   - "off": no textarea, no send button, no chip row. The surface is
 *     purely observational.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pilot } from "./pilot-provider.js";
import { PilotSidebar } from "./pilot-sidebar.js";
import {
  installPilotFetchMock,
  textReplyTurn,
  type MockPilotFetchController,
} from "../test-utils/stream-mock.js";

let mock: MockPilotFetchController;

afterEach(() => {
  cleanup();
  mock?.restore();
});

const SUGGESTIONS = ["Plan a trip", "Pick a hotel", "What's the weather"];

describe("PilotSidebar composer prop", () => {
  describe("composer='full' (default)", () => {
    it("renders textarea + send button + suggestion chips", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} suggestions={SUGGESTIONS} />
        </Pilot>,
      );
      expect(screen.getByRole("textbox")).toBeTruthy();
      expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
      for (const text of SUGGESTIONS) {
        expect(screen.getByRole("button", { name: text })).toBeTruthy();
      }
    });

    it("typing + clicking send fires a chat request", async () => {
      mock = installPilotFetchMock();
      mock.push(textReplyTurn({ id: "r1", text: "ack" }));
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} />
        </Pilot>,
      );
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "hi" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
      await waitFor(() => {
        expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("composer='suggestions'", () => {
    it("hides textarea and send button but keeps suggestion chips", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar
            defaultOpen
            autoFocus={false}
            suggestions={SUGGESTIONS}
            composer="suggestions"
          />
        </Pilot>,
      );
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
      for (const text of SUGGESTIONS) {
        expect(screen.getByRole("button", { name: text })).toBeTruthy();
      }
    });

    it("clicking a suggestion chip still fires a chat request", async () => {
      mock = installPilotFetchMock();
      mock.push(textReplyTurn({ id: "r1", text: "ack" }));
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar
            defaultOpen
            autoFocus={false}
            suggestions={SUGGESTIONS}
            composer="suggestions"
          />
        </Pilot>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Plan a trip" }));
      await waitFor(() => {
        expect(mock.pilotPostCount()).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("composer='off'", () => {
    it("hides everything: no textarea, no send button, no chips", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar
            defaultOpen
            autoFocus={false}
            suggestions={SUGGESTIONS}
            composer="off"
          />
        </Pilot>,
      );
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
      for (const text of SUGGESTIONS) {
        expect(screen.queryByRole("button", { name: text })).toBeNull();
      }
    });
  });
});
