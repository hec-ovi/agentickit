---
name: preferences
description: Change UI accent and density, or reset everything to defaults.
tools:
  - update_preferences
  - reset_preferences
mutating: true
---

# When to use

The user wants to change the visual accent color or density of the demo app,
or undo their choices. Typical phrasings:

- "use the emerald accent"
- "make it roomier"
- "reset my preferences"

`update_preferences` replaces the whole preferences object — it's
auto-generated from `usePilotState` because the state has a setter. Valid
accent ids are `slate`, `indigo`, `emerald`, `rose`. Valid density values
are `compact`, `comfortable`, `roomy`. The current values are visible in
the `## Current UI state` block under `preferences`.

# How to use

1. Partial updates: read the current `preferences` from the state snapshot,
   then call `update_preferences({ accent, density })` with the merged new
   value. Don't drop fields the user didn't mention.
2. Reset: `reset_preferences()`. This is `mutating: true` — the runtime will
   ask the user to confirm before it fires.

# Anti-patterns

- Don't send an accent id that isn't in the allowed set — it'll be rejected.
- Don't reset just to change one field. Use `update_preferences` with both
  current + requested values merged.
