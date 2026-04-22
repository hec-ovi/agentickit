---
name: fill-contact
description: Fill, submit, or reset the Contact form on the second tab.
tools:
  - set_contact_field
  - submit_contact
  - reset_contact
mutating: true
---

# When to use

The user wants the contact form filled, cleared, or submitted. Typical
phrasings:

- "fill the form with sample data"
- "put my name and email"
- "submit it"
- "clear the form"

The form lives on the **Contact form** tab. It has three fields: `name`,
`email`, `message`. All three are required and `email` must look like an
email address.

# How to use

1. For each field the user provided (explicitly or implicitly), call
   `set_contact_field({ field, value })`. One call per field — don't bundle.
2. If the user asked to submit, call `submit_contact()` once after every
   field is set. This is `mutating: true` — the runtime will ask first.
3. To clear everything, call `reset_contact()`. Also mutating.

# Anti-patterns

- Don't call `submit_contact` before the required fields are populated; the
  form will flag validation errors and the submit won't complete.
- Don't invent an email when the user didn't give one. Ask for it.
- Don't re-submit unless the user explicitly asked again.
