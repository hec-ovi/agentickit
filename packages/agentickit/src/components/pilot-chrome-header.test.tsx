/**
 * Direct tests for `<PilotChromeHeader>`, the shared sidebar/popup/modal
 * header bar.
 *
 * The component itself is small but it carries an a11y contract:
 *
 *   - The visible title goes through `<h2 id={titleId}>` so the chrome's
 *     `aria-labelledby` attribute can resolve it.
 *   - The close button has an accessible name set via `aria-label` (NOT
 *     visible text) so the X icon doesn't mislead screen readers.
 *   - Clicking the button invokes the consumer's `onClose` handler exactly
 *     once per click.
 *
 * Sidebar, popup, and modal each have their own integration tests that
 * verify the higher-level wiring (focus restore, Escape, push mode, etc.).
 * These tests exist so a future refactor of the shared header can't quietly
 * break that contract for all three callers at once.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotChromeHeader } from "./pilot-chrome.js";

afterEach(() => {
  cleanup();
});

describe("PilotChromeHeader", () => {
  it("renders the title inside an <h2> with the supplied id", () => {
    render(
      <PilotChromeHeader
        title="Helper"
        closeLabel="Close"
        onClose={() => {}}
        titleId="header-title-1"
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Helper");
    expect(heading.getAttribute("id")).toBe("header-title-1");
  });

  it("renders a close button with the supplied accessible name", () => {
    render(
      <PilotChromeHeader
        title="Helper"
        closeLabel="Close helper"
        onClose={() => {}}
        titleId="header-title-2"
      />,
    );
    // The close icon is aria-hidden, so the only accessible name is the
    // aria-label.
    const button = screen.getByRole("button", { name: "Close helper" });
    expect(button).toBeDefined();
  });

  it("invokes onClose exactly once per click", () => {
    const onClose = vi.fn();
    render(
      <PilotChromeHeader
        title="Helper"
        closeLabel="Close"
        onClose={onClose}
        titleId="header-title-3"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ships the standard pilot-header / pilot-icon-button class hooks the CSS targets", () => {
    // Every chrome's CSS keys off these class names. If the header ever
    // renames them, sidebar/popup/modal lose their padding, alignment, and
    // hover styles in one shot. Pin the contract.
    const { container } = render(
      <PilotChromeHeader
        title="Helper"
        closeLabel="Close"
        onClose={() => {}}
        titleId="header-title-4"
      />,
    );
    expect(container.querySelector(".pilot-header")).not.toBeNull();
    expect(container.querySelector(".pilot-header-title")).not.toBeNull();
    expect(container.querySelector(".pilot-icon-button")).not.toBeNull();
  });

  it("renders a single header per instance (no surprise extras from refactor)", () => {
    const { container } = render(
      <PilotChromeHeader
        title="Helper"
        closeLabel="Close"
        onClose={() => {}}
        titleId="header-title-5"
      />,
    );
    expect(container.querySelectorAll("header").length).toBe(1);
    expect(container.querySelectorAll(".pilot-header").length).toBe(1);
    expect(container.querySelectorAll("button").length).toBe(1);
  });
});
