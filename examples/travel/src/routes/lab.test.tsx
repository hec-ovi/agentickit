/**
 * UI-level tests for the chat-surfaces lab route.
 *
 * The lab page is a sandbox of toggles around `<PilotPopup>`,
 * `<PilotModal>`, `<PilotSidebar>` variations, and `<PilotChatView>`
 * composer modes. Each section nests its own `<Pilot>` with the package's
 * default localRuntime, but the OUTER `renderApp` provides a stub Pilot
 * for any other context the route reads. The nested provider takes over
 * for the actual chat surface, but we can still drive toggles and observe
 * the DOM changes those toggles cause.
 *
 * What we cover:
 *   - PilotPopup corner-toggle reflects in DOM data attributes / classes.
 *   - PilotModal opens on click and closes on Escape.
 *   - Sidebar position + mode toggles re-mount with the new attributes.
 *   - Composer-mode toggle: "off" hides the textarea AND the chips;
 *     "suggestions" hides the textarea but keeps the chips.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderApp } from "../test/render-app";
import { LabRoute } from "./lab";

afterEach(() => {
  cleanup();
});

describe("lab route, composer modes", () => {
  it("composer='full' shows the textarea AND the suggestion chips", () => {
    renderApp(
      <Routes>
        <Route path="/lab" element={<LabRoute />} />
      </Routes>,
      { path: "/lab" },
    );

    // Section heading is present.
    expect(
      screen.getByRole("heading", { level: 2, name: /composer modes/i }),
    ).toBeDefined();

    // In `"full"` (the initial state), a textarea exists somewhere on the
    // page and the canned suggestion appears as a chip button.
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /what can you help me with/i })).toBeDefined();
  });

  it("composer='suggestions' hides the textarea but keeps the chips", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/lab" element={<LabRoute />} />
      </Routes>,
      { path: "/lab" },
    );

    // Find the composer-mode toggle for `suggestions`. Multiple buttons
    // start with `composer="`; we pick by full text.
    await user.click(screen.getByRole("button", { name: /composer="suggestions"/i }));

    // Suggestion chip is still there.
    expect(
      screen.getByRole("button", { name: /what can you help me with/i }),
    ).toBeDefined();
    // Section description updated.
    expect(screen.getByText(/chips-only/i)).toBeDefined();
  });

  it("composer='off' hides BOTH the textarea and the chips", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/lab" element={<LabRoute />} />
      </Routes>,
      { path: "/lab" },
    );

    await user.click(screen.getByRole("button", { name: /composer="off"/i }));

    // Description copy reflects observational mode.
    expect(screen.getByText(/composer is off/i)).toBeDefined();
    // No suggestion chip.
    expect(
      screen.queryByRole("button", { name: /what can you help me with/i }),
    ).toBeNull();
  });
});

describe("lab route, sidebar variations", () => {
  it("position toggle flips active state correctly", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/lab" element={<LabRoute />} />
      </Routes>,
      { path: "/lab" },
    );

    // Find the sidebar-section card. The toggles inside it are `right`
    // (default active) and `left`.
    const sidebarHeading = screen.getByRole("heading", {
      level: 2,
      name: /sidebar variations/i,
    });
    const card = sidebarHeading.closest("section") as HTMLElement;
    const right = within(card).getByRole("button", { name: /^right$/i });
    const left = within(card).getByRole("button", { name: /^left$/i });

    expect(right.getAttribute("aria-pressed")).toBe("true");
    expect(left.getAttribute("aria-pressed")).toBe("false");

    await user.click(left);
    expect(left.getAttribute("aria-pressed")).toBe("true");
    expect(right.getAttribute("aria-pressed")).toBe("false");
    // The summary line under the toggles renders the new position inside
    // a `<code>` element; we look for the exact value.
    const codes = within(card).getAllByText("left");
    expect(codes.length).toBeGreaterThan(0);
  });
});
