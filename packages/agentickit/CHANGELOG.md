# Changelog

All notable changes to `@hec-ovi/agentickit` will be documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [0.1.0] — 2026-04-22

First public release, published as **`@hec-ovi/agentickit`** (scoped to the author's npm namespace; the bin stays `agentickit`). Feature-complete against the planned v0.1 scope; tested end-to-end against a local vLLM server running `openai/gpt-oss-120b`. See the [Testing](https://github.com/hec-ovi/agentickit#testing) section in the root README for the full verified-flows list.

### Added

- **Three hooks** — `usePilotState`, `usePilotAction`, `usePilotForm`. Zod-typed, idempotent under React 18 strict mode, last-wins on duplicate names.
- **`<Pilot>` provider** — owns the tool / state / form registry, drives AI SDK 6's `useChat`, dispatches tool calls to registered handlers, manages the confirm-modal lifecycle (approve / decline / auto-confirm window). `headers`, `apiUrl`, `model`, and `renderConfirm` props.
- **`<PilotSidebar>` component** — slide-in chat panel with dark mode, CSS-variable theming, keyboard shortcuts, suggestion chips, stop-generating button, error banner. Full a11y surface (`role="complementary"`, live regions, focus management).
- **`<PilotConfirmModal>`** — themed modal for `mutating: true` actions. Consumers can override via `renderConfirm`.
- **`createPilotHandler`** — one-line Next.js App Router / Bun / Cloudflare Workers / Hono route factory. Six allow-listed provider prefixes (`openai`, `anthropic`, `groq`, `openrouter`, `google`, `mistral`) via optional peer adapters, plus Vercel AI Gateway fallback and a `LanguageModel`-instance escape hatch for anything outside the registry (Ollama, Azure, Bedrock).
- **Auto-detection** — omitting `model` walks the environment and picks a provider by the first configured API key. Throws at factory time if nothing is configured.
- **`.pilot/` markdown protocol** — `RESOLVER.md` routing + `skills/<name>/SKILL.md` frontmatter, auto-loaded by `createPilotHandler` at startup from `./.pilot/` (override with `pilotDir`, disable with `system: false`). Frontmatter is a strict superset of Anthropic's Agent Skills spec and Garry Tan's gbrain convention.
- **`agentickit` CLI** — `init` + `add-skill <name>` commands emit the canonical markdown shape the parser accepts. Kebab-case validation, duplicate-name refusal, missing-folder guidance.
- **Observable server** — `debug` / `log` / `onLogEvent` options on `createPilotHandler`. Streams a per-request structured transcript (tool calls with arguments, token usage split into reasoning + cached, finish reason, errors) to console, to append-only daily log files at `./debug/agentickit-YYYY-MM-DD.log`, and to an in-process subscriber that tests use for SSE visualization.
- **170 tests** — 15 files covering unit + integration + CLI. The 23-scenario integration suite mounts a real `<Pilot>` tree in happy-dom, replays scripted SSE frames, and asserts on exact fetch counts so infinite-resubmit regressions fail CI before they ship.
- **Runnable example** — `examples/todo` is a Vite + Hono app with a todo list, a `react-hook-form` contact form, a preferences widget, and a live tool-call log panel. `.pilot/` was scaffolded via the bundled CLI — dogfoods the `init` + `add-skill` flow end-to-end.

### Fixed during v0.1 live testing

- **vLLM / `@ai-sdk/openai` Responses-API tool-call lifecycle.** vLLM streams tool-input JSON deltas but never emits the completion marker `useChat` needs to fire `onToolCall`, so the tool part stuck in "preparing" forever. The handler now auto-switches the OpenAI adapter to the Chat Completions path (`openai.chat(modelId)`) whenever `OPENAI_BASE_URL` is set, which covers every OpenAI-compatible server (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra).
- **Infinite resubmit after text reply.** `lastAssistantMessageNeedsContinuation` used to return `true` if any part in the last assistant message had a completed tool output. Once the model's final text landed, every re-check kept firing a new POST that produced the same text forever. Fixed by walking parts from the tail and stopping at the first text/reasoning part. A dedicated integration test asserts the exact post count on a three-tool-then-text conversation.
- **`.pilot/` auto-load under ESM runtimes (tsx / Vite / Bun).** The loader used a runtime `require("node:module")` call that tsup's ESM shim rejected, silently masking auto-load in every ESM server. Rewritten to use a top-level `import { createRequire } from "node:module"`.
- **CLI script-entrypoint detection under pnpm / npm workspaces.** `import.meta.url === file://${argv[1]}` fails when the binary is reached through a symlink (every pnpm install). Now compares via `fs.realpathSync` on both sides.

### Known not-yet-verified

- No live smoke against a hosted provider (OpenAI, Anthropic, Groq, OpenRouter, Google, Mistral) — those paths are covered by mocked handler tests only.
- No live Next.js App Router smoke; the runnable example is Vite + Hono.
- No CI pipeline yet.

These are the reasons this is 0.1, not 1.0.
