---
name: weather-forecast
version: 1.0.0
description: |
  Look up current conditions or a forecast for a specific city and date.
  Backed by an OpenWeather proxy when OPENWEATHER_API_KEY is set,
  otherwise a deterministic mock so the demo works fully offline.
triggers:
  - "what is the weather"
  - "will it rain"
  - "forecast for"
  - "how cold"
  - "how hot"
  - "weather in"
tools:
  - get_weather
  - get_current_date
  - compute_relative_date
mutating: false
---

# When to use

Call `get_weather` when the user asks about conditions or a forecast.
Typical phrasings:

- "what's the weather in Lisbon next week"
- "will it rain on the 12th"
- "how cold will it be in Tokyo in December"
- "should I pack a coat for Madrid"

Do NOT call for general climate questions ("what's Lisbon usually like in
spring") — answer in prose for those.

# How to use

1. Resolve the date. If the user says "next week" or "the 12th", call
   `compute_relative_date` to get a `YYYY-MM-DD`. If they ask for
   "today", call `get_current_date`.
2. Call `get_weather({ city, date })`. The tool returns
   `{ tempC, tempF, condition, summary, source }`.
3. Reply in one short sentence with the user-facing values. Mention
   `source` only if it's the mock (the user should know they're seeing
   demo data, not a real forecast).

# Output narration

Examples of good replies:
- "Lisbon on 2026-05-20: 22°C, partly cloudy."
- "Tokyo on 2026-12-15: -2°C, light snow expected (mock data — set OPENWEATHER_API_KEY for live)."

# Anti-patterns

- Do NOT call `get_weather` repeatedly for adjacent days; one call per
  city/day is enough for a single user question.
- Do NOT recommend specific clothing items here; that's the packing
  skill's job. Just report the conditions.
- Do NOT hide the `source: "mock"` flag from the user.
