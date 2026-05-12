---
name: propose-hotel
version: 1.0.0
description: |
  Surface hotel options as a picker the user chooses from. Mounts an
  inline UI in the chat (renderAndWait) and pauses until the user picks
  one or skips. Used during the Itinerary and Trip Detail pages.
triggers:
  - "find a hotel"
  - "propose a hotel"
  - "where should I stay"
  - "hotel options"
  - "book a stay"
  - "accommodation in"
tools:
  - propose_hotel
  - get_current_date
  - compute_relative_date
  - convert_currency
mutating: false
---

# When to use

Call `propose_hotel` when the user wants accommodation options. Typical phrasings:

- "find a hotel in Lisbon for the 12th to the 15th"
- "where should I stay near the city center"
- "I need a hotel under $150 a night"
- "show me accommodation options"

Do NOT call for general hotel-industry questions or for opinions about
specific brands. Answer in prose for those.

# How to use

1. Resolve dates first. If the user gave relative dates ("next weekend",
   "Friday to Sunday"), call `compute_relative_date` to convert them to
   `YYYY-MM-DD`.
2. Call `propose_hotel({ destination, checkIn, checkOut, maxPricePerNight? })`.
   The tool mounts an inline picker in the chat with 2-4 options. The
   agent loop pauses until the user picks or skips.
3. After the user picks, acknowledge in one sentence and stop. The picker
   writes the choice into trip state.
4. If the user skips, offer one alternative ("want me to widen the
   price range?").

# Output expectations

The tool resolves with the picked option (or `{ skipped: true }`). The
picker UI already displayed prices, ratings, and amenities, so a short
acknowledgement is enough.

# Anti-patterns

- Do NOT call `propose_hotel` repeatedly without user input.
- Do NOT prompt for clarification before calling — the picker IS the
  disambiguation.
- Do NOT re-list the options in prose after the picker resolves.
- Do NOT propose a flight here; if the user mentioned both, do hotels
  first then offer flights in the next turn.
