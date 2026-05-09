/**
 * Tests for the `mode="overlay" | "push"` prop on `<PilotSidebar>`.
 *
 * Push mode marks <html> with a set of data attributes + a
 * --pilot-sidebar-width-active CSS variable so the package's CSS (and
 * any consumer override) can shift the page content to make room.
 *
 * These tests render a real <PilotSidebar>, click the toggle (real
 * button click, no internal-state probing), and assert on the
 * <html> element's attributes + style.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pilot } from "./pilot-provider.js";
import { PilotSidebar } from "./pilot-sidebar.js";
import {
  installPilotFetchMock,
  type MockPilotFetchController,
} from "../test-utils/stream-mock.js";

let mock: MockPilotFetchController;

afterEach(() => {
  cleanup();
  mock?.restore();
  // Defensive cleanup in case a test failed before the unmount effect ran.
  document.documentElement.removeAttribute("data-pilot-sidebar-mode");
  document.documentElement.removeAttribute("data-pilot-sidebar-state");
  document.documentElement.removeAttribute("data-pilot-sidebar-position");
  document.documentElement.style.removeProperty("--pilot-sidebar-width-active");
});

describe("PilotSidebar mode prop", () => {
  describe("overlay (default)", () => {
    it("does not set any push-mode html attributes when open", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} />
        </Pilot>,
      );
      const html = document.documentElement;
      expect(html.getAttribute("data-pilot-sidebar-mode")).toBeNull();
      expect(html.getAttribute("data-pilot-sidebar-state")).toBeNull();
      expect(html.style.getPropertyValue("--pilot-sidebar-width-active")).toBe("");
    });
  });

  describe("push", () => {
    it("marks html with mode + state + position + width on initial open", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} mode="push" position="right" width="420px" />
        </Pilot>,
      );
      const html = document.documentElement;
      expect(html.getAttribute("data-pilot-sidebar-mode")).toBe("push");
      expect(html.getAttribute("data-pilot-sidebar-state")).toBe("open");
      expect(html.getAttribute("data-pilot-sidebar-position")).toBe("right");
      expect(html.style.getPropertyValue("--pilot-sidebar-width-active")).toBe("420px");
    });

    it("clears the html attributes when the user closes the sidebar", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} mode="push" />
        </Pilot>,
      );
      const html = document.documentElement;
      expect(html.getAttribute("data-pilot-sidebar-state")).toBe("open");
      // Click the close button (X in the header).
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      expect(html.getAttribute("data-pilot-sidebar-mode")).toBeNull();
      expect(html.getAttribute("data-pilot-sidebar-state")).toBeNull();
      expect(html.style.getPropertyValue("--pilot-sidebar-width-active")).toBe("");
    });

    it("re-applies on re-open via the toggle button", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen={false} autoFocus={false} mode="push" />
        </Pilot>,
      );
      const html = document.documentElement;
      // Closed by default: no push state.
      expect(html.getAttribute("data-pilot-sidebar-state")).toBeNull();
      // Open via the toggle button (default aria-label is "Open copilot").
      fireEvent.click(screen.getByRole("button", { name: /open copilot/i }));
      expect(html.getAttribute("data-pilot-sidebar-state")).toBe("open");
      expect(html.getAttribute("data-pilot-sidebar-mode")).toBe("push");
    });

    it("supports left position", () => {
      mock = installPilotFetchMock();
      render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} mode="push" position="left" />
        </Pilot>,
      );
      expect(document.documentElement.getAttribute("data-pilot-sidebar-position")).toBe("left");
    });

    it("cleans up the html attributes on unmount", () => {
      mock = installPilotFetchMock();
      const { unmount } = render(
        <Pilot apiUrl="/api/pilot">
          <PilotSidebar defaultOpen autoFocus={false} mode="push" />
        </Pilot>,
      );
      expect(document.documentElement.getAttribute("data-pilot-sidebar-state")).toBe("open");
      unmount();
      expect(document.documentElement.getAttribute("data-pilot-sidebar-mode")).toBeNull();
      expect(document.documentElement.getAttribute("data-pilot-sidebar-state")).toBeNull();
    });
  });
});
