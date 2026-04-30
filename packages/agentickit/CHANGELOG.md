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

### Hardening, Phases 1-3a (2026-04-27)

Pushback from the user on the testing bar. Three follow-ups:

- **Inline DOM-shape snapshots** added to `pilot-chat-view.test.tsx`, `pilot-popup.test.tsx`, and `pilot-modal.test.tsx` via `toMatchInlineSnapshot()`. Captures the exact rendered DOM (root wrapper, error banner, popup toggle, modal dialog header) so any unintended structural change (extra wrapper div, dropped `data-testid`, class rename) shows up as a focused diff in the test file.
- **Scripted-runtime user-flow tests** added to `runtime/runtime-swap.test.tsx`. The original Phase 3a swap tests verified the seam contract by calling the runtime's `onToolCall` directly, which is correct for proving the abstraction but doesn't exercise the user-driven path. The new tests use a `makeScriptedRuntime` helper that drives the dispatcher in response to `chat.sendMessage`, then verify the full flow with real `fireEvent.click` events: user sends a message, the runtime emits a tool call, the modal/HITL UI mounts, the user clicks confirm/respond/cancel, the result lands. Five scenarios: basic respond path, mutating + approve, mutating + decline, renderAndWait + respond, runtime-supplied error surfacing in the chat view. No fetch, no SSE wire, no API credit.
- **Real-browser smoke of `examples/todo`** via agent-browser CDP automation. Verified the page loads against the freshly-built dist, the sidebar renders with dark-mode CSS variables, the close-and-reopen lifecycle works in real DOM, and the layout reflows correctly when the sidebar collapses.

Test status after hardening: **234 passing across 21 files**. Net +11 tests since Phase 3a sealed (5 user-flow + 4 inline snapshots, plus 2 portaling/empty-state assertions on the modal).

### Added, Phase 3b: AG-UI runtime

Phase 3b ships a second `PilotRuntime` implementation, `agUiRuntime({ agent })`, that drives an AG-UI `AbstractAgent` from `@ag-ui/client@0.0.53`. Mounting `<Pilot runtime={agUiRuntime({ agent })}>` reuses every existing chrome (`<PilotSidebar>`, `<PilotPopup>`, `<PilotModal>`), the registry, the confirm-modal gate, and the `renderAndWait` HITL primitive on top of an AG-UI agent (LangGraph, CrewAI, Mastra, Pydantic AI, or any custom `AbstractAgent` subclass).

- **`agUiRuntime(options): PilotRuntime`** (`src/runtime/ag-ui-runtime.ts`), event-stream-to-`PilotChatContextValue` adapter. Subscribes to the agent via `agent.subscribe(subscriber)`, converts AG-UI's discriminated-union `Message[]` into the AI SDK 6 `UIMessage` shape `<PilotChatView>` consumes, maps lifecycle events (RUN_STARTED, TEXT_MESSAGE_*, TOOL_CALL_*, RUN_FINISHED, RUN_ERROR) onto `submitted | streaming | ready | error` status, and bridges client-side tool calls. Returns a stable runtime instance per agent reference (cached in a `WeakMap`) so `<Pilot>`'s memoization sees stable identity without consumer-side `useMemo`.
- **`usePilotAgentState<T>(agent): T | undefined`** (`src/runtime/ag-ui-runtime.ts`), reads the agent's current state via `useSyncExternalStore`. Re-renders the calling component whenever STATE_SNAPSHOT or STATE_DELTA arrives. Per-agent stores keyed by `WeakMap<AbstractAgent, AgentStore>` so multiple consumers share a single source of truth and stores get GC'd when their agent does.
- **`usePilotAgentActivity(agent): { activities, reasoning }`** (`src/runtime/ag-ui-runtime.ts`), surfaces the agent's activity messages and reasoning blocks (filtered out of the chat list) as separate streams for consumer rendering.
- **Optional peer dependencies.** `@ag-ui/client@^0.0.53` and `@ag-ui/core@^0.0.53` are declared with `peerDependenciesMeta.optional`. agentickit imports types from them via `import type` only; verified via `grep -c '@ag-ui/client' dist/index.cjs` returns 0. Consumers who only use `localRuntime` pay zero bundle cost.
- **Tool-call bridge with registry gate.** `onToolCallEndEvent` only dispatches if the tool is in the local registry (matching by name in `getSnapshot().actions`). Server-side tools that resolve via inline `TOOL_CALL_RESULT` are left to the server, no duplicate `role: "tool"` message is appended. Mutating actions still gate behind the confirm modal, `renderAndWait` still mounts HITL UI.
- **Continuation loop with safety cap.** After every `agent.runAgent()` resolves, the runtime checks whether any client tool was dispatched in the run; if so, it re-runs with the new `role: "tool"` message included in the agent's messages. Capped at 16 iterations; on overflow the runtime surfaces a chat error and stops the loop (also logs `console.warn`). Re-entry guard on `sendMessage` prevents two concurrent runs from interleaving when a programmatic caller bypasses the chat view's loading-state gate.
- **`prepareRunParameters` extension hook.** Optional callback on `AgUiRuntimeOptions` for injecting `forwardedProps` or extra tools/context per run. Tools and context CONCATENATE with the registry-derived defaults rather than replacing them, so `prepareRunParameters: () => ({ tools: [extra] })` adds an extra tool instead of nuking the registry's tools.
- **32 new tests** in `src/runtime/ag-ui-runtime.test.tsx` across 8 buckets:
  - `convertMessages` pure unit tests (8): user, assistant, tool fold, error fold, orphan tool calls, activity/reasoning filter, multimodal collapse, JSON parse fallback.
  - `<Pilot runtime={agUiRuntime}>` integration (6): empty-state, type+send happy path, immediate user-message render, RUN_ERROR banner, Observable-throw banner, registered-action tool list forwarded to runs.
  - Tool-call bridging (5): client-side dispatch + continuation, server-side tool not dispatched (registry gate), mutating + confirm gate, mutating + decline produces `ok:false` message, renderAndWait + respond.
  - State + activity hooks (5): seeds initial state, STATE_SNAPSHOT propagates, STATE_DELTA via JSON Patch, ACTIVITY_SNAPSHOT surfaces, multi-consumer single source of truth.
  - Stop / lifecycle (1): clicking 'Stop generating' aborts the run AND re-enables Send button.
  - Factory stability (4): same agent returns same runtime, different agents return different runtimes, `prepareRunParameters` bypasses cache, tools/context concatenate with overrides.
  - Continuation cap (1): 20-iteration tool-loop stops at 16, error surfaces in chat banner.
  - Re-entry guard (1): two concurrent `sendMessage` calls; only the first runs.

  All 32 tests use a `FakeAgent extends AbstractAgent` whose `run(input)` emits scripted events via rxjs `Observable` (`Promise.resolve().then(...)` for queue ordering). Real `fireEvent.change` on the composer + `fireEvent.click` on send / confirm / HITL respond throughout. No `fetch` mock needed; no API credit consumed.

### Changed, Phase 3b

- **`packages/agentickit/package.json`** declares `@ag-ui/client` and `@ag-ui/core` as optional peer dependencies plus matching dev dependencies (with `rxjs@7.8.1`). Both also added to `peerDependenciesMeta` with `optional: true`.
- **`packages/agentickit/src/index.ts`** exports `agUiRuntime`, `usePilotAgentState`, `usePilotAgentActivity`, `AgUiRuntimeOptions`.

### Phase 3b review applied

A `general-purpose` review agent audited the diff. MUST_FIX items applied:
- M1: Status now seeded from `agent.isRunning` so a remount mid-run reflects the agent's actual streaming state instead of falsely showing "ready".
- M2: `onToolCallEndEvent` gates on the tool being in the local registry. Server-side tools with inline `TOOL_CALL_RESULT` no longer get a duplicate client tool message + redundant follow-up run.
- M3: Factory caches the runtime per agent reference (`WeakMap<AbstractAgent, PilotRuntime>`). Consumers who write `<Pilot runtime={agUiRuntime({ agent })}>` without a `useMemo` get a stable identity by default.

SHOULD_FIX items applied:
- S1: Removed dead `headersRef`. AG-UI agents own their own headers at construction.
- S2: `stop()` resets `toolDispatchedRef` so the loop won't trigger a follow-up run after the user explicitly aborts.
- S3: `sendMessage` re-entry guard via `runningRef`.
- S5: 16-iteration cap surfaces an error and `console.warn`s the agent details.
- S6: `prepareRunParameters` tools and context CONCATENATE with the registry-derived defaults rather than replacing them.
- S4: Stop test now also asserts the Send button reappears after abort, not just that `abortRun` was called.
- N4: Dropped the `as AgUiTool` assertion in `buildTools`; the structural assignment passes the typechecker.

Items deliberately deferred to a follow-up (low value or not needed for v3b):
- N1 (extractActivity memoization) - cheap fix, defer until profiling shows churn.
- N5 (test event types tightened from `BaseEvent` to specific event types) - significant churn for marginal benefit; the apply pipeline runtime-validates so a typo in a test surfaces as a behavior failure anyway.
- Review notes confirmed by reviewer: type-only imports ARE tree-shaken (verified `grep -c '@ag-ui/client' dist/index.cjs` returns 0), `convertMessages` covers all seven AG-UI message roles, mutation-from-subscriber composes correctly with the apply pipeline, WeakMap stores have no leak path.

### Test status, Phase 3b

Before phase: 234 passing across 21 files. After phase: **266 passing across 22 files. Zero regressions. `pnpm typecheck` clean across the workspace, `pnpm build` succeeds, runtime bundle is `@ag-ui/client`-free.**

### Added, Phase 7: Multi-agent registry (Agent Lock Mode)

A multi-agent registry so consumers can publish several `AbstractAgent` instances under stable ids and switch between them at runtime via the existing runtime-swap mechanism. Composes naturally with everything from prior phases: hot-swappable runtime, generative UI, `usePilotAgentState`, the chat surfaces. No new APIs in `<Pilot>`; the consumer threads `useAgent(id)` into `agUiRuntime({ agent })`.

- **`<PilotAgentRegistry>`** (`src/components/pilot-agent-registry.tsx`), top-level provider that owns a `Map<string, AbstractAgent>` plus `useSyncExternalStore`-compatible subscribe / getSnapshot. Cached snapshot for `list()` so consumers reading via `useAgents()` see a stable reference between mutations. Last-wins on duplicate id with a dev-mode `console.warn` (mirrors the action / state registry's diagnostic behavior).
- **`useRegisterAgent(id, factory)`** (`src/hooks/use-register-agent.ts`), publishes an agent under a stable id. Constructs the agent exactly once via `useState`'s lazy initializer, registers on mount, deregisters on unmount via a `RegistrationHandle` carrying a monotonic token. The token disambiguates "stale cleanup from an unmounted instance" vs. "remove a fresh registration that took the same id", so a remount-under-replacement sequence converges correctly under React StrictMode and any other dev double-invocation.
- **`useAgent(id)`** (`src/hooks/use-agent.ts`), reads a registered agent by id via `useSyncExternalStore`. Returns `undefined` for unknown ids (or when no provider is mounted) and re-renders the calling component when the id is registered, replaced, or unregistered.
- **`useAgents()`** (`src/hooks/use-agents.ts`), lists every agent currently in the registry in registration order. Useful for picker UIs. Stable empty-array fallback when no provider is mounted so pickers can render in either context.
- **No `agent.abortRun()` in `useRegisterAgent` cleanup.** Aborting a run is a runtime-layer concern (the runtime owns the in-flight stream and exposes its own `stop` callback). If multiple `useRegisterAgent` calls share the same agent reference under different ids, an unmount-time abort on one would tear down a run the other registration's runtime is mid-stream on; the registry stays out of the way. Documented in the hook header.
- **20 new tests** across two files:
  - `src/hooks/use-register-agent.test.tsx` (14 unit tests): empty-mount, no-provider fallback, register-on-mount, factory-called-once-across-renders, deregister-on-unmount-without-abort, last-wins, stale-token-cleanup-safety, StrictMode convergence, undefined-then-registered-then-unregistered, list-in-registration-order, snapshot-reference-stability for `useAgents`, agent-reference-stability for `useAgent`.
  - `src/runtime/multi-agent.test.tsx` (7 integration tests): two-agent swap routes runs correctly, separate messages history per agent (preserved on swap-back), independent `usePilotAgentState` stores, registered actions dispatch only to the active agent's runtime, picker UI driven by `useAgents` stays in sync, zero React errors during rapid swaps (regression for Phase 3b polish runtime-bridge fix), AND a StrictMode variant of the rapid-swap test so the dev double-invocation can't break in a future refactor.
- **Example demo**: `examples/todo` extended with three agents (`research` / `code` / `writing`), each at its own URL (`/api/agui-research`, `/api/agui-code`, `/api/agui-writing`). The mock server has distinct scripted behaviors per agent (research streams the timeline; code returns a code-block; writing returns prose). The agent picker UI appears below the runtime picker when AG-UI is active. Switching agents demonstrates per-agent message history isolation.

### Public API additions, Phase 7

`src/index.ts` adds:
- `PilotAgentRegistry` (component)
- `useRegisterAgent`, `useAgent`, `useAgents` (hooks)
- `PilotAgentRegistryProps` (type)

`src/context.ts` adds:
- `PilotAgentRegistryContext` (context)
- `PilotAgentRegistryContextValue`, `RegistrationHandle` (types)

### Phase 7 review applied

A `general-purpose` review agent audited the diff. Findings applied:
- **M1 (must fix)**: `useRegisterAgent`'s cleanup no longer calls `agent.abortRun()`. Original behavior was unsafe for the shared-agent case (different `useRegisterAgent` calls aliasing the same agent under different ids); the runtime layer already handles run abort via its own `stop` callback. Test renamed accordingly and asserts `abortRun` is NOT called on unmount.
- **S1 (should fix)**: Provider's `register` now logs `console.warn` on duplicate-id replacement in dev, matching the action / state registry convention.
- **S3 (should fix)**: Added test for `useAgent(id)` reference stability between unrelated re-renders (no torn reads).
- **S4 (should fix)**: Added a StrictMode variant of the multi-agent rapid-swap integration test.
- **N1 (nit applied)**: `useRegisterAgent` switched from `useRef(null) + lazy init + null check` to `useState(factory)` for the more idiomatic React 19 pattern.
- **N3 (nit applied)**: Tightened `getAgent`'s docstring to clarify "agent reference under id is stable until replaced; each call performs a fresh lookup."

Items deliberately deferred:
- N2 (EMPTY constant for useAgent return) - not needed; primitives don't tear.
- N5 (accessibility on agent picker) - already correct (fieldset/legend/label-wraps-input).

### Test status, Phase 7

Before phase: 273 passing across 23 files. After phase: **294 passing across 25 files. Zero regressions. `pnpm typecheck` clean across the workspace, `pnpm build` succeeds.**

### Real-browser smoke, Phase 7 (2026-04-30)

`examples/todo` booted with multi-agent registry, driven via agent-browser CDP automation. Screenshots captured at `.research/agentickit-phases/screenshots/15-19-*.png`.

Verified end-to-end:

- **Three agents registered.** Switching the runtime picker to "agUiRuntime" reveals the agent picker (research / code / writing) below it. All three are registered via `useRegisterAgent` against three distinct mock-server URLs.
- **Per-agent message isolation.** User sends "Process my data" to research -> timeline animates through STATE_DELTA events, "All three steps complete" reply lands. Switch to code -> empty-state caption updates to "Scripted 'code' agent...", chat history is empty. Send "Show me a TS function" -> code-block reply lands. Switch to writing -> empty state again, send "Draft a paragraph" -> prose reply. Switch back to research -> previous research conversation history reappears in the chat (proven by the surviving "Process my data" + "All three steps complete" exchange).
- **Tool-call dispatch through active agent.** Research agent emits `TOOL_CALL_END` for `add_todo` when prompted, runtime dispatches through the active Pilot's registry, todo "a todo to call dad" appears in the visible todo widget, agent acknowledges via text. Same `add_todo` registration is visible to whichever agent is currently active.
- **Console clean.** Zero React warnings, zero errors across the full multi-agent swap sequence. Phase 3b runtime-bridge fix continues to hold under multi-agent traffic.

### Added, Phase 5: Generative UI

- **`<PilotAgentStateView>`** (`src/components/pilot-agent-state-view.tsx`), JSX-friendly wrapper around `usePilotAgentState`. Takes `agent` and `render(state)` props; subscribes to the agent's per-agent state store and re-renders the consumer's render function whenever STATE_SNAPSHOT or STATE_DELTA arrives. Generic `T` flows through to the render callback so consumers get typed access to their state shape. `usePilotAgentState` remains the primary hook API; this component is sugar for declarative JSX.
- **6 new tests** in `pilot-agent-state-view.test.tsx`: undefined-state-before-mount, initial-state-seeded-on-mount, STATE_SNAPSHOT propagation, STATE_DELTA via JSON Patch reduces correctly, multi-consumer-single-source-of-truth, identity-stable updates do not churn renders. Pattern uses a `FakeAgent extends AbstractAgent` whose `run()` emits scripted `BaseEvent` arrays via rxjs `Observable`, so the apply pipeline reduces JSON Patches identically to a real `HttpAgent` connection.
- **`examples/todo` extended** with a `<TimelineWidget>` (`examples/todo/src/widgets/timeline.tsx`) using `<PilotAgentStateView>`. Renders a 3-step timeline (`Fetching context`, `Analyzing`, `Summarizing`) with `pending` / `active` / `done` status indicators. Visible when `agUiRuntime` is selected. Driven by the mock server: when the user message contains `process` / `research` / `analyze` / `think`, `/api/agui` emits `STATE_SNAPSHOT` (initial state) followed by 3 `STATE_DELTA` events (JSON Patch) that walk each step from `pending` -> `active` -> `done`, then a final text acknowledgment. STATE frames stream at 350 ms so the animation is humanly visible; text frames stay at 30 ms.

### Public API additions, Phase 5

`src/index.ts` adds:
- `PilotAgentStateView` (component)
- `PilotAgentStateViewProps<T>` (type)

### Test status, Phase 5

Before phase: 267 passing across 22 files. After phase: **273 passing across 23 files. Zero regressions. `pnpm typecheck` clean across the workspace, `pnpm build` succeeds.**

### Real-browser smoke, Phase 5 (2026-04-30)

`examples/todo` booted with the timeline widget enabled, driven via agent-browser CDP automation. Screenshots captured at `.research/agentickit-phases/screenshots/12-13-14-*.png`.

Verified end-to-end:

- **Empty state.** With `agUiRuntime` selected and no workflow yet triggered, the timeline widget renders its empty state with the prompt instructions (12).
- **Streaming UI updates.** User types "Process my data" and clicks send. The mock server emits `STATE_SNAPSHOT` -> 3 x `STATE_DELTA` -> text. Each step transitions visibly: `Fetching context` `active` -> `done`, `Analyzing` `pending` -> `active` -> `done`, `Summarizing` `pending` -> `active` -> `done`. The mid-flight screenshot captured the moment when steps 1-2 are `done` and step 3 is `active` (14). Final state has all three `done` plus the assistant's text reply in the chat (13).
- **Multi-run idempotency.** Second workflow trigger ("Run a workflow") replays the same state transitions correctly: STATE_SNAPSHOT replaces the prior state, deltas walk the same path, terminal state matches the first run.
- **Console clean.** Zero React warnings, zero error messages. The Phase 3b runtime-bridge fix continues to hold under STATE event traffic.

### Phase 3b polish (2026-04-30)

Two follow-ups after the initial Phase 3b ship:

- **`PilotRuntimeBridge` extracted** (`src/components/pilot-provider.tsx`). The bug: `runtime.useRuntime(config)` was called directly in the `<Pilot>` body. `localRuntime`'s `useLocalRuntimeImpl` and `agUiRuntime`'s `useAgUiRuntimeImpl` have different hook signatures (different `useState` / `useRef` / `useCallback` sequences), so swapping the `runtime` prop mid-mount triggered a Rules-of-Hooks violation. React caught it: "change in the order of Hooks called by Pilot." The fix: extract the runtime hook call into a child component keyed by runtime identity (`WeakMap<PilotRuntime, string>` + auto-incrementing id), so a runtime swap = clean unmount + remount of the runtime's hooks. Confirm-modal and HITL state still live in the outer `<Pilot>` so they survive registry mutations; chat context comes from the bridge so it resets correctly when the runtime changes. New regression test in `runtime/runtime-swap.test.tsx` mounts the provider with two intentionally-different-hook-shape runtimes and asserts no React error fires across three swaps.

- **`examples/todo` extended with chrome picker + AG-UI demo route.** The example now lets you toggle between `<PilotSidebar>` / `<PilotPopup>` / `<PilotModal>` and between `localRuntime` / `agUiRuntime` at runtime. The AG-UI route is backed by a tiny scripted Hono endpoint at `/api/agui` that emits AG-UI SSE events (RUN_STARTED, TEXT_MESSAGE_*, TOOL_CALL_*, RUN_FINISHED) without an LLM call, so the AG-UI runtime can be exercised end-to-end without burning credits and without a real LangGraph / CrewAI / Mastra backend. The mock recognizes "add a todo" patterns and emits a TOOL_CALL_END for `add_todo`, exercising the registry-bridge path; on the second turn it acknowledges with a text reply.

### Real-browser smoke (2026-04-30)

`examples/todo` booted with the chrome picker + AG-UI route, driven via agent-browser CDP automation. Screenshots captured at `.research/agentickit-phases/screenshots/01-...11-*.png`.

Verified end-to-end:

- **Sidebar + localRuntime**: default state renders, suggestion chips show, dark-mode CSS variables apply (1).
- **Sidebar + agUiRuntime**: runtime swap from local to AG-UI re-renders the chat surface with the AG-UI suggestion chips (2). User types "Hi" and clicks send, scripted server replies, message appears in the message list (3).
- **AG-UI tool-call dispatch**: User types "Add a todo to call mom" and clicks send. Server emits TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END for `add_todo`. Runtime dispatches through the local registry. The registered React handler (`usePilotAction({ name: "add_todo", handler: ({text}) => setTodos(...) })`) runs. Todo "a todo to call mom" visibly appears in the todo widget. Runtime appends a `role: "tool"` message and re-runs. Server emits text acknowledgment ("Done! Added that todo for you."). Tool-call chip renders inline in the message list with `state="output-available"` (4). Full screenshot: `.research/agentickit-phases/screenshots/04-sidebar-agui-tool-call.png`.
- **Popup**: chrome swap from sidebar to popup preserves agent messages (single source of truth via stable agent ref). `defaultOpen` shows the popup card; toggle is hidden while open (Intercom convention) (5). Header X click closes the popup, toggle reappears. Re-clicking toggle reopens the popup AND moves focus to the textarea inside the popup card (11).
- **Modal**: chrome swap to modal hides any visible chat surface and shows only the "Open chat modal" launcher button (6). Clicking the launcher (with focus on the launcher first) opens the modal AND moves focus to the textarea inside the modal card (7). Sending a message goes through, scripted reply appears (8). Escape closes the modal AND restores focus to the launcher (verified via `document.activeElement` check). Backdrop click closes the modal too.
- **Runtime swap stability**: three consecutive swaps (local -> agUi -> local -> agUi) produce zero React errors in the console. Messages persist across chrome swaps because the `aguiAgent` reference and the `aguiRuntimeInstance` are memoized at App level. Final state returns to sidebar + localRuntime cleanly (9).

These flows close every "real-browser TODO" item from the original Phase 3b ship.

### End-to-end verification status (Phases 1 + 2 + 3a + 3b)

**AG-UI runtime, what was verified:**

- All 32 happy-dom tests pass against a `FakeAgent` whose `run()` emits scripted AG-UI events through the real `defaultApplyEvents` pipeline. Tool-call bridging, mutating-action confirm gating, renderAndWait HITL composition, JSON-Patch `STATE_DELTA` reduction, ACTIVITY_SNAPSHOT propagation, RUN_ERROR surfacing, `Observable.error()` (run() throws) surfacing, factory stability, continuation cap, re-entry guard.
- The `@ag-ui/client` apply pipeline is exercised end-to-end via real rxjs `Observable` emissions; we don't fake the AG-UI internals, only the event source.
- `convertMessages` covered against all seven AG-UI message roles plus orphan tool calls, error tool results, and multimodal user content.

**Still pending for AG-UI runtime (deferred to a follow-up session):**

- **Real-server smoke** against a live AG-UI server (e.g. a LangGraph CoAgents endpoint or `@copilotkit/runtime`'s AG-UI route). The runtime has been exercised end-to-end in real browser against the in-process scripted Hono mock at `/api/agui` (Phase 3b polish), which exercises real `parseSSEStream` -> apply pipeline -> subscribers -> Pilot bridge. An actual hosted SSE response from a production agent server may still surface event-shape edge cases or middleware ordering quirks we haven't reproduced.
- **Multi-agent flows** are out of scope for Phase 3b; that's Phase 7. The runtime supports a single agent per `<Pilot>` provider.



**Verified in a real browser (2026-04-27):** Booted `examples/todo` against the freshly-built `@hec-ovi/agentickit` dist via Vite + agent-browser CDP automation:

- **`<PilotSidebar>` real-browser rendering** is correct: dark-mode CSS variables apply, slide-in animation runs, layout reflows cleanly when the sidebar closes (todo widget expands to full width, toggle pill reappears bottom-right with the dot indicator + "agentickit" label).
- **`examples/todo` builds and runs** against the new `index.ts` exports. `pnpm typecheck` clean across the workspace, Vite serves without import errors, the example renders the same DOM contract our happy-dom tests assert.
- **Close path** verified end-to-end: header X click closes the sidebar in the real browser, toggle button reappears, focus restoration is real (not just the synthetic `fireEvent.keyDown` we drive in unit tests).
- **Visual regression** on the refactored sidebar: open and closed screenshots captured at `01-initial-load.png` / `02-sidebar-closed.png` / `03-reopened.png`. Sidebar body delegated to `<PilotChatView>` reflows identically to the pre-refactor implementation.

**Still pending (deferred to future sessions or a 0.2.0 release pass):**

- **`<PilotPopup>` and `<PilotModal>` real-browser rendering.** `examples/todo` only wires up the sidebar form factor, so the popup/modal CSS rules were exercised only by happy-dom (no paint, no animation). A consumer-side example using either form factor would close this.
- **Real-browser focus trap on `<PilotModal>`.** The Tab-cycle assertions pass in happy-dom, but real browsers route Tab through the DOM with subtleties (display none + tabindex, hidden iframes, nested portals) that the synthetic test environment does not replicate. The focus-restore `useLayoutEffect` is verified by inference (sidebar focus restoration works), but the modal trap itself was not exercised in a real browser.
- **`renderAndWait` against a real model.** Verified against scripted `tool-call → text-reply` SSE frame sequences from `installPilotFetchMock` and against the new scripted-runtime user-flow tests. Behavior against an actual vLLM / OpenAI / Anthropic streaming response, including edge cases like model retry mid-suspension or partial tool-input deltas, is unconfirmed (no API credit available this session).
- **vLLM smoke** end-to-end. Phase 1+2+3a are pure UI/dispatcher/runtime-abstraction work and should not interact with the existing vLLM Responses-API shim, but the example was not run against vLLM to confirm.

These are tracked here so a future session (or another contributor) knows exactly what level of verification was achieved.

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
