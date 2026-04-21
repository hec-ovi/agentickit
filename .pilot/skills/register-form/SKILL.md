---
name: register-form
version: 1.0.0
description: |
  Attach a react-hook-form instance to the copilot via usePilotForm. The
  hook registers three scoped tools — set_<name>_field, submit_<name>,
  reset_<name> — so the assistant can progressively fill and submit the
  form. Use when a consumer wants AI-assisted form completion.
triggers:
  - "usePilotForm"
  - "fill this form"
  - "react-hook-form"
  - "progressive fill"
  - "AI fills the form"
tools:
  - edit_file
  - read_source
  - run_npm_install
mutating: true
---

# Register Form

## Contract

By the end of this skill the consumer has:

- `react-hook-form` installed (it's an optional peer dep).
- A `useForm<TFieldValues>()` instance inside their component.
- A call to `usePilotForm(form, { name })` — the hook returns the form
  unchanged; existing `form.register(...)` calls keep working.
- Three tools registered under the scoped names — no more, no less.
- Understanding that `submit_<name>` walks the form's registered field
  refs to locate the `<form>` DOM node. It will NOT fall back to
  `document.forms`.

## Iron Law: `usePilotForm` never wraps, only registers

The hook takes a `UseFormReturn<TFieldValues>` and returns the same object
unchanged — see `packages/agentickit/src/hooks/use-pilot-form.ts` line 141.
Consumers keep calling `form.register(...)`, `form.handleSubmit(...)`,
`form.watch(...)` exactly as they would without the copilot. **Do not
suggest an alternate "copilot-aware" form API — there isn't one, and
introducing one would break the RHF ecosystem integration.**

## Phases

### Phase 1: install the peer

```bash
npm install react-hook-form
```

It's declared as an optional peer in `packages/agentickit/package.json`;
consumers who don't use forms skip it entirely.

### Phase 2: wire `useForm`

Standard RHF. Pick the type for the field values first:

```tsx
import { useForm } from "react-hook-form";

type InvoiceFields = { email: string; amount: number };

const form = useForm<InvoiceFields>({
  defaultValues: { email: "", amount: 0 },
});
```

### Phase 3: attach `usePilotForm`

```tsx
import { usePilotForm } from "agentickit";

usePilotForm(form, { name: "invoice" });
```

The signature (verified against `use-pilot-form.ts` lines 47-50):

```ts
function usePilotForm<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  options?: { name?: string; ghostFill?: boolean },
): UseFormReturn<TFieldValues>
```

`name` defaults to `"form"` — fine for single-form pages; set it
explicitly on multi-form pages so the tool names don't collide.

`ghostFill` is reserved for v0.2 (streaming preview with Tab-to-accept).
Currently a no-op. Safe to pass today but has no effect.

### Phase 4: render the form normally

```tsx
<form onSubmit={form.handleSubmit(handleSubmit)}>
  <input type="email" {...form.register("email", { required: true })} />
  <input type="number" {...form.register("amount", { valueAsNumber: true })} />
  <button type="submit">Send</button>
</form>
```

No wrapper component, no special props. The three scoped tools drive this
form via normal RHF APIs (`setValue`, `reset`, `requestSubmit`).

### Phase 5: understand the registered tools

With `name: "invoice"`, the hook registers:

- **`set_invoice_field({ field, value })`** — writes a single field via
  `form.setValue(field, value, { shouldValidate: true, shouldDirty: true,
  shouldTouch: true })`. Field path strings like `"email"` or
  `"address.street"` are accepted. Triggers RHF validation so the UI
  reflects errors immediately. (See `use-pilot-form.ts` lines 71-91.)
- **`submit_invoice()`** — calls `requestSubmit()` on the located form
  node so the declared `onSubmit` handler runs exactly as if the user
  clicked. Returns `{ success: false, message }` if the form is already
  submitting or not mounted. `mutating: true`. (Lines 93-120.)
- **`reset_invoice()`** — `form.reset()` back to `defaultValues`.
  `mutating: true`. (Lines 122-132.)

### Phase 6: security note

`submit_invoice` locates the `<form>` DOM node by walking from a
registered field's ref up to the nearest `<form>` ancestor. It will NOT
fall back to `document.forms` — doing so would let the assistant submit
any form on the page, including a search bar baked into a host shell.
(See `findFormElement` at `use-pilot-form.ts` lines 156-172 and the
comment on lines 149-155 explaining why.)

If `submit_<name>` returns `{ success: false, message: "Could not locate
the <form> element." }`, the form hasn't rendered yet or no fields are
registered. Register at least one field via `form.register(...)` before
the AI can submit.

## Anti-Patterns

- Calling `usePilotForm(form)` outside a `<Pilot>` provider. Logs a
  dev-only warning and is a no-op (lines 60-68). The user sees no error
  in prod.
- Forgetting the `name` on multi-form pages. `set_form_field` collides
  with itself across forms — the last registration wins, chaos ensues.
- Letting the AI submit without the user's eyes on the form. `submit_<name>`
  is already `mutating: true`; don't also manually register a
  bypass-confirm version.
- Attempting to expose individual fields via `usePilotState`. The per-field
  state is RHF's internal — use `form.watch()` if you want read access,
  and surface that derived value through `usePilotState` if truly needed.

## Output Format

After wiring, report:

- The form `name`.
- The three registered tool names (`set_<name>_field`, `submit_<name>`,
  `reset_<name>`).
- A one-line field-shape summary.

## Tools Used

- `npm install react-hook-form` if not already installed.
- Edit the consumer component to add `useForm` and `usePilotForm`.
- Read `packages/agentickit/src/hooks/use-pilot-form.ts` to verify the
  option shape and tool registration.
