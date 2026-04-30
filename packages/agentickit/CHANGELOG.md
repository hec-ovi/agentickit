# Changelog

All notable changes to `@hec-ovi/agentickit` will be documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added, Phase 1: UI form factors

- **`<PilotChatView>`** (`src/components/pilot-chat-view.tsx`), headless chat body shell with messages, error banner, suggestion chips, optional skills panel, and composer. Imperative `focus()` / `prefill()` via ref. Used internally by every form factor and exported as the public extension point for consumers building custom chrome.
- **`<PilotPopup>`** (`src/components/pilot-popup.tsx`), floating-bubble form factor. Circular toggle button anchored to one of four viewport corners (`bottom-right`, `bottom-left`, `top-right`, `top-left`). Toggle hides while open (Intercom/Drift convention); single close affordance via header X. `aria-modal="false"` since the page behind remains interactive.
- **`<PilotModal>`** (`src/components/pilot-modal.tsx`), controlled-only centered backdrop dialog. Portals via `createPortal` to `document.body`. `aria-modal="true"`, full Tab focus trap (cycles between first and last focusable in the dialog), Escape and backdrop-click close. Focus restores to the previously-focused element on close via a `useLayoutEffect` capture that runs before `<PilotComposer>`'s autoFocus `useEffect`, see comment in `pilot-modal.tsx` for the React effect-ordering rationale.
- **`pilot-chrome.tsx`** (`src/components/pilot-chrome.tsx`), shared utilities for all form factors: `PilotChromeLabels` / `PilotModalLabels` types, `resolveChromeLabels` / `resolveModalLabels` helpers (de-duplicates the per-component label resolvers), `createFocusRestoreHandle()`, `findFocusBounds()` selector helper, and shared `PilotCloseIcon` / `PilotChatIcon` SVG components.
- **CSS** for the new chromes in `pilot-sidebar-styles.ts`: `.pilot-chat-view` body shell, `.pilot-popup-button` + `.pilot-popup-card` with `data-position` corner anchors, `.pilot-modal-backdrop` + `.pilot-modal-card` + `pilot-modal-rise` keyframe. `prefers-reduced-motion` rule extended to cover the new animations.
- **33 new tests** across `pilot-chat-view.test.tsx` (10), `pilot-popup.test.tsx` (12), `pilot-modal.test.tsx` (14, including 3 focus-trap and focus-restore assertions). Every test mocks `fetch` or wraps the components in a stub `PilotChatContext.Provider`; no API credit consumed.

### Changed, Phase 1

- **`<PilotSidebar>`** refactored to delegate the body to `<PilotChatView>` and use the shared `pilot-chrome.tsx` helpers. DOM contract preserved, all 11 existing sidebar tests pass unchanged.
- **`<PilotConfirmModal>`** is unchanged but now sits next to a sibling `<PilotModal>` portal-based modal; both share the same backdrop-click semantics (only fire close when target === currentTarget).

### Test status, Phase 1

Baseline before phase: 170 passing across 15 files. After phase: **206 passing across 18 files. Zero regressions. `pnpm typecheck` clean. `pnpm build` succeeds.**

### Added, Phase 2: renderAndWait (HITL pause-and-resume)

- **`PilotActionRegistration.renderAndWait?: PilotRenderAndWait<TParams, TResult>`** (`src/types.ts`), optional render prop that replaces `handler` at dispatch time. The provider mounts the returned ReactNode and suspends the SDK's `onToolCall` on a Promise that resolves via `respond(value)` (sends `value` as the tool output) or `cancel(reason)` (sends `{ ok: false, reason }`). Two new exported types: `PilotRenderAndWait` (the function shape) and `PilotRenderAndWaitArgs` (`{ input, respond, cancel }`).
- **`usePilotAction`** now accepts `renderAndWait` and threads it through a stable ref so render-prop closures don't churn the registry.
- **`<Pilot>`** added a `pendingHitl` slot mirroring `pendingConfirm`. In `onToolCall`: parse Zod input, optionally gate behind the confirm modal (when `mutating: true`), then either invoke `handler` OR mount the consumer's `renderAndWait` UI and await `respond` / `cancel`. The HITL UI renders next to the confirm modal in the provider tree.
- **Auto-cancel on action unmount.** `deregisterAction` now checks whether the dying action is currently suspended in either `pendingHitl` or `pendingConfirm` and auto-resolves with the standard cancel sentinel (`"Action unmounted."` or the existing `"User declined."`). Prevents the SDK loop from hanging when a consumer's component unmounts mid-suspension.
- **`mutating` + `renderAndWait` compose.** Confirm modal gates first; on approval, the HITL UI mounts; on decline, the standard "User declined." sentinel is returned and the HITL UI is never created.
- **8 new integration tests** in `src/components/pilot-render-and-wait.test.tsx` covering: basic respond path, cancel path, mutating+approve+respond combo, mutating+decline (HITL never mounts), respond-twice idempotency, respond-after-cancel idempotency, action-unmounted-mid-suspension auto-cancel, and re-render isolation. Every test mocks `fetch` via the existing `installPilotFetchMock` helper, no API credit consumed.

### Test status, Phase 2

Before phase: 206 passing across 18 files. After phase: **214 passing across 19 files. Zero regressions. `pnpm typecheck` clean. `pnpm build` succeeds.**

### Added, Phase 3a: runtime abstraction

Phase 3a extracts the chat-stream layer beneath `<Pilot>` into a swappable `PilotRuntime` interface. The default behavior is unchanged; a future `agUiRuntime({ runtimeUrl, agentId })` (Phase 3b) can drop in next to `localRuntime()` without touching the provider.

- **`PilotRuntime` interface** (`src/runtime/types.ts`): a `{ useRuntime }` hook factory. `PilotRuntimeConfig` carries the protocol-agnostic seam: `headers`, `getSnapshot`, `onToolCall`. Connection-shaped fields (URL, agent id, model id) live on the runtime's CONSTRUCTOR rather than per-render config so AG-UI runtimes don't have to pretend to have an `apiUrl`.
- **`PilotIncomingToolCall`** (`src/runtime/types.ts`): the runtime-to-provider tool-call shape. The provider settles a dispatch via terminal `output(value)` or `outputError(text)` callbacks; the runtime is responsible for getting the result onto its own wire (LocalRuntime calls `chat.addToolOutput`; AgUiRuntime will emit a `TOOL_CALL_RESULT` event).
- **`localRuntime(options?)`** (`src/runtime/local-runtime.ts`): construct the default AI-SDK-6-over-HTTP runtime. `options.apiUrl` defaults to `"/api/pilot"`. Calling with no args returns a stable module-level singleton, custom options create fresh wrappers (memoize per-render). Owns `DefaultChatTransport`, `useChat`, the SDK-shape-to-runtime-shape adapter in `onToolCall`, and `lastAssistantMessageNeedsContinuation`.
- **`<Pilot runtime={...}>` prop**: when supplied, replaces the auto-constructed default. The provider memoizes over `[props.runtime, apiUrl, model]` so identity is stable across unrelated parent re-renders.
- **`<Pilot>` refactored** (`src/components/pilot-provider.tsx`): the provider keeps the registry, the pendingConfirm and pendingHitl slots, the confirm/HITL render output, and the dispatcher (now `handleToolCall`, which receives a `PilotIncomingToolCall` and resolves via `call.output` / `call.outputError` instead of poking `chatRef.current.addToolOutput`). `useChat`, `DefaultChatTransport`, `zodSchema`, `buildToolsPayload`, `buildStateContext`, and `lastAssistantMessageNeedsContinuation` all moved to `runtime/local-runtime.ts`.
- **17 new tests across two files:**
  - `src/runtime/local-runtime.test.ts` (8 tests): unit tests for `lastAssistantMessageNeedsContinuation` against scripted message arrays.
  - `src/runtime/runtime-swap.test.tsx` (9 tests): the swap path is exercised end-to-end. Stub runtime captures the provider's seam config; messages from a custom runtime flow into a `<PilotChatView>`; the dispatcher receives runtime-emitted tool calls; unknown tools route to `outputError`; the registry is live-visible through `getSnapshot`; `chat.error` from a custom runtime surfaces in the UI; **`mutating` and `renderAndWait` actions still gate correctly when a custom runtime drives the dispatch**, the seam doesn't bypass the provider's HITL primitives.
- **Public API additions** (`src/index.ts`): `localRuntime` (function), `PilotRuntime` / `PilotRuntimeConfig` / `PilotIncomingToolCall` (types).

### Changed, Phase 3a

- **`PilotConfig.apiUrl` is now optional** (no behavioral default at the type level). When omitted and no `runtime` prop is supplied, `localRuntime()` defaults internally to `"/api/pilot"`. Behavior is unchanged for existing consumers.
- **`lastAssistantMessageNeedsContinuation` moved** from `pilot-provider.tsx` to `runtime/local-runtime.ts` and is no longer re-exported from the provider. The function is package-internal (never in `index.ts`); test imports were updated to point at the new home.

### Test status, Phase 3a

Before phase: 214 passing across 19 files. After phase: **223 passing across 21 files. Zero behavioral regressions.** The net delta is +9 tests (lost 8 duplicate `lastAssistantMessageNeedsContinuation` cases that moved between files, gained 17 new ones across the two new test files). `pnpm typecheck` clean (including the `examples/todo` workspace). `pnpm build` succeeds.

### Not yet verified end-to-end (Phases 1 + 2)

Phases 1 and 2 ship with vitest + happy-dom + scripted-SSE coverage only. The following are **not** verified and are pending a real-browser smoke pass before a 0.2.0 release tag:

- **Real browser visual rendering.** All new CSS (`.pilot-chat-view`, `.pilot-popup-button`, `.pilot-popup-card`, `.pilot-modal-backdrop`, `.pilot-modal-card`, `pilot-modal-rise` keyframe) was added but never rendered in a real viewport. happy-dom does not run CSS, so flexbox layout, paint order, animations, and `prefers-reduced-motion` collapse are unverified.
- **Real-browser focus trap on `<PilotModal>`.** The Tab-cycle assertions pass in happy-dom, but real browsers route Tab through the DOM with subtleties (display none + tabindex, hidden iframes, nested portals) that the synthetic test environment does not replicate.
- **`examples/todo` app build + runtime smoke.** The example was not rebuilt or run after the `index.ts` export additions and the sidebar refactor. If a consumer imports `PilotPopup` / `PilotModal` from `@hec-ovi/agentickit`, the package compiles, but the example app's actual behavior under Vite + Hono is unconfirmed.
- **Visual regression on the refactored sidebar.** DOM contract is preserved (all 11 existing sidebar tests pass), but a CSS rule could still misalign the body-vs-header-vs-composer flexbox in a real viewport.
- **`renderAndWait` against a real model.** Verified only against scripted `tool-call → text-reply` SSE frame sequences from `installPilotFetchMock`. Behavior against an actual vLLM / OpenAI / Anthropic streaming response, including edge cases like model retry mid-suspension or partial tool-input deltas, is unconfirmed.
- **vLLM smoke** for either phase. Phase 1+2 are pure UI/dispatcher work and should not interact with the existing vLLM Responses-API shim, but the example was not run against vLLM to confirm.

These are tracked here so a future session (or another contributor) knows what level of verification was actually achieved before sealing the phases.

## [0.1.0], 2026-04-22

First public release, published as **`@hec-ovi/agentickit`** (scoped to the author's npm namespace; the bin stays `agentickit`). Feature-complete against the planned v0.1 scope; tested end-to-end against a local vLLM server running `openai/gpt-oss-120b`. See the [Testing](https://github.com/hec-ovi/agentickit#testing) section in the root README for the full verified-flows list.

### Added

- **Three hooks**, `usePilotState`, `usePilotAction`, `usePilotForm`. Zod-typed, idempotent under React 18 strict mode, last-wins on duplicate names.
- **`<Pilot>` provider**, owns the tool / state / form registry, drives AI SDK 6's `useChat`, dispatches tool calls to registered handlers, manages the confirm-modal lifecycle (approve / decline / auto-confirm window). `headers`, `apiUrl`, `model`, and `renderConfirm` props.
- **`<PilotSidebar>` component**, slide-in chat panel with dark mode, CSS-variable theming, keyboard shortcuts, suggestion chips, stop-generating button, error banner. Full a11y surface (`role="complementary"`, live regions, focus management).
- **`<PilotConfirmModal>`**, themed modal for `mutating: true` actions. Consumers can override via `renderConfirm`.
- **`createPilotHandler`**, one-line Next.js App Router / Bun / Cloudflare Workers / Hono route factory. Six allow-listed provider prefixes (`openai`, `anthropic`, `groq`, `openrouter`, `google`, `mistral`) via optional peer adapters, plus Vercel AI Gateway fallback and a `LanguageModel`-instance escape hatch for anything outside the registry (Ollama, Azure, Bedrock).
- **Auto-detection**, omitting `model` walks the environment and picks a provider by the first configured API key. Throws at factory time if nothing is configured.
- **`.pilot/` markdown protocol**, `RESOLVER.md` routing + `skills/<name>/SKILL.md` frontmatter, auto-loaded by `createPilotHandler` at startup from `./.pilot/` (override with `pilotDir`, disable with `system: false`). Frontmatter is a strict superset of Anthropic's Agent Skills spec and Garry Tan's gbrain convention.
- **`agentickit` CLI**, `init` + `add-skill <name>` commands emit the canonical markdown shape the parser accepts. Kebab-case validation, duplicate-name refusal, missing-folder guidance.
- **Observable server**, `debug` / `log` / `onLogEvent` options on `createPilotHandler`. Streams a per-request structured transcript (tool calls with arguments, token usage split into reasoning + cached, finish reason, errors) to console, to append-only daily log files at `./debug/agentickit-YYYY-MM-DD.log`, and to an in-process subscriber that tests use for SSE visualization.
- **170 tests**, 15 files covering unit + integration + CLI. The 23-scenario integration suite mounts a real `<Pilot>` tree in happy-dom, replays scripted SSE frames, and asserts on exact fetch counts so infinite-resubmit regressions fail CI before they ship.
- **Runnable example**, `examples/todo` is a Vite + Hono app with a todo list, a `react-hook-form` contact form, a preferences widget, and a live tool-call log panel. `.pilot/` was scaffolded via the bundled CLI, dogfoods the `init` + `add-skill` flow end-to-end.

### Fixed during v0.1 live testing

- **vLLM / `@ai-sdk/openai` Responses-API tool-call lifecycle.** vLLM streams tool-input JSON deltas but never emits the completion marker `useChat` needs to fire `onToolCall`, so the tool part stuck in "preparing" forever. The handler now auto-switches the OpenAI adapter to the Chat Completions path (`openai.chat(modelId)`) whenever `OPENAI_BASE_URL` is set, which covers every OpenAI-compatible server (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra).
- **Infinite resubmit after text reply.** `lastAssistantMessageNeedsContinuation` used to return `true` if any part in the last assistant message had a completed tool output. Once the model's final text landed, every re-check kept firing a new POST that produced the same text forever. Fixed by walking parts from the tail and stopping at the first text/reasoning part. A dedicated integration test asserts the exact post count on a three-tool-then-text conversation.
- **`.pilot/` auto-load under ESM runtimes (tsx / Vite / Bun).** The loader used a runtime `require("node:module")` call that tsup's ESM shim rejected, silently masking auto-load in every ESM server. Rewritten to use a top-level `import { createRequire } from "node:module"`.
- **CLI script-entrypoint detection under pnpm / npm workspaces.** `import.meta.url === file://${argv[1]}` fails when the binary is reached through a symlink (every pnpm install). Now compares via `fs.realpathSync` on both sides.

### Known not-yet-verified

- No live smoke against a hosted provider (OpenAI, Anthropic, Groq, OpenRouter, Google, Mistral), those paths are covered by mocked handler tests only.
- No live Next.js App Router smoke; the runnable example is Vite + Hono.
- No CI pipeline yet.

These are the reasons this is 0.1, not 1.0.
