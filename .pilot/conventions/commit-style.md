# Convention: commit style

How to commit to this repo. Read before you run `git commit`.

## Only commit when explicitly asked

Do not create commits on your own initiative. If the user said "save this"
or "stage these changes" without saying "commit", stop and ask.

## Conventional-commits-ish, short form

The repo's history (`git log --oneline`) follows a condensed version of
conventional commits:

```
feat(server): flexible provider architecture
feat(example): add todo-list example app
feat: <PilotSidebar> UI + READMEs + NOTICE
fix: opus security+correctness review
docs: sync READMEs with provider flexibility patch
chore: initial scaffold
```

Rules:

- **Type prefix** is mandatory: `feat`, `fix`, `docs`, `chore`, `test`,
  `refactor`.
- **Scope** is optional but useful when the change is area-scoped: `server`,
  `example`, `hooks`, `sidebar`, `protocol`.
- **Subject** is lowercase, imperative, no trailing period. Under 72 chars.
- **No body required for small changes.** For anything non-trivial, add a
  2-5 line body explaining *why*, not *what*.

## What not to do

- No emojis in commit messages.
- No "WIP" commits on `master`. Squash locally first.
- No `git commit -a`. Stage files explicitly so you don't accidentally
  commit generated artifacts, credentials, or screenshots.
- Never skip hooks (`--no-verify`) unless the user explicitly authorizes it.
- Never amend a commit that's already pushed; create a new one.

## Files that should never be committed

- `.env*` (except `.env.example`).
- `node_modules/`, `dist/`, `.next/`, `tsconfig.tsbuildinfo`.
- `Screenshot*` or any binary dropped into the repo root.
- Anything under `.agent/`; that's the research scratchpad.

If `git status` shows one of the above, ask before committing.

## When the user asks you to commit

1. Run `git status` to see what's actually staged.
2. Run `git diff --cached` to verify the diff matches what they asked for.
3. Run `git log -5 --oneline` to confirm you match the style above.
4. Stage specific files (never `git add -A` or `git add .` unless the user
   insists; a stray `.env` slipping in is a security incident).
5. Write the message as a heredoc to preserve newlines.
6. Run `git status` after the commit to confirm the working tree looks as
   expected.
