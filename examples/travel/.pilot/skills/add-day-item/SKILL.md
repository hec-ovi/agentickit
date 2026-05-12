---
name: add-day-item
version: 1.0.0
description: |
  Add an activity, meal, transit segment, or note to a specific day of
  the itinerary. Mutating; framework will pop a confirm modal before
  adding.
triggers:
  - "add to my itinerary"
  - "schedule for day"
  - "plan day"
  - "add an activity"
  - "book this for"
  - "put it on day"
tools:
  - add_day_item
  - get_current_date
  - compute_relative_date
mutating: true
---

# When to use

Call `add_day_item` when the user wants to add something to a specific day
of the trip's itinerary. Typical phrasings:

- "add Eiffel Tower to day 2"
- "schedule lunch at Cantina at 1pm on Friday"
- "put the museum visit on day 3"
- "add a note: bring an umbrella"

Do NOT call for trip-level edits (title, dates, total budget) — those go
through `update_<state>` actions auto-registered by `usePilotState`.

# How to use

1. Identify the day. The user may say "day 2" or a date like "Friday".
   If a date, convert with `compute_relative_date` to a `YYYY-MM-DD`
   value, then look up which day index that matches in the trip state.
2. Call `add_day_item({ dayIndex, kind, title, time?, location?, notes? })`.
   `kind` is one of: `activity`, `meal`, `transit`, `note`.
3. The framework will pop a confirm modal (mutating). The user approves
   or cancels. Wait for the result.
4. After the user decides, acknowledge in one sentence:
   - approved → "Added Eiffel Tower to day 2."
   - cancelled → "Cancelled — nothing added."

# Anti-patterns

- Do NOT add items in bulk without confirming each one. If the user says
  "add 5 things", do them one at a time.
- Do NOT guess the `kind`. If unclear, default to `activity`.
- Do NOT skip the date resolution step; "Friday" without conversion is a
  hallucination risk.
