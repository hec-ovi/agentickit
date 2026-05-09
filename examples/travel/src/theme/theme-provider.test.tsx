import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme-provider";

function Probe() {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <>
      <span data-testid="choice">{choice}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setChoice("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setChoice("light")}>
        light
      </button>
      <button type="button" onClick={() => setChoice("system")}>
        system
      </button>
    </>
  );
}

describe("ThemeProvider", () => {
  let origMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    origMatchMedia = window.matchMedia;
    // Force system pref to light by default; individual tests override.
    window.matchMedia = ((query: string) => {
      const mql = {
        matches: query.includes("dark") ? false : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
      return mql;
    }) as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = origMatchMedia;
  });

  it("defaults to system + light when nothing persisted and OS is light", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(getByTestId("choice").textContent).toBe("system");
    expect(getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists to localStorage when the choice changes", () => {
    const { getByRole, getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      getByRole("button", { name: "dark" }).click();
    });
    expect(getByTestId("choice").textContent).toBe("dark");
    expect(getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("ak-travel-theme")).toBe("dark");
  });

  it("reads the persisted choice on mount", () => {
    window.localStorage.setItem("ak-travel-theme", "dark");
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(getByTestId("choice").textContent).toBe("dark");
    expect(getByTestId("resolved").textContent).toBe("dark");
  });

  it("system mode resolves against OS preference", () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    const { getByTestId, getByRole } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      getByRole("button", { name: "system" }).click();
    });
    expect(getByTestId("choice").textContent).toBe("system");
    expect(getByTestId("resolved").textContent).toBe("dark");
  });
});
