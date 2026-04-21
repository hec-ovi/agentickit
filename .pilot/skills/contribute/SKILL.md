---
name: contribute
version: 1.0.0
description: |
  Extend agentickit as a contributor — add a hook, a component, a
  provider prefix, a new protocol field, or an example. Covers the
  expected shape of a patch (src + test + docs), the size budget
  (<1,500 LoC total), and how to validate a change before sending a PR.
triggers:
  - "add a feature"
  - "contribute to agentickit"
  - "submit a PR"
  - "extend agentickit"
  - "new hook"
  - "new provider"
tools:
  - edit_file
  - run_pnpm
  - run_git
mutating: true
---

# Contribute

## Contract

By the end of this skill a contributor has:

- A change localized to the right file under `packages/agentickit/src/`.
- A matching test under the same package.
- Updated public docs: both READMEs when the surface changes, plus the
  relevant `.pilot/skills/*` if the procedure for consumers shifts.
- A green `pnpm --filter agentickit build` and `pnpm --filter agentickit
  test`.
- A commit message matching `conventions/commit-style.md`.
- Confidence that the total LoC is still within the package's budget
  (under 1,500 lines, per the README claim).

## Iron Law: the public surface is the four hooks + two components + handler

The entire external API is:

- `usePilotState`, `usePilotAction`, `usePilotForm`
- `<Pilot>`, `<PilotSidebar>`
- `createPilotHandler` (server)
- `parseResolver`, `parseSkill`, `loadManifest` (protocol)

Adding to this surface is a deliberate choice with ecosystem consequences.
**Every new export is a promise you'll maintain it. Shrink before you
grow; refactor before you add.**

## Phases

### Phase 1: scope the change

Before editing, write down in one paragraph:

- What the change enables that wasn't possible before.
- Whether it extends the public surface (new export) or refines an
  internal (same surface, different behavior).
- What file(s) will change.
- What test(s) will change.
- What doc sections will change.

If that paragraph is vague, the change isn't ready to code.

### Phase 2: find the right file

The layout under `packages/agentickit/src/` is narrow on purpose:

| Concern | File |
|---------|------|
| Public exports | `index.ts` |
| Client-side types | `types.ts` |
| React contexts | `context.ts` |
| Dev-mode helpers | `env.ts` |
| A hook | `hooks/use-pilot-*.ts` |
| The provider | `components/pilot-provider.tsx` |
| The sidebar (split) | `components/pilot-sidebar*.tsx` |
| The server handler | `server/handler.ts` |
| Server entry point | `server/index.ts` |
| `.pilot/` parsing | `protocol/resolver.ts`, `protocol/skill.ts`, `protocol/manifest.ts` |

Prefer editing an existing file over creating a new one. Every new file
is a new boundary someone has to reason about.

### Phase 3: write the test first

Vitest + happy-dom. Tests live adjacent to source (or under a `__tests__/`
sibling if preferred). Run locally with `pnpm --filter agentickit test:watch`.

Test shape we want:

- Happy path (canonical usage).
- Edge case (empty input, cleanup on unmount, two registrations).
- Failure mode (invalid schema, missing provider context).

### Phase 4: implement

Match the existing style:

- Opinionated TypeScript, no `any`.
- Comments describe *why*, not *what*.
- Zod at trust boundaries.
- Refs for volatile values to avoid thrashing registrations (see
  `use-pilot-action.ts` lines 57-64 for the canonical pattern).
- Dev-mode warnings for misuse (see `isDev()` in `env.ts` and usage
  throughout the hooks).

### Phase 5: update docs when the surface moves

When you change the public surface, update in this order:

1. `README.md` at the repo root (the narrative).
2. `packages/agentickit/README.md` (the npm description — often shorter).
3. `.pilot/skills/*/SKILL.md` for every skill whose procedure drifts.
4. Type exports in `packages/agentickit/src/index.ts` (and
   `server/index.ts`, `protocol/index.ts`).

Skip steps 1-2 for internal refactors that don't change the surface.
Always do (3) — the skills are the agent-facing contract.

### Phase 6: validate

```bash
pnpm --filter agentickit build
pnpm --filter agentickit test
pnpm --filter @agentickit-examples/todo dev   # smoke test in the example
```

All three green. Then — and only then — stage and commit.

### Phase 7: commit and push

Follow `.pilot/conventions/commit-style.md`. Quick template:

```bash
git add packages/agentickit/src/hooks/use-pilot-action.ts \
        packages/agentickit/src/hooks/__tests__/use-pilot-action.test.ts \
        README.md \
        packages/agentickit/README.md \
        .pilot/skills/register-action/SKILL.md

git commit -m "feat(hooks): <one-line summary>"
```

Do NOT use `git add -A` — a stray `.env`, screenshot, or `node_modules`
slipping in is a headache.

### Phase 8: size check

The package's tagline is "under 1,500 lines". After a change, confirm:

```bash
cloc packages/agentickit/src   # or any line-counter
```

If the change pushes past the budget, it's worth asking: is there an
existing file that shrinks? A comment that's too long? A helper that
could be inlined?

## Anti-Patterns

- Adding a new peer dependency casually. Every peer is a prompt for
  consumers to `npm install` something. The bar is high.
- Introducing a wrapper around an AI SDK type that just re-exports it.
  Consumers can import from `ai` directly.
- Writing docs before the code exists. READMEs lie when they describe
  vapor features. Ship the code first, then document it.
- Fixing a bug in the example and not in the package. The example is
  consumer code; the source of truth lives under `packages/agentickit/src/`.
- Editing `dist/`. It's generated.

## Output Format

After contributing, report:

- The change summary (1 sentence).
- The files touched (paths).
- Test coverage added (which test file + how many cases).
- Doc sections updated.
- LoC delta for the package.
- Proof that `build` and `test` are green.

## Tools Used

- `pnpm --filter agentickit build / test / test:watch`.
- Edit source, test, and doc files.
- `git add <specific files>`, `git commit -m`.
