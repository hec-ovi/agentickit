import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import type { PilotPlugin } from "./index";
import type { WeatherDay } from "../data/types";

const weatherDaySchema = z.object({
  date: z.string(),
  highC: z.number(),
  lowC: z.number(),
  summary: z.string(),
});

interface WeatherResponse {
  city: string;
  source: "openweather" | "mock";
  days: WeatherDay[];
}

/**
 * Fetch the forecast through `/api/weather`. The server proxies to
 * OpenWeather when OPENWEATHER_API_KEY is set in the env, otherwise
 * returns deterministic mock data. Either way the shape is the same.
 */
export async function fetchWeather(
  city: string,
  days: number,
  startDate?: string,
): Promise<WeatherResponse | null> {
  const params = new URLSearchParams({ city, days: String(days) });
  if (startDate) params.set("startDate", startDate);
  try {
    const res = await fetch(`/api/weather?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as WeatherResponse;
  } catch {
    return null;
  }
}

function WeatherPluginComponent() {
  usePilotAction({
    name: "get_weather",
    description:
      "Get a multi-day weather forecast for a city. Returns each day's high, low (Celsius) and a one-line summary. Use this before suggesting outdoor activities, packing items, or commenting on the trip's weather.",
    parameters: z.object({
      city: z.string().describe("City name, e.g. 'Tokyo' or 'Tokyo, Japan'"),
      days: z.number().int().min(1).max(7).default(7).optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    }),
    handler: async ({ city, days, startDate }) => {
      const result = await fetchWeather(city, days ?? 7, startDate);
      if (!result) return { ok: false, reason: "weather lookup failed" };
      return {
        ok: true,
        city: result.city,
        source: result.source,
        days: result.days.map((d) => weatherDaySchema.parse(d)),
      };
    },
  });
  return null;
}

export const weatherPlugin: PilotPlugin = {
  id: "weather",
  description: "Forecast lookup via /api/weather (OpenWeather or mock fallback).",
  component: WeatherPluginComponent,
};
