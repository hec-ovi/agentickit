# The three hooks

`usePilotState`, `usePilotAction`, `usePilotForm`. They are how your React app exposes itself to the AI. Each one is a single hook call that registers something with the `<Pilot>` provider.

## usePilotState

Expose a piece of React state to the AI. Read-only by default; writable if you supply a setter.

```tsx
import { useState } from "react";
import { z } from "zod";
import { usePilotState } from "@hec-ovi/agentickit";

function Profile() {
  const [name, setName] = useState("");

  usePilotState({
    name: "user_name",
    description: "The signed-in user's display name.",
    value: name,
    schema: z.string(),
    setValue: setName,   // omit for read-only
  });

  return <input value={name} onChange={(e) => setName(e.target.value)} />;
}
```

### What's load-bearing

- `name` is the identifier the AI sees. Snake_case by convention.
- `description` is the prompt-line. The AI relies on this to know when the field is relevant.
- `value` is the current value. Re-evaluated each render; the provider diffs by reference.
- `schema` is a Zod schema. It documents the shape AND validates AI-proposed updates.
- `setValue` is optional. **The field is named `setValue`, not `setter`.** When present, the provider auto-registers an `update_<name>` mutating action. Without it, the field is read-only.

### Auto-generated `update_<name>`

When `setValue` is set, the AI gets a tool called `update_<name>` with `parameters = schema`. Calling it runs your setter after the user approves the confirm modal (because it's mutating). The DOM updates, the `value` re-publishes, the model sees the new value on its next turn.

Source: [`packages/agentickit/src/hooks/use-pilot-state.ts`](../packages/agentickit/src/hooks/use-pilot-state.ts).

## usePilotAction

Register a callable tool. The AI sees a function with typed parameters; calling it runs your handler.

```tsx
import { z } from "zod";
import { usePilotAction } from "@hec-ovi/agentickit";

function CartActions() {
  usePilotAction({
    name: "apply_discount",
    description: "Apply a percentage discount to the cart total.",
    parameters: z.object({ percent: z.number().min(0).max(100) }),
    handler: ({ percent }) => {
      // your code
      return { ok: true, applied: percent };
    },
    mutating: true,   // pop a confirm modal before firing
  });

  return null;
}
```

### Fields

- `name` (required) - what the AI calls.
- `description` (required) - prompt-line.
- `parameters` (required) - Zod schema. The AI's JSON gets validated against this before your handler runs.
- `handler` (required) - sync or async; receives the validated input. Return value is the tool result the model sees.
- `mutating` (optional) - when true, the action is gated by `<PilotConfirmModal>`. Approve runs it; cancel sends `{ ok: false, reason: "User declined." }` back to the model.
- `renderAndWait` (optional) - replaces `handler` with a UI prompt that resolves with the user's input. See [hitl-and-confirm.md](./hitl-and-confirm.md).

### When to pick `mutating`

Anything irreversible from a user's perspective: writing to a DB, sending money, deleting, posting a comment, calling an external API with a side effect. Read-only queries don't need it.

### Multiple handlers, same name

Last-wins, with a dev-mode warning. The provider's registry keeps a single entry per name. Useful for swapping implementations across feature flags; surprising if you didn't mean to.

Source: [`packages/agentickit/src/hooks/use-pilot-action.ts`](../packages/agentickit/src/hooks/use-pilot-action.ts).

## usePilotForm

Bind a `react-hook-form` instance to the AI. The AI gets four auto-tools per form: `set_<name>_field`, `set_<name>_fields`, `submit_<name>`, `reset_<name>`.

```tsx
import { useForm } from "react-hook-form";
import { usePilotForm } from "@hec-ovi/agentickit";

function ContactForm() {
  const form = useForm({ defaultValues: { name: "", email: "", message: "" } });

  // First positional arg is the form. Second optional arg is { name?, ... }.
  usePilotForm(form, { name: "contact" });

  return (
    <form onSubmit={form.handleSubmit((vals) => console.log(vals))}>
      <input {...form.register("name")} />
      <input {...form.register("email")} />
      <textarea {...form.register("message")} />
      <button type="submit">Send</button>
    </form>
  );
}
```

### What gets registered

- `set_contact_field({ field, value })` - writes one field with RHF validation. The `field` argument is a strict Zod enum of the form's actual field paths (snapshotted from `defaultValues` at hook-mount time), so the AI cannot guess wrong: misspelled paths fail at the parameters layer rather than silently no-op'ing inside RHF. The tool description ends with `Available fields: foo, bar, baz.` so the model has a self-contained map.
- `set_contact_fields({ values })` - batch sibling of `set_<name>_field`. Writes any number of fields in one call and returns `{ written: [...], skipped: [...] }`. Cuts a "fill the whole form" intent from N round-trips to one. Same field-name validation as `set_<name>_field`.
- `submit_contact()` - calls `form.requestSubmit()`, which runs the form's declared `onSubmit` handler. Mutating, so it's gated by the confirm modal.
- `reset_contact()` - resets to `defaultValues`. Mutating.

If you don't pass `{ name: "..." }` the suffix defaults to `form` (so `set_form_field`, `set_form_fields`, `submit_form`, `reset_form`).

### Pitfalls

- **Pass the form positionally.** `usePilotForm(form)`, not `usePilotForm({ form })`. The wrapper-object shape silently breaks `formRef.current.setValue` at tool-call time. (Yes, that's a real footgun even if TypeScript doesn't always catch it.)
- The `<form>` element must be in the rendered tree when the AI calls `submit_<name>`. The hook walks RHF's registered fields to find it; if no fields are visible, submit returns an error.
- For multiple forms on one page, give each a distinct `name`. Otherwise the auto-tool names collide and the second registration wins (silently in production, with a dev-mode warning).

Source: [`packages/agentickit/src/hooks/use-pilot-form.ts`](../packages/agentickit/src/hooks/use-pilot-form.ts).

## usePilotInstructions

Per-page system-prompt fragment. Mounts and unmounts with the component; while live, the text is appended to the request body's `instructions` array on every send and merged into the composed system prompt by the server.

```tsx
import { usePilotInstructions } from "@hec-ovi/agentickit";

function PackingPage() {
  usePilotInstructions(
    "You're on the Packing page. Favor packing edits over global trip changes."
  );
  return <PackingList />;
}
```

Multiple components can each register their own fragment; all live fragments are appended in registration order. Empty strings are ignored. Server-side cap: 64 fragments per request, 4 KB each.

Useful for route-level guidance, modal-level focus, or per-experiment system tweaks. For static, server-owned guidance, set `createPilotHandler({ system: "..." })` or drop a `.pilot/instructions/*.md` file instead.

Source: [`packages/agentickit/src/hooks/use-pilot-instructions.ts`](../packages/agentickit/src/hooks/use-pilot-instructions.ts).

## Built-in tools the AI always has

`<Pilot>` auto-registers a handful of tools so the model has baseline introspection without consumer setup:

- `inspect_context({ filter? })` - returns a live snapshot of currently-mounted states (with current values and a preview cap), actions (with descriptions, mutating flag, hasRenderAndWait flag), forms (with field paths), and instructions (the `usePilotInstructions` fragments). The model can call this when the user is ambiguous, when it wants to confirm what the user can see, or when it wants to discover available tools before committing to a plan. `filter` accepts `"all"` (default), `"states"`, `"actions"`, `"forms"`, or `"instructions"` to keep responses tight on large apps.

The auto-tools are excluded from the inspect snapshot so calls to it are non-recursive.

## Composition tips

You can call any of the hooks in the same component, or split them across the tree. The registry is global to the surrounding `<Pilot>`, so the AI sees the union of everything registered anywhere inside it.

Each hook is keyed by `name`, so duplicate names overwrite each other. If you have a Cart on two pages, give them distinct names like `cart_main` vs `cart_drawer` to avoid this.
