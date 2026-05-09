import { describe, it, expect } from "vitest";
import { searchFlights, searchHotels, searchActivities, searchWeather } from "./mock-search";

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

  it("searchHotels returns 3 hotels with valid pricing", () => {
    const out = searchHotels({ city: "Tokyo", nights: 7 });
    expect(out).toHaveLength(3);
    for (const h of out) {
      expect(h.pricePerNight).toBeGreaterThan(0);
      expect(h.rating).toBeGreaterThanOrEqual(4);
      expect(h.amenities.length).toBeGreaterThan(0);
    }
  });

  it("searchActivities returns curated list for known cities and falls back for unknown", () => {
    const tokyo = searchActivities({ city: "Tokyo" });
    const unknown = searchActivities({ city: "Atlantis" });
    expect(tokyo.some((a) => a.name === "Tsukiji food walk")).toBe(true);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0]?.city).toBe("Atlantis");
  });

  it("searchActivities filters by category", () => {
    const food = searchActivities({ city: "Tokyo", category: "food" });
    for (const a of food) expect(a.category).toBe("food");
  });

  it("searchWeather returns N days of forecast and is deterministic", () => {
    const a = searchWeather({ city: "Tokyo", startDate: "2026-05-15", days: 5 });
    const b = searchWeather({ city: "Tokyo", startDate: "2026-05-15", days: 5 });
    expect(a).toHaveLength(5);
    expect(a).toEqual(b);
    for (const day of a) {
      expect(day.highC).toBeGreaterThan(day.lowC);
    }
  });
});
