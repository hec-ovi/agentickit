---
name: preferences-management
version: 1.0.0
description: |
  Edit long-term user preferences: home airport, preferred currency,
  default trip duration, etc. Persisted across trips. Mutating; framework
  fires the confirm modal before any change.
triggers:
  - "set my"
  - "change my preference"
  - "save default"
  - "my home airport"
  - "I prefer"
  - "always use"
  - "restore demo seeds"
tools:
  - update_preferences
mutating: true
---

# When to use

Call into this skill when the user wants to change a long-term setting
that affects future trips. Typical phrasings:

- "set my home airport to LAX"
- "always plan in EUR"
- "default trip length is 5 days"
- "restore the demo seeds"

Do NOT use this for trip-specific edits — those go through trip-mutation
skills (`add-day-item`, `propose-flight`, etc.) and target the active trip.

# How to use

For a settings change:

1. Identify the field and value. The schema has
   `homeAirport`, `preferredCurrency`, `defaultTripLengthDays`,
   `prefersAisleSeat`, `prefersWindowSeat`.
2. Call `update_preferences({ field, value })`. The framework pops a
   confirm modal (mutating).
3. After approval, acknowledge in one sentence: "Home airport set to LAX."

For "restore the demo seeds":

The demo-seeds restore is a UI-only action exposed as a button on the
Preferences page; it is NOT a tool the agent can call. Direct the user
to the Preferences page button instead of trying to invoke a tool.

# Anti-patterns

- Do NOT change preferences silently — the confirm modal exists for a
  reason; the user's defaults shouldn't move without their nod.
- Do NOT batch multiple preference changes into one `update_preferences`
  call; do them one at a time so each gets its own confirm gate.
- Do NOT confuse trip-level edits with preference edits. "Use EUR for
  this trip" is a trip-level action, not a preference.
