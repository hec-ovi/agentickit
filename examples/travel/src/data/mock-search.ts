/**
 * Deterministic in-memory search functions backed by the city catalog.
 * Same inputs → same outputs, with seeded variety for realistic-feeling
 * diversity in the picker UIs.
 *
 * Replace this file with real provider clients (Skyscanner, Booking.com,
 * etc.) when graduating the example to production. Nothing else in the
 * app depends on these implementations.
 */

import { CITIES, findCity, type CitySpec } from "./cities";
import type { Activity, Flight, Hotel, WeatherDay } from "./types";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function pick<T>(seed: number, options: ReadonlyArray<T>): T {
  return options[seed % options.length] as T;
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function airlinesFor(code: string): ReadonlyArray<{ code: string; name: string }> {
  const city = CITIES.find((c) => c.airportCode === code);
  if (city) return city.airlines;
  return [
    { code: "UA", name: "United" },
    { code: "DL", name: "Delta" },
    { code: "AA", name: "American" },
  ];
}

export function searchFlights(args: {
  from: string;
  to: string;
  date: string;
}): Flight[] {
  const seed = hash(`${args.from}|${args.to}|${args.date}`);
  const candidates = airlinesFor(args.to);
  return Array.from({ length: 3 }, (_, i) => {
    const sub = seed + i * 17;
    const carrier = pick(sub, candidates);
    const flightNum = 100 + ((sub >>> 4) % 900);
    const departMin = 360 + (sub % 720); // 06:00 to 18:00
    const durationMin = 540 + (sub % 240); // 9h to 13h
    const stops = i === 0 ? 0 : i === 1 ? 0 : 1;
    const basePrice = 450 + ((sub >>> 4) % 700);
    return {
      id: `f-${args.from}-${args.to}-${args.date}-${i}`,
      from: args.from,
      to: args.to,
      date: args.date,
      airline: `${carrier.name} ${carrier.code}${flightNum}`,
      departTime: fmtTime(departMin),
      arriveTime: fmtTime((departMin + durationMin) % 1440),
      durationMin,
      stops,
      price: basePrice + stops * -80,
    };
  });
}

const FALLBACK_HOTELS = [
  { name: "Park Hyatt", rating: 4.7, pricePerNight: 320, amenities: ["wifi", "spa"] },
  { name: "Local Boutique", rating: 4.4, pricePerNight: 180, amenities: ["wifi", "central"] },
  { name: "Budget Inn", rating: 4.0, pricePerNight: 95, amenities: ["wifi"] },
] as const;

export function searchHotels(args: { city: string; nights: number }): Hotel[] {
  const cityRecord = findCity(args.city);
  const list = cityRecord?.hotels ?? FALLBACK_HOTELS;
  return list.slice(0, 3).map((h, i) => ({
    id: `h-${(cityRecord?.airportCode ?? "XXX")}-${i}`,
    name: cityRecord ? h.name : `${h.name} ${args.city}`,
    city: args.city,
    rating: h.rating,
    pricePerNight: h.pricePerNight,
    amenities: [...h.amenities],
  }));
}

const FALLBACK_ACTIVITIES = [
  { name: "Walking tour", category: "culture" as const, durationMin: 150, cost: 30 },
  { name: "Local food tour", category: "food" as const, durationMin: 180, cost: 65 },
  { name: "Free evening", category: "nightlife" as const, durationMin: 180, cost: 0 },
  { name: "Day in the park", category: "nature" as const, durationMin: 180, cost: 0 },
];

export function searchActivities(args: {
  city: string;
  category?: Activity["category"];
}): Activity[] {
  const cityRecord = findCity(args.city);
  const list = cityRecord?.activities ?? FALLBACK_ACTIVITIES;
  const filtered = args.category ? list.filter((a) => a.category === args.category) : list;
  return filtered.map((a, i) => ({
    id: `a-${cityRecord?.airportCode ?? args.city.replace(/\s+/g, "")}-${i}`,
    city: args.city,
    name: a.name,
    category: a.category,
    durationMin: a.durationMin,
    cost: a.cost,
  }));
}

const SUMMARIES = [
  "clear and warm",
  "scattered clouds",
  "morning showers",
  "sunny",
  "overcast",
  "evening rain",
  "foggy mornings",
  "bright with breeze",
];

function biasForLatitude(lat: number): number {
  // Higher latitudes are colder. Returns a temperature offset in Celsius.
  return -Math.abs(lat) * 0.3 + 8;
}

export function searchWeather(args: {
  city: string;
  startDate: string;
  days: number;
}): WeatherDay[] {
  const cityRecord = findCity(args.city);
  const seed = hash(`${args.city}|${args.startDate}`);
  const tempBias = biasForLatitude(cityRecord?.lat ?? 0);
  const start = new Date(args.startDate);
  return Array.from({ length: args.days }, (_, i) => {
    const sub = seed + i * 11;
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const high = Math.round(18 + tempBias + ((sub >>> 1) % 12));
    const low = Math.round(high - 5 - (sub % 4));
    const summary = pick(sub, SUMMARIES);
    return {
      date: d.toISOString().slice(0, 10),
      highC: high,
      lowC: low,
      summary,
    };
  });
}

export function listKnownCities(): ReadonlyArray<CitySpec> {
  return CITIES;
}
