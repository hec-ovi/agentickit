---
name: manage-todos
description: Add, toggle, delete, and bulk-clear todos on the todo widget.
tools:
  - add_todo
  - toggle_todo
  - delete_todo
  - clear_completed
  - update_todos
mutating: true
---

# When to use

The user wants to change the todo list. Typical phrasings:

- "add X, Y, Z to my todos"
- "mark the first one as done"
- "delete buy milk"
- "clear finished items"

The current list is always visible in the `## Current UI state` block under
`todos` — read it before picking an id so you don't target the wrong row.

# How to use

1. Adding: call `add_todo({ text })` once per item. The tool returns the new
   `id`; remember it if the user is likely to follow up.
2. Toggling: look up the item by text, then call `toggle_todo({ id })`.
3. Deleting: same lookup, then `delete_todo({ id })`. This is
   `mutating: true`, so the runtime will ask the user to confirm.
4. Bulk clear: `clear_completed()` removes every done item. Also mutating.

`update_todos` is auto-generated and replaces the whole list at once. Do not
use it to change a single item — pick a granular tool instead.

# Anti-patterns

- Don't echo the whole list in prose; the UI already shows it.
- Don't ask the user to confirm when the tool is non-mutating (the runtime
  only prompts for `mutating: true`).
- Don't fabricate ids. Every id is visible in the state snapshot.
