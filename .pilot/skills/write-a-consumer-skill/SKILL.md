---
name: write-a-consumer-skill
version: 1.0.0
description: |
  Author a SKILL.md inside a consumer app's own `.pilot/` folder. Covers
  frontmatter shape (Anthropic + gbrain superset), the resolver table,
  and the binding contract that ensures the AI never sees a capability
  your app can't actually invoke. Use when a consumer wants to expose
  capabilities as editable markdown.
triggers:
  - "write a SKILL.md"
  - "add a skill"
  - ".pilot/ folder in my app"
  - "author a skill"
  - "skills folder for my copilot"
tools:
  - edit_file
  - read_source
mutating: true
---

# Write a Consumer Skill

## Contract

By the end of this skill the consumer has:

- A `.pilot/` folder inside their app (typically under `public/pilot/` so
  Next.js serves it as a static asset).
- A valid `RESOLVER.md` with at least one trigger row.
- A valid `manifest.json` listing every skill.
- One or more `skills/<name>/SKILL.md` files with frontmatter that parses
  under `packages/agentickit/src/protocol/skill.ts`.
- `<Pilot pilotProtocolUrl="/pilot">` wired so the runtime fetches the
  manifest at mount.
- A matching `usePilotAction` for every skill — skills without a binding
  are filtered out of the system prompt and never reach the model.

## Iron Law: every skill MUST have a matching `usePilotAction`

The runtime composes the system prompt from `manifest.skills.filter(s =>
registeredActionNames.has(s.name))` (see
`packages/agentickit/src/components/pilot-provider.tsx` lines 517-519).
Skills whose `name` doesn't match a registered action are dropped — the
LLM never learns they exist. This is a feature: you can ship the markdown
before the code and the model won't hallucinate a capability. **But a
SKILL.md with no `usePilotAction` named the same thing is dead weight
— it won't affect anything until a matching hook registers.**

## Phases

### Phase 1: create the folder

```
your-app/
  public/
    pilot/
      RESOLVER.md
      manifest.json
      skills/
        refund-order/
          SKILL.md
        fill-checkout/
          SKILL.md
      conventions/           # optional
        tone.md
```

`public/` because Next.js serves it verbatim. On other frameworks, put
the folder anywhere reachable by a plain HTTP GET from the browser.

### Phase 2: write one SKILL.md

Frontmatter required fields: `name` and `description`. Everything else is
optional. The parser (`packages/agentickit/src/protocol/skill.ts` lines
23-52) accepts this shape:

```markdown
---
name: refund-order
version: 1.0.0
description: |
  Refund a past order. Always confirms amounts over $100.
triggers:
  - "refund"
  - "cancel order"
  - "return"
tools:
  - get_order
  - issue_refund
mutating: true
---

# Refund Order

## Contract
- Never refund without fetching the order first.
- Amounts > $100 require explicit user confirmation.

## Phases
1. `get_order({ id })` — resolve the order.
2. If `order.total > 100`, summarize and ask the user to confirm.
3. `issue_refund({ orderId, amount })`.

## Anti-Patterns
- Do not refund partial line-items without checking `order.lineItems[]`.
- Do not batch refunds across orders.
```

Frontmatter rules that matter (enforced by `parseSkill`):

- The block is fenced by `---` top and bottom.
- `name` and `description` are required strings. A block scalar (`|`)
  is accepted for `description`.
- `triggers` and `tools` are string lists (leading `- `).
- `mutating` is a boolean (`true` / `false`).
- `allowed-tools` is accepted as a synonym for `tools` (Anthropic
  spelling) — see skill.ts line 46.
- Nested maps, anchors, and flow-style lists are NOT supported (the
  parser is a ~60-line mini-YAML). Stick to the shape above.

### Phase 3: write RESOLVER.md

Two columns, H2 sections, backtick-wrapped paths. The parser
(`packages/agentickit/src/protocol/resolver.ts`) recognizes:

```markdown
# Checkout Skill Resolver

## Always-on

| Trigger | Skill |
|---------|-------|
| "refund", "cancel order", "return" | `skills/refund-order/SKILL.md` |
| "fill checkout", "apply invoice" | `skills/fill-checkout/SKILL.md` |
```

Strict parser behavior (resolver.ts lines 31-76):

- Only rows starting with `|` are considered.
- The separator row (`|---|---|`) is skipped.
- The header row (`| Trigger | Skill |`) is skipped (case-insensitive).
- Skill cells must wrap a local path in backticks: `` `skills/foo/SKILL.md` ``.
- External pointers (starting with `GStack:`, `Check `, `Read `) are
  preserved but marked with `isExternalPointer: true` and the runtime
  skips them.

### Phase 4: write manifest.json

```json
{
  "version": 1,
  "resolver": "RESOLVER.md",
  "skills": [
    {
      "name": "refund-order",
      "path": "skills/refund-order/SKILL.md",
      "description": "Refund a past order. Always confirms amounts over $100.",
      "triggers": ["refund", "cancel order", "return"],
      "tools": ["get_order", "issue_refund"],
      "mutating": true
    }
  ],
  "conventions": []
}
```

Validated against `validateManifest` in
`packages/agentickit/src/protocol/manifest.ts` lines 42-59. Required
shape: `version: 1`, string `resolver`, array `skills`.

### Phase 5: wire `<Pilot pilotProtocolUrl>`

```tsx
<Pilot apiUrl="/api/pilot" pilotProtocolUrl="/pilot">
  {children}
  <PilotSidebar />
</Pilot>
```

On mount the provider fetches `<pilotProtocolUrl>/manifest.json`, then
(if `manifest.resolver` is set) the resolver. Failures are logged and
swallowed — the app still works, just without protocol-layer context
injection. See `components/pilot-provider.tsx` lines 236-278.

### Phase 6: register the matching action

```tsx
usePilotAction({
  name: "refund-order",           // EXACTLY matches SKILL.md `name:`
  description: "Refund a past order. Always confirms amounts over $100.",
  parameters: z.object({
    orderId: z.string(),
    amount: z.number(),
  }),
  handler: async ({ orderId, amount }) => {
    return await api.refundOrder({ orderId, amount });
  },
  mutating: true,
});
```

If the `name` strings don't match byte-for-byte, the skill is dropped
from the system prompt (the filter on `pilot-provider.tsx` line 518 is
a `Set.has`, not a fuzzy match).

### Phase 7: verify

Open DevTools Network tab on page load. Expect two requests:

1. `GET /pilot/manifest.json` → 200 with the JSON.
2. `GET /pilot/RESOLVER.md` → 200 with the markdown.

Then open the sidebar, trigger a phrase from the resolver, and expect the
assistant to call the corresponding action.

## Anti-Patterns

- Using complex YAML frontmatter (nested maps, flow-style lists, anchors).
  The mini-parser rejects them with a clear error, but it's easier to just
  use the shape above.
- Putting JS imports in a SKILL.md. The protocol is runtime-agnostic
  markdown. JS bindings live in `usePilotAction` (or, in a future release,
  `pilot.config.json` — but that isn't shipped yet).
- Skills without matching actions "as documentation". The runtime filters
  them out silently. If you want documentation, write prose; if you want
  a skill the AI can invoke, register the action.
- Writing a resolver with natural-language triggers that never appear in
  user speech. Triggers are matched loosely by the LLM via the system
  prompt; if no human would ever type your trigger, the skill won't fire.

## Output Format

After authoring, report:

- The skill `name`(s) created.
- The resolver triggers that route to each.
- The matching `usePilotAction` registrations (name + file path).
- Confirmation that `manifest.json` validates against the shape above.

## Tools Used

- Edit files under `public/pilot/`.
- Edit the component that registers the matching actions.
- Read `packages/agentickit/src/protocol/*.ts` to verify the shape the
  parser expects.
