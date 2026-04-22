---
name: write-a-consumer-skill
version: 2.0.0
description: |
  Author a SKILL.md inside a consumer app's own `.pilot/` folder. Covers
  the scaffold CLI (`agentickit init` / `agentickit add-skill`), the
  frontmatter shape (Anthropic + gbrain superset), the RESOLVER.md
  routing table, and the binding contract that ties each SKILL.md to a
  registered `usePilotAction`. Use when a consumer wants to expose
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
  - run_command
mutating: true
---

# Write a Consumer Skill

## Contract

By the end of this skill the consumer has:

- A `.pilot/` folder at the root of their app (sibling to `package.json`
  and `app/` or `src/`), readable by the server at startup.
- A valid `RESOLVER.md` with at least one trigger row.
- One or more `skills/<name>/SKILL.md` files with frontmatter that parses
  under `packages/agentickit/src/protocol/skill.ts`.
- `createPilotHandler` in their API route (no `system` option needed —
  the handler auto-loads `.pilot/`).
- A matching `usePilotAction` for every capability the model should be
  able to invoke. A SKILL.md without a matching action still feeds the
  model instructions, but the model has nothing to call — lead with the
  action registration if you can.

## Iron Law: lead with the CLI

The CLI emits canonical markdown. Every hand-written shape is a chance
for a subtle format mistake the parser silently drops. Use:

```bash
npx agentickit init               # first time only, creates the folder
npx agentickit add-skill <name>   # per new capability, appends resolver row
```

Only hand-edit when the CLI can't express what you want (e.g. adding
prose between sections). Even then, open the CLI-generated file and
imitate its shape rather than inventing your own.

## Phases

### Phase 1: scaffold

```bash
cd your-app
npx agentickit init
```

Resulting layout:

```
your-app/
  .pilot/
    RESOLVER.md
    skills/
      example/
        SKILL.md
```

The folder lives at the app root because the server handler looks for
`./.pilot/` relative to `process.cwd()` at startup. Don't put it under
`public/` — the browser doesn't need to see it.

### Phase 2: add one skill

```bash
npx agentickit add-skill refund-order
```

Emits `.pilot/skills/refund-order/SKILL.md` with frontmatter
pre-filled (`name: refund-order`) and TODO markers in the body.
Appends a row to `.pilot/RESOLVER.md` under `## Skills`.

Edit both files. The SKILL.md body is plain prose the model reads
verbatim; the resolver row is one-line trigger text the agent uses to
route natural-language requests. Neither file is executed — it's
context.

### Phase 3: register the matching action

```tsx
usePilotAction({
  name: "refund_order",             // must EXACTLY match a tool name in SKILL.md
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

The `name` on the action must match a tool name listed in the SKILL.md
frontmatter `tools:` list. The action's `description` is what reaches
the model at tool-selection time; the SKILL.md body is context for
**when** to pick the tool.

### Phase 4: verify

```bash
pnpm dev
```

In the server terminal you should see:

```
[agentickit] auto-loaded .pilot/ (~N chars)
```

Send a user message matching one of the resolver triggers; the sidebar
shows the assistant calling your action. Turn on `debug: true` in
`createPilotHandler` to see per-step transcripts in the terminal and
appended to `./debug/agentickit-YYYY-MM-DD.log`.

## Canonical shapes (for hand-editors)

### SKILL.md

```markdown
---
name: refund-order
description: Refund a past order. Always confirms amounts over $100.
tools:
  - get_order
  - issue_refund
mutating: true
---

# When to use

Triggered by phrases like "refund", "cancel order", "return". Use for
any transaction the user wants to reverse.

# How to use

1. Call `get_order({ id })` to resolve the order.
2. If `order.total > 100`, summarize and ask the user to confirm.
3. Call `issue_refund({ orderId, amount })`.

# Anti-patterns

- Do not refund partial line-items without checking `order.lineItems[]`.
- Do not batch refunds across orders.
```

Frontmatter rules enforced by `parseSkill`:

- Block fenced by `---` top and bottom.
- `name` and `description` are required strings.
- `tools` / `allowed-tools` / `triggers` are string lists (leading `- `).
- `mutating` is `true` / `false`.
- Nested maps, anchors, and flow-style lists are NOT supported. Stick to
  the shape above.

### RESOLVER.md

```markdown
# Agent Resolver

You are a concise assistant for this checkout flow. Reply in short
markdown. Prefer calling tools over describing steps.

## Skills

| Trigger                            | Skill                          |
| ---------------------------------- | ------------------------------ |
| "refund", "cancel order", "return" | `skills/refund-order/SKILL.md` |
| "fill checkout", "apply invoice"   | `skills/fill-checkout/SKILL.md`|
```

`parseResolver` only reads:

- H2 (`##`) headings for section labels.
- Rows starting with `|`, excluding the `|---|---|` separator and the
  `| Trigger | Skill |` header (case-insensitive).
- Skill cells must wrap the path in backticks:
  `` `skills/<name>/SKILL.md` ``.
- Lines prefixed `GStack:`, `Check `, or `Read ` are preserved as
  external pointers (the runtime includes them in the prompt as
  reference text).

Anything else on a row is silently dropped today. The resolver validator
(v0.2) will warn instead.

## Anti-Patterns

- **Hand-writing a new skill when the CLI exists.** The CLI emits the
  canonical shape; hand-writing invites silent parse failures.
- **Putting JS imports in SKILL.md.** The protocol is runtime-agnostic
  markdown. Code bindings live in `usePilotAction`.
- **Skill `name` that doesn't match any tool or action.** The markdown
  still reaches the model (the body is prose), but the model has
  nothing to invoke. Match names byte-for-byte.
- **Natural-language triggers that no user would type.** The LLM matches
  triggers loosely, but a trigger like "initiate the recursive
  refundability evaluation" will never fire because no human speaks
  that way.
- **Putting `.pilot/` under `public/` or any bundler-served path.** It
  doesn't need HTTP access — the server reads it from the filesystem at
  startup.

## Output Format

After authoring, report:

- The skill `name`(s) created.
- The resolver triggers that route to each.
- The matching `usePilotAction` registrations (name + file path).
- Confirmation of a clean `[agentickit] auto-loaded .pilot/` line on
  dev-server startup.

## Tools Used

- `npx agentickit init` / `npx agentickit add-skill <name>` for
  scaffolding.
- Edit files under `.pilot/` for content.
- Edit the component that registers the matching `usePilotAction`.
- Read `packages/agentickit/src/protocol/*.ts` to verify what shapes the
  parser accepts when hand-editing.
