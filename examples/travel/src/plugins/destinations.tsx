import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import { CITIES } from "../data/cities";
import type { PilotPlugin } from "./index";

/**
 * Read-only catalog plugin. Lets the agent enumerate cities the example
 * knows about and look up per-city specifics (airport code, top activity
 * categories) without having to hard-code knowledge in the prompt.
 */
function DestinationsPluginComponent() {
  usePilotAction({
    name: "list_destinations",
    description:
      "List the cities this app has rich data for. Returns name, country, airport code. Use before propose_flight / propose_hotel so the airport code is correct.",
    parameters: z.object({}).strict(),
    handler: () => ({
      ok: true,
      destinations: CITIES.map((c) => ({
        name: c.name,
        country: c.country,
        airportCode: c.airportCode,
      })),
    }),
  });

  usePilotAction({
    name: "describe_destination",
    description:
      "Get richer info about one known destination: airport code, hotel options, activity categories with examples.",
    parameters: z.object({ city: z.string() }),
    handler: ({ city }) => {
      const needle = city.trim().toLowerCase();
      const found = CITIES.find(
        (c) => c.name.toLowerCase() === needle || c.airportCode.toLowerCase() === needle,
      );
      if (!found) return { ok: false, reason: "unknown city" };
      const byCategory = new Map<string, string[]>();
      for (const a of found.activities) {
        const list = byCategory.get(a.category) ?? [];
        list.push(a.name);
        byCategory.set(a.category, list);
      }
      return {
        ok: true,
        name: found.name,
        country: found.country,
        airportCode: found.airportCode,
        airlines: found.airlines.map((a) => `${a.name} (${a.code})`),
        hotelExamples: found.hotels.map((h) => h.name),
        activitiesByCategory: Object.fromEntries(byCategory),
      };
    },
  });
  return null;
}

export const destinationsPlugin: PilotPlugin = {
  id: "destinations",
  description: "Catalog of known destinations (5 cities).",
  component: DestinationsPluginComponent,
};
