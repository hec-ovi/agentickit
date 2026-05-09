import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DestinationCover } from "./destination-cover";

describe("DestinationCover", () => {
  afterEach(cleanup);

  it("uses the catalog palette and label for a known city", () => {
    const { getByRole } = render(<DestinationCover destination="Tokyo, Japan" />);
    const el = getByRole("img");
    expect(el.getAttribute("aria-label")).toBe("Tokyo, Japan");
    const style = el.getAttribute("style") ?? "";
    expect(style).toContain("--dest-from: #fb7185");
    expect(style).toContain("--dest-to: #0e7490");
  });

  it("falls back to a neutral palette and the raw destination for unknown cities", () => {
    const { getByRole } = render(<DestinationCover destination="Atlantis" />);
    const el = getByRole("img");
    expect(el.getAttribute("aria-label")).toBe("Atlantis");
    expect(el.getAttribute("style") ?? "").toContain("--dest-from: #94a3b8");
  });

  it("renders the label overlay only when showLabel is true", () => {
    const { queryByText, rerender } = render(
      <DestinationCover destination="Tokyo, Japan" />,
    );
    expect(queryByText("Tokyo, Japan")).toBeNull();

    rerender(<DestinationCover destination="Tokyo, Japan" showLabel />);
    expect(queryByText("Tokyo, Japan")).not.toBeNull();
  });
});
