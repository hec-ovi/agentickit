/**
 * Tests for the hand-rolled markdown renderer.
 *
 * Coverage:
 *   1. Basic inline formatting: bold, italic, inline code, links.
 *   2. Block formatting: headings, bullet lists, numbered lists, fenced code.
 *   3. Security: `<script>` tags, event-handler attributes, and dangerous
 *      URL schemes (`javascript:`, `data:`, `file:`) never reach the DOM.
 *   4. Safe URLs (http, https, mailto, relative) do reach the DOM.
 *   5. Code blocks preserve backtick/asterisk content verbatim.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PilotMarkdown } from "./pilot-markdown.js";

afterEach(() => {
  cleanup();
});

describe("<PilotMarkdown>", () => {
  it("renders bold, italic, and inline code", () => {
    const { container } = render(<PilotMarkdown text="Use **bold** and *italic* with `code()`." />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code.pilot-md-inline-code")?.textContent).toBe("code()");
  });

  it("renders bullet lists and numbered lists", () => {
    const { container } = render(
      <PilotMarkdown text={"Shopping:\n- apples\n- pears\n\nSteps:\n1. wash\n2. rinse"} />,
    );
    const uls = container.querySelectorAll("ul.pilot-md-ul li");
    const ols = container.querySelectorAll("ol.pilot-md-ol li");
    expect(uls.length).toBe(2);
    expect(uls[0].textContent).toBe("apples");
    expect(ols.length).toBe(2);
    expect(ols[1].textContent).toBe("rinse");
  });

  it("renders fenced code blocks preserving inner markdown verbatim", () => {
    const text = "```ts\nconst x = '**not bold**';\n```";
    const { container } = render(<PilotMarkdown text={text} />);
    const pre = container.querySelector("pre.pilot-md-pre");
    expect(pre).toBeTruthy();
    expect(pre?.getAttribute("data-lang")).toBe("ts");
    expect(pre?.querySelector("code")?.textContent).toBe("const x = '**not bold**';");
    // The asterisks must NOT have been parsed into a <strong> inside the code block.
    expect(pre?.querySelector("strong")).toBeNull();
  });

  it("renders headings at levels 1-3", () => {
    const { container } = render(
      <PilotMarkdown text={"# title\n\n## sub\n\n### tiny\n\n#### deeper"} />,
    );
    expect(container.querySelector("h3.pilot-md-h1")?.textContent).toBe("title");
    expect(container.querySelector("h4.pilot-md-h2")?.textContent).toBe("sub");
    // Level 4+ collapses to h3 styling to keep the visual hierarchy tight.
    expect(container.querySelectorAll("h5.pilot-md-h3").length).toBe(2);
  });

  it("renders safe links and strips dangerous URL schemes", () => {
    const { container } = render(
      <PilotMarkdown
        text={
          "[safe](https://example.com) " +
          "[evil](javascript:alert(1)) " +
          "[local](/dashboard) " +
          "[mail](mailto:a@b.co) " +
          "[bad](data:text/html,<script>alert(1)</script>)"
        }
      />,
    );
    const anchors = container.querySelectorAll("a.pilot-md-link");
    const hrefs = Array.from(anchors).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://example.com");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("mailto:a@b.co");
    // Dangerous URLs must not become anchors.
    expect(hrefs.some((h) => h?.toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(hrefs.some((h) => h?.toLowerCase().startsWith("data:"))).toBe(false);
    // External links get noopener/noreferrer + nofollow.
    const httpsLink = anchors[0] as HTMLAnchorElement;
    expect(httpsLink.getAttribute("rel")).toContain("noopener");
    expect(httpsLink.getAttribute("rel")).toContain("noreferrer");
  });

  it("XSS: embedded <script> tag is not executed and becomes plain text", () => {
    const { container } = render(
      <PilotMarkdown text={"before <script>window.PWNED = 1</script> after"} />,
    );
    // No <script> tag ever reaches the DOM — React escapes raw strings.
    expect(container.querySelector("script")).toBeNull();
    // The text still shows up as visible content so the user can see it.
    expect(container.textContent).toContain("window.PWNED");
    // And the side-effect must not have happened.
    expect((window as unknown as { PWNED?: number }).PWNED).toBeUndefined();
  });

  it("XSS: event-handler-looking attributes inside raw HTML never attach", () => {
    const { container } = render(
      <PilotMarkdown text={'<img src=x onerror="window.PWNED2 = 1">'} />,
    );
    // The renderer never builds an <img>; the whole tag is just text.
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { PWNED2?: number }).PWNED2).toBeUndefined();
  });

  it("XSS: link label with script-like content stays inert", () => {
    const { container } = render(
      <PilotMarkdown text={"[<script>alert(1)</script>](https://example.com)"} />,
    );
    // No <script> element rendered.
    expect(container.querySelector("script")).toBeNull();
    // The anchor still renders with its literal label.
    const anchor = container.querySelector("a.pilot-md-link");
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(anchor?.textContent).toContain("<script>");
  });

  it("renders a code block copy button in browsers that expose navigator.clipboard", () => {
    const { container } = render(<PilotMarkdown text={"```\nhi\n```"} />);
    // happy-dom exposes navigator.clipboard by default.
    const button = container.querySelector("button.pilot-md-copy");
    expect(button?.textContent).toBe("Copy");
  });
});
