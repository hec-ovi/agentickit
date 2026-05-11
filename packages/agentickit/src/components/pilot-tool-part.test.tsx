/**
 * Behavioural tests for `<PilotToolPart>` (the inline tool-call card inside
 * the chat message list).
 *
 * Pins three rules:
 *
 *   1. Empty / `null` / `{}` / `[]` inputs and outputs do NOT render a
 *      lonely "Arguments" or "Result" section. `submit_form({})` etc. used
 *      to show an empty block that read as noise; the hide path uses the
 *      shared `formatJson` helper with `emptyAs: null` so the section is
 *      skipped at the render boundary.
 *
 *   2. The disclosure chevron only renders interactive when the tool has
 *      a body worth expanding (input, output, or error). Tools with no
 *      body (a call that's still streaming with no input yet, for
 *      example) get `data-has-body="no"` so CSS can hide the chevron.
 *
 *   3. The standard pilot-tool-* class hooks stay in place so the CSS
 *      animation + theming rules can target them.
 *
 * Why test the `<details>` shape directly: a future refactor that swaps
 * the disclosure mechanism (e.g. to a custom collapsible) needs to keep
 * the "no empty section" contract. Failing here surfaces the regression
 * before it reaches the sidebar.
 */

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { PilotMessageList } from "./pilot-sidebar-messages.js";
import { PILOT_SIDEBAR_CSS, injectSidebarStyles } from "./pilot-sidebar-styles.js";

afterEach(() => {
  cleanup();
});

interface ScriptedToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function assistantWith(parts: ScriptedToolPart[]): UIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts: parts as unknown as UIMessage["parts"],
  } as UIMessage;
}

function renderToolCall(part: ScriptedToolPart) {
  return render(
    <PilotMessageList messages={[assistantWith([part])]} isLoading={false} emptyState={null} />,
  );
}

describe("PilotToolPart — empty-body hiding", () => {
  it("does NOT render an Arguments section for `{}` input", () => {
    renderToolCall({
      type: "tool-submit_form",
      toolCallId: "t1",
      toolName: "submit_form",
      state: "output-available",
      input: {},
      output: { ok: true },
    });
    // Result IS rendered (non-empty), Arguments is NOT.
    expect(screen.queryByText("Arguments")).toBeNull();
    expect(screen.getByText("Result")).toBeDefined();
  });

  it("does NOT render a Result section for `{}` output", () => {
    renderToolCall({
      type: "tool-reset_form",
      toolCallId: "t2",
      toolName: "reset_form",
      state: "output-available",
      input: { force: true },
      output: {},
    });
    expect(screen.getByText("Arguments")).toBeDefined();
    expect(screen.queryByText("Result")).toBeNull();
  });

  it("hides both sections AND the body wrapper for a void call", () => {
    const { container } = renderToolCall({
      type: "tool-ping",
      toolCallId: "t3",
      toolName: "ping",
      state: "output-available",
      input: {},
      output: {},
    });
    expect(screen.queryByText("Arguments")).toBeNull();
    expect(screen.queryByText("Result")).toBeNull();
    // No `.pilot-tool-body` div rendered at all when there's nothing to show.
    expect(container.querySelector(".pilot-tool-body")).toBeNull();
    // The card is flagged so CSS can hide the chevron / disable cursor.
    const card = container.querySelector(".pilot-tool") as HTMLElement;
    expect(card?.getAttribute("data-has-body")).toBe("no");
  });

  it("DOES render Arguments for a non-empty input object, with humanized key labels", () => {
    renderToolCall({
      type: "tool-book_flight",
      toolCallId: "t4",
      toolName: "book_flight",
      state: "output-available",
      input: { id: "f-jfk-lis-1" },
      output: { ok: true },
    });
    expect(screen.getByText("Arguments")).toBeDefined();
    expect(screen.getByText("Result")).toBeDefined();
    // The pretty renderer humanizes keys: `id` → `Id`, `ok` → `Ok`.
    expect(screen.getAllByText("Id").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ok").length).toBeGreaterThan(0);
    // The raw string value still appears inline.
    expect(screen.getAllByText(/f-jfk-lis-1/).length).toBeGreaterThan(0);
  });

  it("renders Error when state is output-error, even if input is empty", () => {
    renderToolCall({
      type: "tool-broken",
      toolCallId: "t5",
      toolName: "broken",
      state: "output-error",
      input: {},
      errorText: "upstream timed out",
    });
    expect(screen.queryByText("Arguments")).toBeNull();
    expect(screen.getByText("Error")).toBeDefined();
    expect(screen.getByText("upstream timed out")).toBeDefined();
  });
});

describe("PilotToolPart — pretty value renderer", () => {
  it("humanizes camelCase + snake_case keys (`startDate` → `Start date`, `home_airport` → `Home airport`)", () => {
    renderToolCall({
      type: "tool-update_prefs",
      toolCallId: "p1",
      toolName: "update_prefs",
      state: "output-available",
      input: { startDate: "2026-05-11", home_airport: "JFK", pricePerNight: 320 },
      output: { ok: true },
    });
    expect(screen.getByText("Start date")).toBeDefined();
    expect(screen.getByText("Home airport")).toBeDefined();
    expect(screen.getByText("Price per night")).toBeDefined();
  });

  it("renders booleans as yes/no pills (not literal `true`/`false`)", () => {
    renderToolCall({
      type: "tool-flag",
      toolCallId: "p2",
      toolName: "flag",
      state: "output-available",
      input: { live: true, archived: false },
      output: { ok: true },
    });
    // Multiple "yes" elements exist (live:true, ok:true); just ensure the
    // pills render at all and the literal `true` doesn't show up.
    expect(screen.queryAllByText("true")).toHaveLength(0);
    expect(screen.queryAllByText("false")).toHaveLength(0);
    expect(screen.queryAllByText("yes").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("no").length).toBeGreaterThan(0);
  });

  it("renders an array of uniform-shape objects as a table with humanized columns", () => {
    renderToolCall({
      type: "tool-get_weather",
      toolCallId: "p3",
      toolName: "get_weather",
      state: "output-available",
      input: { city: "Lisbon" },
      output: {
        city: "Lisbon",
        days: [
          { date: "2026-05-11", highC: 22, lowC: 14, summary: "sunny" },
          { date: "2026-05-12", highC: 21, lowC: 13, summary: "scattered clouds" },
        ],
      },
    });
    // Column headers humanized.
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "High c" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Low c" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Summary" })).toBeDefined();
    // Two data rows plus header row.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("sunny")).toBeDefined();
    expect(screen.getByText("scattered clouds")).toBeDefined();
  });

  it("toggles to raw JSON view when the user clicks the Raw button", () => {
    const { container } = renderToolCall({
      type: "tool-thing",
      toolCallId: "p4",
      toolName: "thing",
      state: "output-available",
      input: { foo: "bar" },
      output: { ok: true },
    });
    // Initially pretty: no <pre> block, no curly brace dumps.
    expect(container.querySelectorAll(".pilot-tool-code")).toHaveLength(0);
    expect(container.querySelectorAll(".pilot-tool-pretty").length).toBeGreaterThan(0);

    // Click the first Raw toggle (one per section). Pre block appears for
    // that section; pretty view collapses.
    const rawBtn = screen.getAllByRole("button", { name: /^raw$/i })[0]!;
    fireEvent.click(rawBtn);
    expect(container.querySelectorAll(".pilot-tool-code").length).toBeGreaterThan(0);
    // After flipping, the button label is now "Pretty" and aria-pressed=true.
    expect(rawBtn.getAttribute("aria-pressed")).toBe("true");
    expect(rawBtn.textContent).toBe("Pretty");
  });
});

describe("PilotToolPart — chevron + interaction", () => {
  it("emits the chevron span so CSS has a rotation target", () => {
    const { container } = renderToolCall({
      type: "tool-x",
      toolCallId: "t-c1",
      toolName: "x",
      state: "output-available",
      input: { a: 1 },
      output: { ok: true },
    });
    expect(container.querySelector(".pilot-tool-chevron")).not.toBeNull();
  });

  it("the details element toggles open on click", () => {
    const { container } = renderToolCall({
      type: "tool-x",
      toolCallId: "t-c2",
      toolName: "x",
      state: "output-available",
      input: { a: 1 },
      output: { ok: true },
    });
    const details = container.querySelector(".pilot-tool") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    // Click the summary to open. happy-dom honours the native <details>
    // toggle behaviour on a click event.
    fireEvent.click(details.querySelector("summary") as HTMLElement);
    expect(details.open).toBe(true);
  });
});

describe("PilotToolPart — header layout", () => {
  it("renders summary as a grid with chevron, humanized name, status pill, and raw mono name on its own line", () => {
    const { container } = renderToolCall({
      type: "tool-get_current_date",
      toolCallId: "h1",
      toolName: "get_current_date",
      state: "output-available",
      input: { tz: "UTC" },
      output: { date: "2026-05-11" },
    });
    const summary = container.querySelector(".pilot-tool-summary") as HTMLElement;
    expect(summary).not.toBeNull();
    // Humanized title is visible primary content.
    expect(summary.querySelector(".pilot-tool-name")?.textContent).toBe("Get current date");
    // Raw mono name is preserved but on a separate row (grid-row 2).
    expect(summary.querySelector(".pilot-tool-raw-name")?.textContent).toBe("get_current_date");
    // Status pill still present, right-aligned via grid placement.
    const status = summary.querySelector(".pilot-tool-status") as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.getAttribute("data-state")).toBe("idle");
  });

  it("omits the raw-name chip when it would duplicate the humanized title verbatim", () => {
    // The humanized form of `Ping` is also `Ping` (already title-cased and
    // single-word) so the chip is suppressed to avoid restating the title.
    const { container } = renderToolCall({
      type: "tool-Ping",
      toolCallId: "h2",
      toolName: "Ping",
      state: "output-available",
      input: { host: "example.com" },
      output: { ok: true },
    });
    expect(container.querySelector(".pilot-tool-name")?.textContent).toBe("Ping");
    expect(container.querySelector(".pilot-tool-raw-name")).toBeNull();
  });

  it("keeps the raw-name chip for camelCase tools so the model's exact id stays visible", () => {
    const { container } = renderToolCall({
      type: "tool-createCard",
      toolCallId: "h3",
      toolName: "createCard",
      state: "output-available",
      input: { title: "Acme" },
      output: { ok: true },
    });
    // Humanized form differs from the raw id, so both chips render.
    expect(container.querySelector(".pilot-tool-name")?.textContent).toBe("CreateCard");
    expect(container.querySelector(".pilot-tool-raw-name")?.textContent).toBe("createCard");
  });
});

describe("PILOT_SIDEBAR_CSS — theming surface for the tool card", () => {
  // Every new variable promoted into the theming surface must appear in
  // PILOT_SIDEBAR_CSS at least twice: once in the :where(:root) defaults
  // block and once as a `var(--name)` reference downstream. The test reads
  // the CSS string directly so a future refactor that drops a referenced
  // variable surfaces the regression before it reaches consumers.
  const PROMOTED_VARS = [
    "--pilot-tool-padding",
    "--pilot-tool-gap",
    "--pilot-tool-radius",
    "--pilot-tool-name-size",
    "--pilot-tool-name-color",
    "--pilot-tool-name-weight",
    "--pilot-tool-line-height",
    "--pilot-tool-chevron-size",
    "--pilot-tool-chevron-stroke",
    "--pilot-tool-chevron-color",
    "--pilot-tool-raw-bg",
    "--pilot-tool-raw-fg",
    "--pilot-tool-raw-size",
    "--pilot-tool-raw-radius",
    "--pilot-tool-raw-padding",
    "--pilot-tool-status-size",
    "--pilot-tool-status-padding",
    "--pilot-tool-status-radius",
    "--pilot-tool-status-bg",
    "--pilot-tool-status-fg",
    "--pilot-tool-status-running-fg",
    "--pilot-tool-status-error-bg",
    "--pilot-tool-status-error-fg",
    "--pilot-pretty-row-gap",
    "--pilot-pretty-label-color",
    "--pilot-pretty-label-size",
    "--pilot-pretty-label-transform",
    "--pilot-pretty-label-tracking",
    "--pilot-pretty-table-border",
    "--pilot-toggle-bg",
    "--pilot-toggle-fg",
    "--pilot-toggle-border",
    "--pilot-toggle-active-bg",
    "--pilot-toggle-active-fg",
  ];

  it("declares every promoted variable as a default token", () => {
    for (const v of PROMOTED_VARS) {
      // Each promoted variable must be DECLARED somewhere as `--name:`.
      const declRe = new RegExp(`${v.replace(/[-]/g, "\\-")}\\s*:`);
      expect(PILOT_SIDEBAR_CSS, `missing default for ${v}`).toMatch(declRe);
    }
  });

  it("documents every promoted variable in the Theming surface comment block", () => {
    // The comment block at the top is the canonical discovery surface for
    // consumers. If a variable is added without being documented, this fails.
    const surfaceMatch = PILOT_SIDEBAR_CSS.match(
      /Theming surface[\s\S]*?(\*\/)/,
    );
    expect(surfaceMatch).not.toBeNull();
    const surface = surfaceMatch![0];
    for (const v of PROMOTED_VARS) {
      expect(surface, `${v} is missing from the Theming surface comment`).toContain(v);
    }
  });

  it("lets a consumer :root override beat the :where(:root) default", () => {
    // Specificity check: :where(:root) is 0,0,0,0 so a plain :root rule the
    // consumer authors at runtime should win. We inject the framework's CSS
    // plus a consumer override and read back the computed style.
    injectSidebarStyles();
    const override = document.createElement("style");
    override.textContent = `:root { --pilot-tool-name-size: 99px; --pilot-tool-status-running-fg: rgb(255, 0, 0); }`;
    document.head.appendChild(override);
    try {
      const root = document.documentElement;
      const computed = getComputedStyle(root);
      expect(computed.getPropertyValue("--pilot-tool-name-size").trim()).toBe("99px");
      expect(computed.getPropertyValue("--pilot-tool-status-running-fg").trim()).toBe(
        "rgb(255, 0, 0)",
      );
    } finally {
      override.remove();
    }
  });
});
