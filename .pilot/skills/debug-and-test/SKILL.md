---
name: debug-and-test
version: 1.0.0
description: |
  Run the workspace locally, the test suite, and the todo example. Covers
  the pnpm workspace layout, the `agentickit` build pipeline (tsup), the
  Vitest config, and the most common "why is this not working" symptoms.
  Use when something's broken or a contributor is trying to reproduce a
  bug.
triggers:
  - "run the tests"
  - "pnpm build"
  - "why is it not working"
  - "debug locally"
  - "reproduce the bug"
  - "run the example"
tools:
  - run_pnpm
  - read_source
  - read_logs
mutating: false
---

# Debug and Test

## Contract

By the end of this skill the agent can:

- Build the package locally (`pnpm --filter agentickit build`).
- Run the test suite (`pnpm --filter agentickit test`).
- Run the todo example against the local package
  (`pnpm --filter @agentickit-examples/todo dev`).
- Diagnose the most common failure modes with a specific fix.

## Iron Law: reproduce before you change

Never attempt a fix without first seeing the failure locally. The pnpm
workspace links `agentickit` from `packages/agentickit/dist/` into the
example. If `dist/` is stale, the example runs last build's behavior
and your "fix" targets the wrong tree. **`pnpm --filter agentickit build`
before every reproduction, no exceptions.**

## Phases

### Phase 1: understand the layout

```
agentickit/
  package.json              # workspace root (declares pnpm workspaces)
  pnpm-workspace.yaml       # workspace globs
  packages/
    agentickit/             # the published package
      src/
        index.ts            # public client exports
        hooks/              # usePilotState, usePilotAction, usePilotForm
        components/         # <Pilot>, <PilotSidebar>
        server/             # createPilotHandler
        protocol/           # .pilot/ loader
      dist/                 # tsup output, regenerated on build
      tsup.config.ts
      vitest.config.ts
  examples/
    todo/                   # consumes agentickit via the workspace link
      app/
        api/pilot/route.ts
        page.tsx
```

Always use absolute paths from repo root when editing. Never `cd`.

### Phase 2: build the package

```bash
cd /home/hector/workspace/test-task/agentickit
pnpm --filter agentickit build
```

Runs `tsup` (config at `packages/agentickit/tsup.config.ts`), producing
three entry points under `dist/`: `index`, `server`, `protocol`. Each
ships ESM + CJS + `.d.ts`.

If the build fails with a TypeScript error, the `src/` tree has a real
type bug — fix the source, not the build config.

### Phase 3: run the tests

```bash
pnpm --filter agentickit test
```

Runs Vitest once (`vitest run` in `package.json` scripts). Happy-DOM
environment. Fast; no external network.

For watch mode during iteration:

```bash
pnpm --filter agentickit test:watch
```

### Phase 4: run the example

```bash
pnpm --filter @agentickit-examples/todo dev
```

Starts Next.js on port 3000 against a fresh build of `agentickit`.

Before running, set a provider env var in `examples/todo/.env.local`:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

(See `skills/choose-provider/SKILL.md` for the supported keys.)

The example's route at `examples/todo/app/api/pilot/route.ts` omits
`model` — it relies on auto-detection. See
`skills/install-and-setup/SKILL.md` for the auto-detect priority list.

### Phase 5: rebuild-and-retry after source edits

The example imports from the built `dist/` via the workspace link, so:

```bash
pnpm --filter agentickit build && pnpm --filter @agentickit-examples/todo dev
```

For an iteration loop:

```bash
pnpm --filter agentickit dev   # tsup --watch in one terminal
pnpm --filter @agentickit-examples/todo dev   # next dev in another
```

### Phase 6: common failure modes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Example imports but types are `any` | Stale `dist/` | `pnpm --filter agentickit build` |
| "no model configured" on first message | No env var in example `.env.local` | Set `OPENROUTER_API_KEY` (or another supported key) |
| 500 `MODULE_NOT_FOUND` for `@ai-sdk/xxx` | Env var set but adapter not installed in the example | `cd examples/todo && npm install @ai-sdk/<provider>` |
| Sidebar renders but no messages appear | `<PilotSidebar>` outside `<Pilot>` tree | Move sidebar inside the provider |
| `usePilotAction` warning in console, no tool call | Hook called outside `<Pilot>` | Move the hook into a descendant of the provider |
| Manifest fetch fails silently | `.pilot/` folder not under `public/` | Move to `public/pilot/` so Next.js serves it |
| Tool call stalls the loop | Registered handler throws before `addToolOutput` | Catch in handler, return `{ ok: false, reason }` |
| Two tool calls with same name execute twice | Two components registered the same `name` | Pick unique names; check dev-mode warning |

### Phase 7: where to look when the code disagrees with the docs

Priority order, always:

1. `packages/agentickit/src/` — the source.
2. Tests under the same tree (if present) — executable contract.
3. `README.md` and `packages/agentickit/README.md` — consumer-facing narrative.
4. `.pilot/skills/*` — agent procedures.

If a `.pilot/skill` disagrees with (1) or (2), the skill is out of date.
Fix the skill. Report the drift in your final message.

## Anti-Patterns

- Editing `dist/` directly. It's regenerated on every build.
- Using `npm install` at the workspace root. Use `pnpm install` — this
  is a pnpm workspace and `npm install` will fight the lockfile.
- Bypassing the workspace link by installing `agentickit` from npm into
  the example. The local source becomes invisible to the running example;
  you'll chase ghosts.
- Running tests against the published package instead of `src/`. Vitest
  reads from `src/` via the config at `packages/agentickit/vitest.config.ts`;
  there's no reason to publish-and-retry.

## Output Format

After a debugging session, report:

- The exact command sequence that reproduced the failure.
- The file and line number of the root cause.
- The fix (as a diff summary, not a full patch — the caller can read
  the file).
- Any drift between docs and code you noticed along the way.

## Tools Used

- `pnpm --filter agentickit build` / `test` / `dev`.
- `pnpm --filter @agentickit-examples/todo dev`.
- Read source files under `packages/agentickit/src/`.
