---
name: todos
description: Read and mutate the todo list (add, toggle, remove, reorder).
tools:
  - add_todo
  - toggle_todo
  - remove_todo
  - update_todos
mutating: true
---

Read the current list from the `todos` context (provided verbatim at the
bottom of the prompt). For plain text-only adds use `add_todo`. For adds
that include extra attributes — priority, due date, assignee, notes — route
through the `detail-form` skill instead; `add_todo` does not accept those
fields.

When summarizing or referencing todos in your reply, use the item's visible
text, never its id.
