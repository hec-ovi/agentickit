---
name: currency-conversion
version: 1.0.0
description: |
  Convert an amount from one currency to another using a static rates
  table. Use for quick orientation only; not for live FX.
triggers:
  - "convert currency"
  - "how much is"
  - "exchange rate"
  - "in USD"
  - "in EUR"
  - "is that in"
tools:
  - convert_currency
mutating: false
---

# When to use

Call `convert_currency` when the user wants a quick currency conversion.
Typical phrasings:

- "how much is 200 EUR in USD"
- "is 1500 JPY about 10 USD"
- "convert my budget to euros"

The static rates are demo-grade. Do NOT use this for financial decisions
or for "should I exchange now" advice — recommend the user check a real
FX source for those.

# How to use

1. Identify the amount, source currency, target currency. ISO 4217
   codes: `USD`, `EUR`, `GBP`, `JPY`, etc.
2. Call `convert_currency({ amount, from, to })`. The tool returns
   `{ amount, from, to, rate, result }`.
3. Reply in one sentence with the rounded result and the rate.

# Output narration

Examples:
- "200 EUR is about 215 USD (rate ~1.075)."
- "1500 JPY is about 10 USD (rate ~0.0067)."

# Anti-patterns

- Do NOT recommend exchanging or hedging based on the static rate.
- Do NOT default to USD unless the user's preferences indicate it; check
  the registered preferences state first.
