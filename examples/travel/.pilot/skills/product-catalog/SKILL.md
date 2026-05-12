---
name: product-catalog
version: 1.0.0
description: |
  Read-only SQL access to a small seeded catalog of travel gear: luggage,
  electronics, comfort, toiletries, apparel. Three tables (products,
  categories, reviews). The validator rejects anything other than SELECT.
  Use this for any user question about gear (prices, ratings, stock,
  recommendations).
triggers:
  - "show me luggage"
  - "recommend gear"
  - "what is in stock"
  - "highest rated"
  - "under 200"
  - "best electronics"
  - "compare products"
  - "travel adapter"
tools:
  - describe_schema
  - query_products
mutating: false
---

# When to use

Call into this skill whenever the user asks about gear / products / stock
/ ratings / prices for things the app sells. Examples:

- "what's the highest-rated luggage under $200"
- "show me what's in stock right now"
- "compare the carry-on bags by rating"
- "any travel adapters under $50"

Do NOT use for questions about flights, hotels, weather, or itinerary —
those have their own skills. Do NOT use for general retail questions
("where can I buy X") — that's the web-search skill.

# How to use

Two-step pattern, ALWAYS:

1. Call `describe_schema()` first if you don't already know the table
   layout this turn. Returns table + column shapes so you don't have to
   guess column names.
2. Call `query_products({ sql, limit? })` with a precise SELECT. The
   validator REJECTS anything other than SELECT (no INSERT/UPDATE/DELETE/
   DROP/ALTER/CREATE/PRAGMA/ATTACH/REPLACE/TRUNCATE/VACUUM/REINDEX, no
   statement chaining). `limit` defaults to 50 (max 200); if you over-
   fetch, the response includes `truncated: true`.

# Query craft

- Use `JOIN reviews USING (product_id)` and `AVG(rating)` for "highest
  rated" questions.
- Use `WHERE price <= ?` for budget filters.
- Use `WHERE in_stock = 1` for stock filters.
- Order by what the user implicitly wants (rating desc, price asc, etc).
- Limit to 3-5 unless the user explicitly asks for more.

# Output narration

Quote the actual product names from the result rows. Round prices to the
nearest dollar. Mention rating to one decimal place. Do NOT invent
products or specs that aren't in the result.

If the validator returns `{ ok: false, reason: "only SELECT..." }`, that
means you tried to write — re-think the query as a SELECT.

# Anti-patterns

- Do NOT skip `describe_schema` and guess column names.
- Do NOT issue multiple SELECT statements separated by semicolons (the
  validator rejects chains).
- Do NOT invent product names that aren't in the SELECT result.
- Do NOT recommend a product based on your training data; this catalog
  is the source of truth for what THIS app sells.
