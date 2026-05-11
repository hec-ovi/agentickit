import { describe, expect, it } from "vitest";
import { PILOT_CONFIRM_MODAL_CSS } from "./pilot-confirm-modal-styles.js";
import { PILOT_SIDEBAR_CSS } from "./pilot-sidebar-styles.js";

const INT32_MAX = 2147483647;

/**
 * The user-approval modal MUST sit above every other piece of agentickit
 * chrome (sidebar, popup, inline modal, agent-state view). The contract is
 * "browsers cap z-index at int32; the confirm modal pins to the cap so no
 * host UI can render over it without explicitly opting in via the
 * `--pilot-confirm-z-index` CSS variable."
 */
describe("PILOT_CONFIRM_MODAL_CSS z-index contract", () => {
  it("backdrop pins to the signed int32 maximum (2147483647)", () => {
    // Default token block.
    expect(PILOT_CONFIRM_MODAL_CSS).toMatch(
      /:where\(:root\)\s*\{[\s\S]*?--pilot-confirm-z-index:\s*2147483647/,
    );
    // Backdrop reads from the variable with a hard fallback to the same value.
    expect(PILOT_CONFIRM_MODAL_CSS).toMatch(
      /\.pilot-confirm-backdrop\s*\{[\s\S]*?z-index:\s*var\(--pilot-confirm-z-index,\s*2147483647\)/,
    );
  });

  it("strictly outranks every z-index in PILOT_SIDEBAR_CSS", () => {
    // Pull every numeric z-index from the sidebar's CSS bundle. The sidebar
    // ships the popup, inline modal, agent-state view, and toggle stylesheets
    // too, so this single sweep covers all chat-surface chrome.
    const sidebarZIndexes = Array.from(
      PILOT_SIDEBAR_CSS.matchAll(/z-index:\s*(\d+)/g),
      (m) => Number.parseInt(m[1] as string, 10),
    );
    expect(sidebarZIndexes.length).toBeGreaterThan(0);
    for (const z of sidebarZIndexes) {
      // Confirm sits at INT32_MAX; sidebar layers must be strictly below.
      expect(z).toBeLessThan(INT32_MAX);
    }
  });

  it("exposes the override variable inside :where(:root) so host overrides win without specificity hacks", () => {
    // :where(:root) has specificity 0, so a consumer's
    // `:root { --pilot-confirm-z-index: 9999; }` rule overrides without
    // having to bump selector strength.
    const tokenBlock = PILOT_CONFIRM_MODAL_CSS.match(
      /:where\(:root\)\s*\{[\s\S]*?\}/,
    )?.[0];
    expect(tokenBlock).toBeDefined();
    expect(tokenBlock).toContain("--pilot-confirm-z-index");
    // Belt-and-braces: there must NOT be a bare `:root {` block defining the
    // same variable at higher specificity, that would defeat the override.
    expect(PILOT_CONFIRM_MODAL_CSS).not.toMatch(
      /^:root\s*\{[^}]*--pilot-confirm-z-index/m,
    );
  });
});
