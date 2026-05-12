---
name: propose-flight
version: 1.0.0
description: |
  Surface flight options as a picker the user chooses from. Mounts an
  inline UI in the chat (renderAndWait) and pauses until the user picks
  one or skips. Used during the Itinerary page; a flights specialist
  agent also exists at /agents.
triggers:
  - "find me a flight"
  - "propose a flight"
  - "suggest flights from"
  - "flight options"
  - "fly to"
  - "ticket from"
tools:
  - propose_flight
  - get_current_date
  - compute_relative_date
  - convert_currency
mutating: false
---

# When to use

Call `propose_flight` when the user wants flight options. Typical phrasings:

- "find me a flight from JFK to Lisbon on the 12th"
- "what flights are there from LAX next Friday"
- "show me morning flights"
- "I need a return on Sunday"

Do NOT call when the user is asking ABOUT flights as a topic (prices in
general, airline opinions). Answer in prose for those.

# How to use

1. Resolve the dates first. If the user said "the 12th" or "next Friday",
   call `compute_relative_date` to get a `YYYY-MM-DD` value. Never invent.
2. Call `propose_flight({ origin, destination, date, returnDate? })`. The
   tool mounts an inline picker in the chat with 2-4 options. The agent
   loop pauses until the user picks one or skips.
3. After the user picks, narrate the choice in one sentence and stop.
   The picker writes the chosen flight into trip state automatically.
4. If the user skips, acknowledge and offer one alternative ("want me to
   widen the date range?").

# Output expectations

The tool resolves with the picked option (or `{ skipped: true }`). You do
NOT need to emit prices, times, or details — the picker UI already showed
them and the user just made a choice. One sentence acknowledging is enough.

# Anti-patterns

- Do NOT call `propose_flight` twice in a row without user input between.
- Do NOT prompt the user to "describe the kind of flight you want" before
  calling — the picker IS the disambiguation.
- Do NOT narrate every option in prose after the picker resolves; the
  user already saw them.
