# Convention: quality

Cross-cutting rules that apply to every change in this repo. Read before
you edit any file under `packages/agentickit/src/` or `examples/`.

## Ground truth ordering

1. **Code** under `packages/agentickit/src/` is ground truth.
2. **Tests** under `packages/agentickit/*/` are the executable contract.
3. **READMEs** (`README.md`, `packages/agentickit/README.md`) describe the
   public shape.
4. **`.pilot/skills/*`** are procedures for agents.

If (3) or (4) drifts from (1), fix the doc. If (2) drifts from (1), one of
them is wrong — investigate before editing either.

## Type safety is non-negotiable

- No `any`. Use `unknown` + narrow at the boundary.
- No `@ts-ignore` / `@ts-expect-error` without a one-line comment explaining
  exactly which future change removes the need for it.
- Zod schemas parse at every trust boundary — both the `useChat` POST body
  (see `server/handler.ts` `requestBodySchema`) and every `usePilotAction`
  handler (the schema is parsed with `action.parameters.parse(toolCall.input)`
  in `components/pilot-provider.tsx`).

## The three runtime deps

`ai`, `@ai-sdk/react`, `zod`, `nanoid`. Adding a fifth is a cross-cutting
decision — get it reviewed. Peer deps (`react`, `react-hook-form`, the
`@ai-sdk/*` adapters) are either optional or well-established; don't add
new required peers.

## Server / client boundary

- `packages/agentickit/src/server/` is Node/Edge only. Never import from it
  into hooks or components.
- `packages/agentickit/src/hooks/` and `components/` are `"use client"`.
  Never import Node-only APIs there.
- `packages/agentickit/src/protocol/` is isomorphic — it runs in both and
  must stay dependency-free of `react`, `next`, or Node built-ins beyond
  what browsers ship.

## Idempotent registrations

Every hook (`usePilotAction`, `usePilotState`, `usePilotForm`) must be
safe under React 18 strict-mode double invocation. That means:

- `useEffect` cleanups deregister exactly what the effect registered.
- Registration IDs come from `generateId()` (from `ai`), not from user input.
- Re-registering the same `name` replaces, not duplicates (see
  `registerAction` in `components/pilot-provider.tsx` for the canonical
  duplicate-name warning path).

## Fail-soft for the protocol layer

`.pilot/manifest.json` may be missing, malformed, or unreachable. The
package must still work. See `Pilot` in `components/pilot-provider.tsx` —
the manifest fetch is wrapped in try/catch and swallowed in prod. Preserve
that property.

## Never leak stack traces to clients

`server/handler.ts` wraps `streamText` in try/catch and returns a narrow
`PilotErrorBody` envelope (`{error, code}`). Don't add `error.stack` to
responses. Log server-side, report sanitized messages.

## Validation before edit

Before writing TypeScript in a SKILL.md or README snippet, confirm the
exact signature by reading the matching file under `packages/agentickit/src/`.
The canonical signatures are:

| Symbol | File |
|--------|------|
| `usePilotAction` | `packages/agentickit/src/hooks/use-pilot-action.ts` |
| `usePilotState` | `packages/agentickit/src/hooks/use-pilot-state.ts` |
| `usePilotForm` | `packages/agentickit/src/hooks/use-pilot-form.ts` |
| `Pilot`, `PilotProps` | `packages/agentickit/src/components/pilot-provider.tsx` |
| `PilotSidebar`, `PilotSidebarProps` | `packages/agentickit/src/components/pilot-sidebar.tsx` |
| `createPilotHandler`, `ModelSpec` | `packages/agentickit/src/server/handler.ts` |

If a snippet you're about to write doesn't match these, you're wrong and
the code is right.
