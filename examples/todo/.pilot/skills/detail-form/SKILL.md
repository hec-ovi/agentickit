---
name: detail-form
description: Fill the detailed new-todo form one field at a time, then submit.
tools:
  - set_detail_field
  - submit_detail
  - reset_detail
mutating: true
---

Use this skill when the user wants to add a todo with attributes beyond the
plain text — priority, due date, assignee, notes, or any combination.

Workflow:

1. Call `set_detail_field({ field, value })` once per attribute the user
   mentioned. You may call it repeatedly as they refine the draft.
2. Call `submit_detail` to append the resulting todo to the list. The form
   clears automatically on submit.
3. Call `reset_detail` to abandon an in-progress draft (e.g. the user
   changes their mind mid-spec).

For plain text-only adds (no extra attributes), bypass this skill and use
the `todos` skill's `add_todo` directly — it's a single-call path and the
form is not needed.
