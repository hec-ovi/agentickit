---
name: packing-list
version: 1.0.0
description: |
  Manage the trip's packing list: add items, mark packed, suggest items
  for given conditions. The Packing page exposes the list; the agent can
  see and edit it via the registered packing actions.
triggers:
  - "pack for"
  - "what should I bring"
  - "packing list"
  - "add to packing"
  - "did I pack"
  - "rainy week"
  - "spring trip"
tools:
  - add_packing_item
  - toggle_packing_item
  - remove_packing_item
  - get_weather
mutating: true
---

# When to use

Call into this skill when the user wants to plan or edit what they're
bringing. Typical phrasings:

- "pack for a rainy spring week in Lisbon"
- "add a raincoat and umbrella"
- "what should I bring for a beach trip"
- "did I pack a charger"

The Packing page is where this skill is most relevant. Other pages can
also trigger it ("for this trip, what should I pack?").

# How to use

For "what should I bring" / "pack for X":

1. If conditions matter (rainy, cold, hot), call `get_weather` first to
   ground the recommendation in real conditions.
2. Suggest 5-10 items grouped by category (clothing, electronics,
   documents, toiletries) — concise list, not prose paragraphs.
3. Ask if the user wants you to add them to the list. If yes, call
   `add_packing_item` once per item. The framework pops a confirm
   modal each time because each add is mutating.

For "add X":

1. Call `add_packing_item({ text })`. Confirm modal fires.
2. After approval, acknowledge in one sentence: "Added 1 item."

For "remove Y" / "mark Z as packed":

1. Read the registered packing-list state to find the item by text.
2. Call `remove_packing_item({ id })` or `toggle_packing_item({ id })`.
   Confirm modal fires.
3. After approval: "Removed it." / "Marked as packed."

For "did I pack X":

1. Read the registered packing-list state. Reply yes/no without calling
   any tool.

# Anti-patterns

- Do NOT add items without confirming what you're adding.
- Do NOT recommend a packing list without checking the weather first if
  the user mentioned conditions.
- Do NOT list 30 items when 8 will do.
