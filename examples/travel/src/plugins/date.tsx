import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import type { PilotPlugin } from "./index";

/**
 * Date helpers exposed as tools. The model often needs to compute
 * "tomorrow", "in 3 days", "next Friday" relative to the actual current
 * date, but its context has no notion of `now`. These tools give it
 * deterministic, locale-agnostic primitives that always emit YYYY-MM-DD.
 */
function DatePluginComponent() {
  usePilotAction({
    name: "get_current_date",
    description:
      "Get today's date as YYYY-MM-DD plus the day of the week and a simple `now` ISO timestamp. " +
      "Use before any 'tomorrow', 'next week', 'in N days' arithmetic.",
    parameters: z.object({}).strict(),
    handler: () => {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
      return {
        ok: true,
        date,
        weekday,
        nowISO: now.toISOString(),
      };
    },
  });

  usePilotAction({
    name: "compute_relative_date",
    description:
      "Add or subtract whole days from a base date. " +
      "If baseDate is omitted, today is used. Returns YYYY-MM-DD. " +
      "Use this for trip start/end dates instead of computing in your head.",
    parameters: z.object({
      days: z
        .number()
        .int()
        .describe("Number of days to add (negative to subtract)."),
      baseDate: z
        .string()
        .optional()
        .describe("YYYY-MM-DD; defaults to today if omitted."),
    }),
    handler: ({ days, baseDate }) => {
      const base = baseDate ? new Date(`${baseDate}T00:00:00Z`) : new Date();
      if (Number.isNaN(base.getTime())) {
        return { ok: false, reason: `invalid baseDate: ${baseDate}` };
      }
      base.setUTCDate(base.getUTCDate() + days);
      return { ok: true, date: base.toISOString().slice(0, 10) };
    },
  });

  return null;
}

export const datePlugin: PilotPlugin = {
  id: "date",
  description: "Today's date plus day-arithmetic helpers (no LLM date hallucination).",
  component: DatePluginComponent,
};
