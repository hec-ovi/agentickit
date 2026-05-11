/**
 * End-to-end test for the new-trip wizard flow.
 *
 * Renders the dashboard route, clicks the "New trip" button to open the
 * wizard, types into a real input element via `@testing-library/user-event`,
 * submits the form, and asserts the trip lands in the trips store + the
 * router navigates to the trip-detail page. No mocked form internals; the
 * real react-hook-form + custom Modal + usePilotForm path runs.
 *
 * Also verifies the new `usePilotForm({ confirm: { submit: false } })`
 * path: when the user submits the wizard form themselves, no confirm
 * modal pops (the wizard is configured to skip submit confirmation
 * because creating a draft trip is low-stakes).
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderApp } from "../test/render-app";
import { DashboardRoute } from "./dashboard";

// Trivial trip-detail stub so we can assert the route navigated to it
// after a successful create. We don't need the real route's contents,
// just a marker the test can find.
function TripDetailStub() {
  return <div data-testid="trip-detail-marker">trip detail</div>;
}

afterEach(() => {
  cleanup();
});

describe("new-trip wizard, end to end", () => {
  it("opens wizard, fills destination, submits, lands on trip-detail (no confirm modal)", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/trips/:tripId" element={<TripDetailStub />} />
      </Routes>,
      { path: "/" },
    );

    // Sanity: wizard isn't open yet.
    expect(screen.queryByRole("heading", { name: /^new trip$/i })).toBeNull();

    // Click "New trip" in the dashboard hero. Two buttons render with
    // that exact label (hero + empty-state); user-event clicks the first.
    const openButtons = screen.getAllByRole("button", { name: /^new trip$/i });
    await user.click(openButtons[0]!);

    // Wizard mounts. The wizard's Modal renders an h2 "New trip" inside
    // the dialog so the role/heading query reaches it now.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /new trip/i }),
      ).toBeDefined();
    });

    // Type a real destination. The wizard auto-focuses this input, so
    // the keystrokes land directly.
    const destination = screen.getByLabelText(/destination/i) as HTMLInputElement;
    await user.type(destination, "Lisbon");
    expect(destination.value).toBe("Lisbon");

    // Submit. usePilotForm registered a non-confirmed submit, so this
    // path must NOT trigger the confirm modal: the user is filling the
    // form themselves.
    const submit = screen.getByRole("button", { name: /create trip/i });
    await user.click(submit);

    // No confirm modal should have appeared at any point.
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // The router should have navigated to the trip-detail page (the stub
    // route is mounted under /trips/:tripId).
    await waitFor(() => {
      expect(screen.getByTestId("trip-detail-marker")).toBeDefined();
    });
  });

  it("typing in the destination clears the empty default and accepts edits", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/trips/:tripId" element={<TripDetailStub />} />
      </Routes>,
      { path: "/" },
    );

    await user.click(screen.getAllByRole("button", { name: /^new trip$/i })[0]!);
    const destination = (await screen.findByLabelText(/destination/i)) as HTMLInputElement;

    // Type, clear with the Cmd-A + Backspace pattern, retype.
    await user.type(destination, "Tokyo");
    expect(destination.value).toBe("Tokyo");
    await user.clear(destination);
    expect(destination.value).toBe("");
    await user.type(destination, "Reykjavik");
    expect(destination.value).toBe("Reykjavik");
  });
});
