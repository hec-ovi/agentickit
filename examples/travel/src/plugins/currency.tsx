import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";
import type { PilotPlugin } from "./index";

/** Static rates, anchored to USD. Fine for a demo; swap for a live feed
 *  via /api/fx if you want real numbers. */
const RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 156.4,
  ARS: 880,
  ISK: 137,
};

function CurrencyPluginComponent() {
  usePilotAction({
    name: "convert_currency",
    description:
      "Convert an amount between currencies using static reference rates. Useful when comparing trip costs against the user's preferred currency. Currencies supported: USD, EUR, GBP, JPY, ARS, ISK.",
    parameters: z.object({
      amount: z.number(),
      from: z.string().length(3),
      to: z.string().length(3),
    }),
    handler: ({ amount, from, to }) => {
      const fromRate = RATES[from.toUpperCase()];
      const toRate = RATES[to.toUpperCase()];
      if (!fromRate || !toRate) {
        return { ok: false, reason: `unsupported currency: ${from}/${to}` };
      }
      const usd = amount / fromRate;
      const converted = usd * toRate;
      return {
        ok: true,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        original: amount,
        converted: Math.round(converted * 100) / 100,
        rate: toRate / fromRate,
      };
    },
  });
  return null;
}

export const currencyPlugin: PilotPlugin = {
  id: "currency",
  description: "Static cross-currency conversion (USD anchor, six currencies).",
  component: CurrencyPluginComponent,
};
