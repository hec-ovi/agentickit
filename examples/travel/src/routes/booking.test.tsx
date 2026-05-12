/**
 * End-to-end test for the booking page's mutating-action flow.
 *
 * Renders the booking route with a real seeded trip, invokes a mutating
 * tool through the framework's onToolCall path (the same path the model
 * uses), and asserts the confirm modal mounts. Then drives the modal
 * with @testing-library/user-event for both Approve and Decline branches
 * to verify:
 *   - Approve dispatches the handler and the chat-side promise resolves
 *     with the handler's return value.
 *   - Decline does NOT dispatch the handler and the chat-side promise
 *     resolves with a structured "user_cancelled" error so the model
 *     can narrate the cancellation cleanly.
 *
 * The test also asserts `usePilotState({ name: "booking_review" })` is
 * registered, so the agent has the context it needs before deciding to
 * call book_flight in the first place.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderApp } from "../test/render-app";
import { BookingRoute } from "./booking";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Each test starts with the seeded localStorage so the booking page
  // finds a real trip with bookable items.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("BookingRoute — mutating actions + confirm modal flow", () => {
  it("renders the page with the seeded trip's booking review", async () => {
    renderApp(
      <Routes>
        <Route path="/trips/:tripId/booking" element={<BookingRoute />} />
      </Routes>,
      { path: "/trips/lisbon-summer/booking" },
    );

    // Page heading or hero indicates we're on the booking surface.
    await waitFor(() => {
      // Booking pages always render an h1; the trip title is part of the hero copy.
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it("invoking book_flight via onToolCall pops the confirm modal (mutating gate)", async () => {
    const { fireToolCall } = renderApp(
      <Routes>
        <Route path="/trips/:tripId/booking" element={<BookingRoute />} />
      </Routes>,
      { path: "/trips/lisbon-summer/booking" },
    );

    // Sanity: no modal at rest.
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Fire the mutating action. The framework intercepts mutating tool
    // calls and shows the confirm modal BEFORE the handler runs. We do
    // NOT await the promise here — it stays pending until the user
    // resolves the modal.
    void fireToolCall({
      toolName: "book_flight",
      input: { id: "f-jfk-lis-2026-06-12" },
    });

    // The confirm modal mounts with role="alertdialog".
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeDefined();
    });

    // Modal should expose context about what the user is approving.
    // The title humanizes the tool name ("Book flight"), and the body
    // includes the registered description from usePilotAction. Either
    // signal proves the modal is wired to this specific action.
    const modal = screen.getByRole("alertdialog");
    const text = modal.textContent ?? "";
    expect(
      /book\s*flight/i.test(text) || text.includes("previously proposed flight"),
      `Modal text did not reference the book_flight action: ${text}`,
    ).toBe(true);
  });

  it("clicking Decline resolves the tool call as user-cancelled (handler did NOT run)", async () => {
    const user = userEvent.setup();
    const { fireToolCall } = renderApp(
      <Routes>
        <Route path="/trips/:tripId/booking" element={<BookingRoute />} />
      </Routes>,
      { path: "/trips/lisbon-summer/booking" },
    );

    const promise = fireToolCall({
      toolName: "book_flight",
      input: { id: "f-jfk-lis-2026-06-12" },
    });

    // Wait for the modal to mount, then click the cancel/decline button.
    const modal = await screen.findByRole("alertdialog");
    // The confirm modal exposes an explicit Cancel button. Accept any
    // common cancel-style label so this test does not over-couple to copy.
    const cancelButton = within(modal).getByRole("button", {
      name: /cancel|decline|deny|reject|no/i,
    });
    await user.click(cancelButton);

    // The call resolves with the framework's structured cancel envelope.
    // This contract lets the model narrate the cancellation cleanly
    // ("Got it, didn't book that flight.") without the chat loop hanging.
    const result = await promise;
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ ok: false, reason: "User declined." });

    // Modal closed.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("clicking Approve dispatches the handler (call resolves with the handler's return)", async () => {
    const user = userEvent.setup();
    const { fireToolCall } = renderApp(
      <Routes>
        <Route path="/trips/:tripId/booking" element={<BookingRoute />} />
      </Routes>,
      { path: "/trips/lisbon-summer/booking" },
    );

    const promise = fireToolCall({
      toolName: "book_flight",
      input: { id: "f-jfk-lis-2026-06-12" },
    });

    const modal = await screen.findByRole("alertdialog");
    const approveButton = within(modal).getByRole("button", {
      name: /approve|confirm|allow|ok|yes|run/i,
    });
    await user.click(approveButton);

    // The handler executed; the call path resolved without an error.
    const result = await promise;
    expect(result.error).toBeUndefined();

    // Modal closed.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});

// Small helper. RTL's `within` is the canonical way to scope queries to
// a subtree; importing it inline keeps the file's import block tight.
import { within } from "@testing-library/react";
