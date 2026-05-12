/**
 * Hono server for the travel example.
 *
 * Endpoints:
 *   POST /api/pilot                  -> createPilotHandler (the localRuntime path)
 *   POST /api/agui-flights           -> scripted flights specialist (AG-UI SSE)
 *   POST /api/agui-hotels            -> scripted hotels specialist
 *   POST /api/agui-activities        -> scripted activities specialist
 *   POST /api/agui-weather           -> scripted weather specialist
 *   GET  /api/health                 -> { ok, model, port }
 *
 * The four agui-* endpoints emit AG-UI SSE events (no LLM call) so the
 * multi-agent registry can be exercised end-to-end without a second backend.
 * Replace HttpAgent URLs with real LangGraph/CrewAI/Mastra endpoints to
 * graduate to production.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createOpenAI } from "@ai-sdk/openai";
import { createPilotHandler } from "@hec-ovi/agentickit/server";
import { runSpecialistTurn, type SpecialistConfig } from "./agui-bridge";
import { webSearchRoute } from "./web-search";
import { sqlQueryRoute, sqlSchemaRoute } from "./sql";

const PORT = Number.parseInt(process.env.PORT ?? "8788", 10);
const RAW_MODEL = process.env.PILOT_MODEL ?? "openai/Qwen3.6-27B-AWQ4";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

// vLLM strictness shims, mirrored from examples/todo/server/index.ts.
// Reasoning off via chat_template_kwargs; Responses-API only; assistant
// history shape normalized; function_call.arguments sanitized.
function buildVllmModel(modelId: string, baseURL: string) {
  const client = createOpenAI({
    baseURL,
    apiKey: process.env.OPENAI_API_KEY ?? "vllm-ignores-this",
    fetch: async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isResponses = url.endsWith("/responses") || url.includes("/responses?");
      if (!isResponses || !init?.body) return fetch(input, init);
      try {
        const body = JSON.parse(init.body as string);
        if (!("chat_template_kwargs" in body)) {
          body.chat_template_kwargs = { enable_thinking: false };
        } else if (
          body.chat_template_kwargs &&
          typeof body.chat_template_kwargs === "object" &&
          !("enable_thinking" in body.chat_template_kwargs)
        ) {
          body.chat_template_kwargs.enable_thinking = false;
        }
        if (Array.isArray(body.input)) {
          body.input = body.input.map(normalizeVllmInputItem);
        }
        return fetch(input, { ...init, body: JSON.stringify(body) });
      } catch {
        return fetch(input, init);
      }
    },
  });
  return client.responses(modelId);
}

function normalizeVllmInputItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const it = item as Record<string, unknown>;
  if (it.role === "assistant" && Array.isArray(it.content)) {
    const out = { ...it };
    if (typeof out.type !== "string") out.type = "message";
    if (typeof out.id !== "string")
      out.id = `msg_compat_${Math.random().toString(36).slice(2, 12)}`;
    if (typeof out.status !== "string") out.status = "completed";
    out.content = (it.content as unknown[]).map((part) => {
      if (!part || typeof part !== "object") return part;
      const p = part as Record<string, unknown>;
      if (p.type === "output_text" && !Array.isArray(p.annotations)) {
        return { ...p, annotations: [] };
      }
      return part;
    });
    return out;
  }
  if (it.type === "function_call" && typeof it.arguments === "string") {
    try {
      const parsed = JSON.parse(it.arguments);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return item;
    } catch {
      // fall through and sanitize
    }
    return { ...it, arguments: "{}" };
  }
  return item;
}

const MODEL = ((): string | ReturnType<typeof buildVllmModel> => {
  if (!OPENAI_BASE_URL) return RAW_MODEL;
  if (!RAW_MODEL.startsWith("openai/")) return RAW_MODEL;
  return buildVllmModel(RAW_MODEL.slice("openai/".length), OPENAI_BASE_URL);
})();
const MODEL_LABEL = typeof MODEL === "string" ? MODEL : RAW_MODEL;

// ---- Hono app ----

const app = new Hono();

// System prompt is composed at startup from `.pilot/RESOLVER.md` plus
// every `.pilot/skills/<name>/SKILL.md` it references. Edit the markdown,
// restart the dev server, behavior changes — no TypeScript edits needed.
// See examples/travel/.pilot/ for the actual content. The `pilotDir`
// option defaults to `.pilot` resolved against process.cwd(), which is
// the example folder when running `pnpm dev` from here.
const pilotHandler = createPilotHandler({
  model: MODEL,
  maxSteps: 8,
  log: true,
  ...(OPENAI_BASE_URL
    ? { getProviderOptions: () => ({ openai: { store: false } }) }
    : {}),
});

app.all("/api/pilot", (c) => pilotHandler(c.req.raw));

// ---- Real LLM specialists ----
//
// Each specialist endpoint runs a real `streamText` call with its own
// system prompt + a filtered subset of the client-declared tools. The
// AG-UI bridge translates AI SDK 6's `fullStream` events into AG-UI
// SSE events the client's HttpAgent understands.
//
// Tools are filtered server-side: each specialist only sees the subset
// relevant to its role, so the model can't drift outside its domain.
// The plugins (date, weather, currency, destinations) stay available to
// every specialist; itinerary / trip-mutation tools are scoped tighter.

const SPECIALIST_PROVIDER_OPTS = OPENAI_BASE_URL
  ? { openai: { store: false } }
  : undefined;

// Specialists need a fully-resolved LanguageModel instance because they
// call `streamText` directly (the Concierge goes through `createPilotHandler`
// which resolves model strings to instances internally).
//
// Two paths:
//   - vLLM mode (OPENAI_BASE_URL set): `MODEL` is already the built vLLM
//     client instance with strict-mode shims; reuse it.
//   - Hosted-provider mode (OPENAI_BASE_URL unset): `MODEL` is a plain
//     "openai/..."-style string and we have no resolver in this file.
//     Specialists return 503 in this branch instead of silently calling
//     `buildVllmModel("", "")` (which would point at default OpenAI with
//     no key) or trying to feed `streamText` a raw string. The Concierge
//     route still works through `createPilotHandler`'s provider lookup.
const SPECIALIST_MODEL: ReturnType<typeof buildVllmModel> | null =
  typeof MODEL === "string" ? null : MODEL;
const SPECIALIST_DISABLED_REASON = SPECIALIST_MODEL
  ? null
  : "Specialist agents require a vLLM endpoint. Set OPENAI_BASE_URL in .env.local to enable /api/agui-{flights,hotels,activities,weather}.";

// Configs are populated only when SPECIALIST_MODEL resolved (vLLM mode);
// in the disabled branch the routes return 503 before ever reading from
// this map. The non-null assertion below is safe behind that guard.
const SPECIALIST_CONFIGS: Record<string, SpecialistConfig> = SPECIALIST_MODEL
  ? buildSpecialistConfigs(SPECIALIST_MODEL)
  : {};

function buildSpecialistConfigs(
  model: ReturnType<typeof buildVllmModel>,
): Record<string, SpecialistConfig> {
  return {
  flights: {
    model,
    system: [
      "You are the Flights specialist for a travel-planning app.",
      "Scope: flights only. Use propose_flight to surface options through the picker UI;",
      "use get_weather and get_current_date for context. Do not edit the trip directly,",
      "do not propose hotels or activities, do not change preferences. If the user asks",
      "for something outside flights, redirect them to the Concierge.",
      "Be concise. Always emit dates as YYYY-MM-DD.",
    ].join(" "),
    allowTools: [
      "propose_flight",
      "get_weather",
      "get_current_date",
      "compute_relative_date",
      "convert_currency",
      "list_destinations",
      "describe_destination",
      "inspect_context",
    ],
    ...(SPECIALIST_PROVIDER_OPTS ? { providerOptions: SPECIALIST_PROVIDER_OPTS } : {}),
  },
  hotels: {
    model,
    system: [
      "You are the Hotels specialist for a travel-planning app.",
      "Scope: accommodations only. Use propose_hotel to surface options through the picker UI;",
      "use get_weather and get_current_date for context. Do not propose flights or activities,",
      "do not edit the trip directly, do not change preferences. If the user asks for something",
      "outside hotels, redirect them to the Concierge.",
      "Be concise.",
    ].join(" "),
    allowTools: [
      "propose_hotel",
      "get_weather",
      "get_current_date",
      "compute_relative_date",
      "convert_currency",
      "list_destinations",
      "describe_destination",
      "inspect_context",
    ],
    ...(SPECIALIST_PROVIDER_OPTS ? { providerOptions: SPECIALIST_PROVIDER_OPTS } : {}),
  },
  activities: {
    model,
    system: [
      "You are the Activities specialist for a travel-planning app.",
      "Scope: things to do only. Use add_day_item to schedule activities into the itinerary;",
      "use get_weather to factor in conditions and describe_destination to pull catalog data.",
      "Do not propose flights or hotels, do not edit the trip's title/status/budget.",
      "Be concise.",
    ].join(" "),
    allowTools: [
      "add_day_item",
      "get_weather",
      "get_current_date",
      "compute_relative_date",
      "list_destinations",
      "describe_destination",
      "inspect_context",
    ],
    ...(SPECIALIST_PROVIDER_OPTS ? { providerOptions: SPECIALIST_PROVIDER_OPTS } : {}),
  },
  weather: {
    model,
    system: [
      "You are the Weather specialist for a travel-planning app.",
      "Scope: forecasts and weather-driven advice only. Use get_weather and",
      "compute_relative_date to look up the right window. You cannot book, edit the trip,",
      "or propose flights/hotels/activities. Hand off to the Concierge for those.",
      "Be concise. Always emit dates as YYYY-MM-DD.",
    ].join(" "),
    allowTools: [
      "get_weather",
      "get_current_date",
      "compute_relative_date",
      "list_destinations",
      "describe_destination",
      "inspect_context",
    ],
    ...(SPECIALIST_PROVIDER_OPTS ? { providerOptions: SPECIALIST_PROVIDER_OPTS } : {}),
  },
  };
}

// Specialist routes. Each one returns 503 with a clear reason when vLLM
// isn't configured (see SPECIALIST_DISABLED_REASON above) so the Agents
// page surfaces an honest "specialists unavailable" state instead of
// silently breaking on the first request.
function specialistRoute(name: keyof typeof SPECIALIST_CONFIGS) {
  return (c: Parameters<typeof runSpecialistTurn>[0]) => {
    if (!SPECIALIST_MODEL) {
      return c.json(
        { error: "specialists_disabled", reason: SPECIALIST_DISABLED_REASON },
        503,
      );
    }
    return runSpecialistTurn(c, SPECIALIST_CONFIGS[name] as SpecialistConfig);
  };
}
app.post("/api/agui-flights", specialistRoute("flights"));
app.post("/api/agui-hotels", specialistRoute("hotels"));
app.post("/api/agui-activities", specialistRoute("activities"));
app.post("/api/agui-weather", specialistRoute("weather"));

// ---- Weather proxy ----
// When OPENWEATHER_API_KEY is set, hit api.openweathermap.org. Otherwise
// return a deterministic mock so the example works offline. Same response
// shape either way: { city, days: [{ date, highC, lowC, summary }] }.
//
// Geocoding (city -> lat/lon) is done via the OpenWeather geo API on demand
// and cached for the process lifetime. Forecasts cap at 7 days (free tier).

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY?.trim();
const geocodeCache = new Map<string, { lat: number; lon: number }>();

interface OWGeocode {
  name: string;
  lat: number;
  lon: number;
  country: string;
}

interface OWForecastListEntry {
  dt: number;
  main: { temp_max: number; temp_min: number };
  weather: Array<{ description: string }>;
}

interface OWForecastResponse {
  list: OWForecastListEntry[];
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  const cached = geocodeCache.get(city.toLowerCase());
  if (cached) return cached;
  if (!OPENWEATHER_API_KEY) return null;
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const list = (await res.json()) as OWGeocode[];
  const first = list[0];
  if (!first) return null;
  const point = { lat: first.lat, lon: first.lon };
  geocodeCache.set(city.toLowerCase(), point);
  return point;
}

interface WeatherDayJson {
  date: string;
  highC: number;
  lowC: number;
  summary: string;
}

async function realForecast(
  city: string,
  days: number,
): Promise<WeatherDayJson[] | null> {
  if (!OPENWEATHER_API_KEY) return null;
  const point = await geocode(city);
  if (!point) return null;
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${point.lat}&lon=${point.lon}&units=metric&cnt=40&appid=${OPENWEATHER_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as OWForecastResponse;
  // OpenWeather free tier returns 3-hour buckets for 5 days. Aggregate
  // to per-day high/low and pick the most-frequent description.
  const byDate = new Map<string, OWForecastListEntry[]>();
  for (const entry of json.list) {
    const day = new Date(entry.dt * 1000).toISOString().slice(0, 10);
    const arr = byDate.get(day) ?? [];
    arr.push(entry);
    byDate.set(day, arr);
  }
  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, days);
  return sorted.map(([date, entries]) => {
    const highs = entries.map((e) => e.main.temp_max);
    const lows = entries.map((e) => e.main.temp_min);
    const descCounts = new Map<string, number>();
    for (const e of entries) {
      const d = e.weather[0]?.description ?? "fair";
      descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
    }
    const summary =
      [...descCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "fair";
    return {
      date,
      highC: Math.round(Math.max(...highs)),
      lowC: Math.round(Math.min(...lows)),
      summary,
    };
  });
}

function mockForecast(city: string, startDate: string, days: number): WeatherDayJson[] {
  // Same algorithm as src/data/mock-search.ts, kept in sync. Server-local
  // implementation so we don't import client code.
  let h = 2166136261;
  for (const ch of `${city}|${startDate}`) {
    h ^= ch.charCodeAt(0);
    h = (h * 16777619) >>> 0;
  }
  const summaries = [
    "clear and warm",
    "scattered clouds",
    "morning showers",
    "sunny",
    "overcast",
    "evening rain",
    "foggy mornings",
    "bright with breeze",
  ];
  const start = new Date(startDate);
  return Array.from({ length: days }, (_, i) => {
    const sub = h + i * 11;
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const high = 18 + ((sub >>> 1) % 12);
    const low = high - 5 - (sub % 4);
    return {
      date: d.toISOString().slice(0, 10),
      highC: high,
      lowC: low,
      summary: summaries[sub % summaries.length] as string,
    };
  });
}

app.get("/api/weather", async (c) => {
  const city = c.req.query("city");
  const startDate = c.req.query("startDate") ?? new Date().toISOString().slice(0, 10);
  const daysRaw = Number.parseInt(c.req.query("days") ?? "7", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(7, Math.max(1, daysRaw)) : 7;
  if (!city) return c.json({ error: "missing city query param" }, 400);
  try {
    const real = await realForecast(city, days);
    if (real && real.length > 0) {
      return c.json({ city, source: "openweather", days: real });
    }
  } catch {
    // Fall through to mock on any error.
  }
  return c.json({ city, source: "mock", days: mockForecast(city, startDate, days) });
});

// Web-search proxy: dispatches to one of duckduckgo / tavily /
// firecrawl / serper based on `?backend=`. See server/web-search/index.ts
// for the env-var requirements per backend.
app.get("/api/search", (c) => webSearchRoute(c));

// Read-only SQL over a local SQLite product catalog. See server/sql/db.ts
// for the read-only enforcement layers (connection mode + static
// validator + row cap).
app.get("/api/sql/schema", (c) => sqlSchemaRoute(c));
app.post("/api/sql/query", (c) => sqlQueryRoute(c));

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    model: MODEL_LABEL,
    port: PORT,
    weather: OPENWEATHER_API_KEY ? "openweather" : "mock",
  }),
);

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  // biome-ignore lint/suspicious/noConsole: example server startup banner.
  console.log(`[travel] hono listening on http://127.0.0.1:${port} (model: ${MODEL_LABEL})`);
});
