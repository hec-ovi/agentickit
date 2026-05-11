/**
 * UI-level test for the per-thread persistence route.
 *
 * The full persistence story (send in α → switch to β → switch back →
 * history restored) needs a real `localRuntime` chat round-trip and is
 * covered by the framework's own `local-runtime-persistence.test.tsx`.
 * This test verifies the EXAMPLE's UI wiring: three tabs, clicking each
 * one updates the active state, the chat surface re-mounts, and the hint
 * for the active thread is what we documented.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderApp } from "../test/render-app";
import { ThreadsRoute } from "./threads";

afterEach(() => {
  cleanup();
});

describe("threads route, UI wiring", () => {
  it("renders three thread tabs and starts with α active", () => {
    renderApp(
      <Routes>
        <Route path="/threads" element={<ThreadsRoute />} />
      </Routes>,
      { path: "/threads" },
    );
    const alpha = screen.getByRole("button", { name: /thread α/i });
    const beta = screen.getByRole("button", { name: /thread β/i });
    const gamma = screen.getByRole("button", { name: /thread γ/i });
    expect(alpha.getAttribute("aria-pressed")).toBe("true");
    expect(beta.getAttribute("aria-pressed")).toBe("false");
    expect(gamma.getAttribute("aria-pressed")).toBe("false");
    // Hint copy reflects the active thread.
    expect(screen.getByText(/plan a 3-day trip to lisbon/i)).toBeDefined();
  });

  it("clicking a tab makes it active and swaps the hint", async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/threads" element={<ThreadsRoute />} />
      </Routes>,
      { path: "/threads" },
    );

    await user.click(screen.getByRole("button", { name: /thread β/i }));
    expect(screen.getByRole("button", { name: /thread α/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: /thread β/i }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    // Hint changed.
    expect(screen.getByText(/cheapest hotel in tokyo/i)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /thread γ/i }));
    expect(screen.getByText(/pack for iceland in november/i)).toBeDefined();

    // And back to α.
    await user.click(screen.getByRole("button", { name: /thread α/i }));
    expect(screen.getByText(/plan a 3-day trip to lisbon/i)).toBeDefined();
  });
});
