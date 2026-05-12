---
name: destination-catalog
version: 1.0.0
description: |
  Look up cities the app knows about and pull their catalog data. The
  catalog is small and curated; if a destination is missing, fall back to
  the web-search skill rather than inventing.
triggers:
  - "where should I go"
  - "list destinations"
  - "tell me about"
  - "what is there to do in"
  - "best time to visit"
  - "destination guide"
tools:
  - list_destinations
  - describe_destination
mutating: false
---

# When to use

Call `list_destinations` when the user wants to browse what the app
offers (the wizard's destination picker, an "ideas for the year"
question, etc).

Call `describe_destination` when the user asks ABOUT a specific city or
when you need catalog data (best time to visit, summary, signature
neighborhoods) before you make another call.

Do NOT invent destinations not in the catalog. If a city is missing,
hand off to the web-search skill explicitly: "Madrid isn't in the local
catalog yet, want me to search the web for it?"

# How to use

For a "browse" question:

1. Call `list_destinations()`.
2. Reply with 3-5 highlights, NOT all of them. The user can scroll the
   wizard for the full list.

For an "about" question:

1. Call `describe_destination({ city })`.
2. Reply with the most relevant 1-2 paragraphs. Mention `bestTimeToVisit`
   if the user is in planning mode.

# Anti-patterns

- Do NOT chain `describe_destination` for 5 cities in one turn — pick the
  most relevant 2 and offer the rest as a follow-up.
- Do NOT make up tourism facts. The catalog is the source of truth; web
  search is the fallback.
