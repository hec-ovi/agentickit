---
name: register-state
version: 1.0.0
description: |
  Expose a slice of React state to the AI with usePilotState. The value is
  serialized into every model turn; when a setter is provided, an
  `update_<name>` tool is auto-registered so the AI can propose
  whole-value replacements. Use when a consumer says "show the AI my
  data" or "let the AI read X".
triggers:
  - "usePilotState"
  - "expose state"
  - "show the AI my data"
  - "read-only context"
  - "update_ tool"
tools:
  - edit_file
  - read_source
mutating: true
---

# Register State

## Contract

By the end of this skill the consumer has:

- A call to `usePilotState` inside a `<Pilot>` subtree.
- A Zod schema that describes the value shape precisely enough for the LLM
  to produce valid updates.
- A decision about read-only vs. writable (setter supplied or omitted).
- Understanding that the hook **does not** return state. It only
  registers. State is owned by the consumer's `useState` / store.

## Iron Law: the schema must match the value

`usePilotState` takes `value: T` AND `schema: z.ZodType<T>`. When `setValue`
is supplied, the schema is also handed to the auto-generated
`update_<name>` action as its input schema (see
`packages/agentickit/src/hooks/use-pilot-state.ts` lines 100-113). If the
schema is looser than the TypeScript type (e.g. `z.any()` on a
`{ id: string }`), the AI will produce updates that pass validation but
break the consumer's app at runtime. **If you cannot write a precise Zod
schema, this state slice is not ready to expose.**

## Phases

### Phase 1: confirm the state shape

The hook is a registration, not a store. The consumer must already own the
state:

```tsx
const [total, setTotal] = useState(42);
```

### Phase 2: write the Zod schema

Match the TypeScript type exactly. For primitives:

```tsx
import { z } from "zod";
const totalSchema = z.number();
```

For complex objects, promote the schema to module scope and use
`z.infer<typeof schema>` for the corresponding TS type. This keeps the
two in lockstep (see `examples/todo/app/page.tsx` lines 16-24).

### Phase 3: call `usePilotState`

Read-only (AI can see `total` but cannot change it):

```tsx
import { usePilotState } from "@hec-ovi/agentickit";

usePilotState({
  name: "cart_total",
  description: "Current cart total in USD.",
  value: total,
  schema: z.number(),
});
```

Writable (AI can propose whole-value updates through the registered setter):

```tsx
usePilotState({
  name: "cart_total",
  description: "Current cart total in USD.",
  value: total,
  schema: z.number(),
  setValue: setTotal,
});
```

Passing `setValue` auto-registers an action named `update_cart_total` with
`mutating: true`, so the user will see a confirm prompt before the write
lands (see `use-pilot-state.ts` line 112). Do NOT also register a manual
`set_cart_total` action; it'll duplicate.

### Phase 4: name conventions

- `name` must be a stable identifier (snake_case recommended). It becomes
  the key the LLM sees in the `context` block and the suffix of
  `update_<name>` when a setter is supplied.
- Two components registering the same `name` triggers a dev-mode
  `console.warn` (see `components/pilot-provider.tsx` line 124-130);
  the later registration wins. Don't rely on this; pick unique names.

### Phase 5: verify

Open the sidebar, ask "what's the current cart total?". The assistant
should quote the number from the state. If it doesn't:

- Confirm the hook is inside `<Pilot>` (outside it, a dev warning fires
  and the hook is a no-op; see `use-pilot-state.ts` line 62-66).
- Confirm the value changes are propagating (the hook re-pushes via
  `updateStateValue` on every `value` identity change; see lines 91-94).

## Anti-Patterns

- Using `z.any()` or `z.unknown()` as the schema. The LLM gets no
  structural hint, and when `setValue` is supplied the `update_<name>`
  action is effectively unconstrained.
- Registering derived state. If `doneCount` is `todos.filter(t => t.done).length`,
  expose `todos` and let the model count. Derived state goes stale.
- Passing an inline `z.number()` on every render. It's safe (the hook
  stores the schema in a ref and reads lazily), but it's a code smell.
  Hoist the schema to module scope.
- Exposing secrets: auth tokens, PII, internal IDs. Whatever you register
  is serialized and sent to the model provider on every turn.

## Output Format

After registration, report:

- The state `name` and a one-line shape description.
- Whether it's read-only or writable.
- If writable: confirm the consumer knows an `update_<name>` tool now
  exists and will confirm before calling their setter.

## Tools Used

- Edit the component file to add the `usePilotState` call.
- Read `packages/agentickit/src/hooks/use-pilot-state.ts` to confirm the
  option shape is current.
