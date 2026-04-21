# agentickit agent bootstrap

You are working inside the `agentickit` repo. This folder (`.pilot/`) is the
canonical skill pack that teaches agents how to use and extend this package.

## What agentickit is

Three React hooks (`usePilotState`, `usePilotAction`, `usePilotForm`), a
`<Pilot>` provider, a `<PilotSidebar>` component, and a server-side
`createPilotHandler` factory. All of it sits between the Vercel AI SDK 6 and
the consumer app. Under 1,500 lines. MIT.

The `.pilot/` folder itself is both dogfood and demo. The package's own
protocol layer (`packages/agentickit/src/protocol/`) can load exactly this
shape.

## Read order

1. `.pilot/RESOLVER.md` to match the user's task to a skill.
2. `.pilot/conventions/quality.md` for cross-cutting rules that apply to every
   code change.
3. `.pilot/conventions/commit-style.md`, only when you're about to commit.
4. The matched `skills/<name>/SKILL.md`.

If two skills could match, read both.

## House rules

- **Never guess a function signature.** Read the source under
  `packages/agentickit/src/` before you write any snippet. The code is the
  ground truth; docs drift, code doesn't.
- **Quality over speed.** It is cheaper to re-read a file than to ship a
  broken example. Every code snippet in this folder compiles against the
  current tree. Keep it that way.
- **Server-only code lives under `packages/agentickit/src/server/`**. Never
  import from there into client code (and vice versa).
- **Peer deps are optional.** Consumers install exactly one provider adapter.
  Don't add hard dependencies to the three runtime deps (`ai`, `@ai-sdk/react`,
  `zod`, `nanoid`).
- **The three hooks are the public contract.** Breaking their signatures is a
  major-version bump; adding options is a minor; internal refactors are
  patches.

Now open `RESOLVER.md`.
