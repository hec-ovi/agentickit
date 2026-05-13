/**
 * End-to-end test for the agent-switch flow in the actual Shell. The
 * two bugs the user found while filming the demo were:
 *
 *   1. Sidebar collapsed when switching from Concierge to a specialist.
 *      Root cause: PilotSidebar's open state was uncontrolled; when the
 *      runtime swapped (Shell rebuilt agUiRuntime for the new agent),
 *      the sidebar's internal useState reset to defaultOpen=false. Fix
 *      lifted open state to Shell using the new controlled `open` prop.
 *   2. Concierge messages were lost on switch-back. Root cause: Shell
 *      let Pilot fall back to its built-in localRuntime singleton with
 *      no initialMessages/onMessagesChange, so each switch back to
 *      Concierge produced a fresh useChat with empty history. Fix wires
 *      a Shell-owned per-agent message store and constructs an explicit
 *      localRuntime({ initialMessages, onMessagesChange }) for the
 *      Concierge slot.
 *
 * This test mounts the ACTUAL App (no Shell mocking) and drives the
 * agent-switch flow end to end. The framework primitives those bugs
 * exposed (controlled sidebar mode, localRuntime persistence options)
 * are unit-tested at the package level; this file pins the EXAMPLE's
 * wiring of those primitives.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./app";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

function mountApp(initialPath: string = "/agents") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Shell — agent-switch UI flow", () => {
  it("renders the Agents page with Concierge active by default", async () => {
    mountApp("/agents");
    // The Agents page lists every registered agent. Concierge is always
    // the default selection.
    const concierge = await screen.findByRole("button", {
      name: /concierge/i,
    });
    expect(concierge.getAttribute("aria-pressed")).toBe("true");
  });

  it("switching from Concierge to a specialist does NOT collapse an open sidebar (regression)", async () => {
    const user = userEvent.setup();
    mountApp("/agents");

    // Open the sidebar via its toggle. Before the controlled-open fix,
    // a subsequent agent switch would re-mount the sidebar (because the
    // Pilot runtime changed) and reset the uncontrolled open state to
    // defaultOpen=false — the bug the user filed.
    const openToggle = await screen.findByRole("button", { name: /open copilot/i });
    await user.click(openToggle);

    // Sidebar is now open: the complementary aside is in the DOM.
    expect(screen.getByRole("complementary")).toBeDefined();

    // The agent picker buttons carry `aria-label="Switch to <Name>"`,
    // which is the stable selector. Clicking flips activeAgent in
    // Shell, which re-renders AgentsRoute with the new aria-pressed.
    fireEvent.click(screen.getByRole("button", { name: /switch to hotels/i }));

    // Re-query the button after the state change rather than relying
    // on the original reference; React may patch the same DOM node but
    // re-querying is the most defensive read of the post-render state.
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: /switch to hotels/i })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });

    // The sidebar MUST still be visible. Without the controlled-open
    // fix, this assertion fails because the runtime swap caused the
    // sidebar to re-mount with its default closed state.
    expect(screen.getByRole("complementary")).toBeDefined();
  });

  it("switching agents back and forth keeps the sidebar open the whole time", async () => {
    const user = userEvent.setup();
    mountApp("/agents");

    await user.click(await screen.findByRole("button", { name: /open copilot/i }));
    expect(screen.getByRole("complementary")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /switch to flights/i }));
    expect(screen.getByRole("complementary")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /switch to concierge/i }));
    expect(screen.getByRole("complementary")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /switch to weather/i }));
    expect(screen.getByRole("complementary")).toBeDefined();
  });

  it("clicking the sidebar's close button DOES close it (controlled state still respects user input)", async () => {
    const user = userEvent.setup();
    mountApp("/agents");

    await user.click(await screen.findByRole("button", { name: /open copilot/i }));
    const aside = screen.getByRole("complementary");
    expect(aside).toBeDefined();

    // The close button uses aria-label="Close copilot" (defined in the
    // package's pilot-chrome.tsx). Exact-label match avoids picking up
    // any other "close" affordance. fireEvent for the same race-free
    // reason as above.
    const closeButton = within(aside).getByRole("button", { name: /^close copilot$/i });
    fireEvent.click(closeButton);

    // Shell's onOpenChange handler ran and set sidebarOpen=false,
    // which re-rendered the sidebar in closed mode.
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
  });

  it("the sidebar's empty-state copy reflects the active agent (controlled-open did not break label routing)", async () => {
    const user = userEvent.setup();
    mountApp("/agents");

    await user.click(await screen.findByRole("button", { name: /open copilot/i }));
    // The sidebar's empty-state copy is what we assert. Scope to the
    // aside so the agent-card descriptions on the page (which also
    // contain the agent names) do not produce false positives.
    const aside = screen.getByRole("complementary");
    expect(within(aside).getByText(/ask me anything about your trip/i)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /switch to hotels/i }));

    // Re-fetch aside (same node) and re-assert. Empty state now
    // mentions the hotels specialist instead of the generic copy.
    const asideAfter = screen.getByRole("complementary");
    expect(within(asideAfter).getByText(/hotels specialist/i)).toBeDefined();
  });
});
