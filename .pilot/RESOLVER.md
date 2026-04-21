# agentickit Skill Resolver

This is the dispatcher for agents working with or inside `agentickit`.
Read `AGENTS.md` for the philosophy, then match your task below and
read the referenced skill file before acting.

## Always-on

| Trigger | Skill |
|---------|-------|
| Every task that edits code in this repo | `conventions/quality.md` |
| Every task that edits UI / styles / visual components | `conventions/ui-aesthetic.md` |
| Every commit | `conventions/commit-style.md` |

## Consumer-facing: using the package in a React app

| Trigger | Skill |
|---------|-------|
| "install", "set up", "add to my app", "getting started", "first time" | `skills/install-and-setup/SKILL.md` |
| "usePilotState", "expose state", "show the AI my data", "read-only context" | `skills/register-state/SKILL.md` |
| "usePilotAction", "add a tool", "let the AI do X", "register a handler", "mutating" | `skills/register-action/SKILL.md` |
| "usePilotForm", "fill this form", "react-hook-form", "progressive fill" | `skills/register-form/SKILL.md` |
| "which provider", "Groq", "OpenAI", "OpenRouter", "auto-detect", "Vercel Gateway", "Ollama" | `skills/choose-provider/SKILL.md` |
| "customize the sidebar", "theme", "labels", "left side", "width", "dark mode" | `skills/customize-sidebar/SKILL.md` |
| "server route", "createPilotHandler", "backend", "system prompt", "maxSteps" | `skills/write-custom-backend/SKILL.md` |

## Using the `.pilot/` protocol itself

| Trigger | Skill |
|---------|-------|
| "write a SKILL.md", "add a skill for my app", ".pilot/ folder", "author a skill" | `skills/write-a-consumer-skill/SKILL.md` |

## Internal: contributors to this repo

| Trigger | Skill |
|---------|-------|
| "run the tests", "debug locally", "why is it not working", "pnpm build" | `skills/debug-and-test/SKILL.md` |
| "add a feature", "submit a PR", "how to contribute", "extend agentickit" | `skills/contribute/SKILL.md` |

## Disambiguation rules

1. **Prefer the most specific skill.** `register-form` over `register-action`
   when the task involves a react-hook-form; `choose-provider` over
   `write-custom-backend` when the question is really "which env var".
2. **Consumer-facing vs contributor-facing.** When a task touches both the
   public API and the internal plumbing, consumer-facing skills take priority
   for examples; contributor skills take priority for the mechanics of
   running tests, builds, and commits.
3. **`.pilot/` authoring questions are separate.** "How do I write a skill
   for my app?" → `write-a-consumer-skill`. "How does agentickit's own
   `.pilot/` folder work?" → read the source under
   `packages/agentickit/src/protocol/`.
4. **When in doubt, ask the user.** A 5-second clarifying question beats a
   30-minute wrong-turn.
