import { describe, expect, it } from "vitest";
import { clearVisitedFlag, newItemId, newTripId } from "./store";

describe("store ids", () => {
  it("newTripId returns a prefixed unique-ish id", () => {
    const a = newTripId();
    const b = newTripId();
    expect(a).toMatch(/^trip-[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  it("newItemId honors the prefix", () => {
    const id = newItemId("p");
    expect(id).toMatch(/^p-[a-z0-9]+$/);
  });
});

describe("clearVisitedFlag", () => {
  it("removes the first-visit key when present", () => {
    window.localStorage.setItem("ak-travel-seen-hint", "1");
    clearVisitedFlag();
    expect(window.localStorage.getItem("ak-travel-seen-hint")).toBeNull();
  });

  it("is a no-op when the key is absent", () => {
    window.localStorage.removeItem("ak-travel-seen-hint");
    expect(() => clearVisitedFlag()).not.toThrow();
  });

  it("swallows localStorage errors", () => {
    const orig = window.localStorage.removeItem;
    window.localStorage.removeItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => clearVisitedFlag()).not.toThrow();
    } finally {
      window.localStorage.removeItem = orig;
    }
  });
});
