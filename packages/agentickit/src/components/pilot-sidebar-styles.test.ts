import { describe, expect, it } from "vitest";
import { PILOT_SIDEBAR_CSS } from "./pilot-sidebar-styles.js";

describe("PILOT_SIDEBAR_CSS specificity contract", () => {
  it("wraps default token block in :where(:root) so consumer :root rules win", () => {
    expect(PILOT_SIDEBAR_CSS).toMatch(/:where\(:root\)\s*\{[\s\S]*?--pilot-bg:/);
    expect(PILOT_SIDEBAR_CSS).not.toMatch(/^:root\s*\{/m);
  });

  it("auto-tracks system dark via @media but skips when host opts into light", () => {
    expect(PILOT_SIDEBAR_CSS).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(PILOT_SIDEBAR_CSS).toMatch(
      /:where\(:root\):not\(\[data-pilot-theme="light"\]\)/,
    );
  });

  it("supports manual dark mode via [data-pilot-theme='dark']", () => {
    expect(PILOT_SIDEBAR_CSS).toMatch(
      /:where\(:root\)\[data-pilot-theme="dark"\]\s*\{[\s\S]*?--pilot-accent:\s*#f5f5f7/,
    );
  });

  it("composer row preserves asymmetric pill shape (flat-left, full-circle right)", () => {
    expect(PILOT_SIDEBAR_CSS).toMatch(
      /\.pilot-composer-row\s*\{[\s\S]*?border-radius:\s*0\s+999px\s+999px\s+0/,
    );
  });

  it("send button stays a perfect circle", () => {
    expect(PILOT_SIDEBAR_CSS).toMatch(
      /\.pilot-send\s*\{[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px[\s\S]*?border-radius:\s*999px/,
    );
  });
});
