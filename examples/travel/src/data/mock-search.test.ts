/**
 * Tests for the in-memory mock-search functions backing the itinerary
 * picker UI. Both functions are pure and deterministic; same input yields
 * same output, which is what makes the picker tests reproducible.
 */

import { describe, it, expect } from "vitest";
import { searchFlights, searchHotels } from "./mock-search";

describe("mock-search", () => {
  it("searchFlights returns 3 deterministic options for the same input", () => {
    const a = searchFlights({ from: "SFO", to: "HND", date: "2026-05-15" });
    const b = searchFlights({ from: "SFO", to: "HND", date: "2026-05-15" });
    expect(a).toHaveLength(3);
    expect(b).toEqual(a);
  });

  it("searchFlights varies between distinct routes", () => {
    const tokyo = searchFlights({ from: "SFO", to: "HND", date: "2026-05-15" });
    const paris = searchFlights({ from: "SFO", to: "CDG", date: "2026-05-15" });
    expect(tokyo[0]?.airline).not.toBe(paris[0]?.airline);
  });

  it("searchHotels returns 3 hotels with valid pricing for known cities", () => {
    const out = searchHotels({ city: "Tokyo", nights: 7 });
    expect(out).toHaveLength(3);
    for (const h of out) {
      expect(h.pricePerNight).toBeGreaterThan(0);
      expect(h.rating).toBeGreaterThanOrEqual(4);
      expect(h.amenities.length).toBeGreaterThan(0);
    }
  });

  it("searchHotels falls back gracefully for cities not in the catalog (no 'XXX' placeholder ids)", () => {
    // Regression: an earlier version emitted ids like `h-XXX-0` for unknown
    // cities. Now a real city-derived slug is used so ids stay distinct.
    const out = searchHotels({ city: "Atlantis", nights: 3 });
    expect(out).toHaveLength(3);
    for (const h of out) {
      expect(h.id).not.toContain("XXX");
      expect(h.id).toMatch(/^h-[A-Z]{1,3}-\d+$/);
      expect(h.city).toBe("Atlantis");
    }
  });
});
