---
name: register-action
version: 1.0.0
description: |
  Register a typed, AI-callable tool via usePilotAction. The handler runs
  in the browser against the consumer's React state, auth'd fetch, or any
  other client-side capability. Zod schema is inferred into the handler's
  argument type. Use when adding a new capability (create X, update Y,
  trigger Z) and includes `mutating:` flag guidance.
triggers:
  - "usePilotAction"
  - "add a tool"
  - "let the AI do X"
  - "register a handler"
  - "mutating action"
  - "make the AI able to"
tools:
  - edit_file
  - read_source
mutating: true
---

# Register Action

## Contract

By the end of this skill the consumer has:

- A call to `usePilotAction` inside a `<Pilot>` subtree.
- A Zod schema for the parameters, precise enough that a malicious or
  confused LLM can't produce inputs that break the handler.
- An explicit decision on the `mutating` flag.
- A handler that either returns a JSON-serializable result (so the
  assistant can narrate the outcome) or throws. Keep in mind that the
  error message gets streamed to the model verbatim.

## Iron Law: validate destructive actions with `mutating: true`

Any action that deletes data, spends money, sends an email, or otherwise
produces a side effect the user would want to reverse MUST set
`mutating: true`. The provider intercepts these and shows a
`window.confirm()` prompt before the handler fires (see
`packages/agentickit/src/components/pilot-provider.tsx` lines 376-394).
Omitting the flag on a destructive action means the AI can call it
silently. **If in doubt, set the flag. A spurious confirm dialog costs
one click; a wrongful delete costs trust.**

## Phases

### Phase 1: decide the name and shape

Tool names must be stable (the LLM reasons across turns using the name)
and snake_case or kebab-case (compatible with every major provider's
tool-naming rules, noted in `packages/agentickit/src/hooks/use-pilot-action.ts`
lines 20-22).

```
add_todo
archive_card
send_invoice
apply_discount
```

Avoid overly generic names (`do_thing`, `update`). Avoid names that
collide with auto-generated ones: `update_<stateName>` is reserved for
`usePilotState` setters.

### Phase 2: write the parameters schema

Every field the handler needs, with `.describe()` where the LLM needs
disambiguation:

```tsx
import { z } from "zod";

const params = z.object({
  cardId: z.string().describe("The id of the kanban card to archive."),
  reason: z
    .enum(["done", "wont-fix", "stale"])
    .optional()
    .describe("Why it was archived. Omit when unknown."),
});
```

The schema is parsed at execution time via `action.parameters.parse(toolCall.input)`
(`pilot-provider.tsx` line 397). Parse failures are surfaced to the model as
an `output-error` so it can self-correct.

### Phase 3: call the hook

```tsx
import { usePilotAction } from "agentickit";
import { z } from "zod";

usePilotAction({
  name: "archive_card",
  description: "Archive a kanban card by its id.",
  parameters: z.object({
    cardId: z.string().describe("The id of the kanban card to archive."),
  }),
  handler: async ({ cardId }) => {
    await api.archive(cardId);
    return { ok: true, cardId };
  },
  mutating: true,
});
```

The signature (verified against `use-pilot-action.ts` lines 18-54):

```ts
interface UsePilotActionOptions<TParams, TResult> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams) => Promise<TResult> | TResult;
  mutating?: boolean;
}
```

The hook returns `void`. Cleanup is handled on unmount; see lines 86-88.

### Phase 4: pick `mutating`

Set `mutating: true` when any of these is true:

- The handler writes to a persistent store (DB, localStorage, remote API).
- The handler sends an email, SMS, or webhook.
- The handler spends money or incurs cost.
- The handler removes data.
- The handler triggers a workflow the user can't cancel.

Set `mutating: false` (the default; just omit) when the handler only
reads, queries, computes, or derives. Examples: `summarize_board`,
`find_card_by_title`, `count_overdue_todos`.

### Phase 5: return a narratable result

The assistant sees the handler's return value on its next step (it's
serialized into the tool output; see `pilot-provider.tsx` lines 398-403).
Good returns:

```ts
return { ok: true, id: created.id };
return { ok: false, reason: "No matching card." };
return { summary: "Archived 3 cards from 'Done'." };
```

Avoid returning entire objects loaded with secrets or unrelated fields;
everything you return goes to the LLM provider. If the action is pure
side-effect, `return { ok: true }` is enough.

### Phase 6: handle failures explicitly

Throwing is fine. The provider catches and reports the error text to the
model (`pilot-provider.tsx` lines 404-410). But if you know the common
failure, return a structured result instead so the assistant can
narrate it usefully:

```ts
handler: ({ id }) => {
  const todo = store.find(id);
  if (!todo) return { ok: false, reason: "No todo with that id." };
  // ... proceed
}
```

## Anti-Patterns

- `z.any()` / `z.unknown()` on parameters. Parsing becomes a no-op; the AI
  can inject arbitrary shapes.
- Re-creating the Zod schema inline on every render without the guard of
  `use-pilot-action.ts` line 61-62. The hook handles it, but it's still
  cheaper and clearer to hoist the schema.
- Registering a read-only query with `mutating: true`. Every call now
  pops a confirm dialog; users quickly learn to click "allow" reflexively,
  and the flag loses its signal.
- Registering the same `name` from two components. The latter wins (see
  `registerAction` duplicate-name warning in `pilot-provider.tsx` lines
  92-100), but you've just created a confusing override.
- Returning the literal `undefined`. The AI SDK will coerce it, but
  downstream providers differ in how they handle undefined tool outputs.
  Return an object with at least `{ ok: true }`.

## Output Format

After registering, report:

- The action `name` and one-line description.
- The parameter shape (inline Zod or a hoisted schema name).
- `mutating: true|false` and why.
- Expected return shape.

## Tools Used

- Edit the component file to add the `usePilotAction` call.
- Read `packages/agentickit/src/hooks/use-pilot-action.ts` to confirm the
  options shape.
