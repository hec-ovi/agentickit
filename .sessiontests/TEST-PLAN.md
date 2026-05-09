# Manual test plan

Walk this top to bottom. Each section maps to one page under `docs/`. Each section has a Golden path (must work) and Edge cases (where bugs hide). Tick boxes as you go; log findings into the matching category file under `.sessiontests/<category>/FINDINGS.md`.

Setup once before starting:

```bash
cd /home/hec/workspace/agentickit
pnpm install
# vLLM live work needs the server running on http://localhost:8000/v1
# OR set OPENAI_API_KEY for real OpenAI
cp examples/todo/.env.example examples/todo/.env.local
# edit .env.local to point at your provider
pnpm --filter ./examples/todo dev
# open http://localhost:3000 (or whatever port Next picks)
```

If something is broken before you start (install fails, dev server crashes), file it in `bugs/FINDINGS.md` as `Severity: blocker` and stop. Don't proceed past a broken setup.

---

## 1. getting-started.md

Doc: `docs/getting-started.md`

### Golden path
- [ ] `pnpm install` completes clean.
- [ ] `pnpm --filter ./examples/todo dev` boots and serves a chat UI.
- [ ] Open the page, type "add buy milk to my list", model adds the todo, UI updates.
- [ ] Refresh the page, todo persists if persistence is documented (check what the example actually claims).

### Edge cases
- [ ] Missing `OPENAI_API_KEY` and `OPENAI_BASE_URL`: does the error explain what to set?
- [ ] Wrong key (`OPENAI_API_KEY=invalid`): is the failure surface a clear server log + visible UI hint, or silent?
- [ ] Both `OPENAI_API_KEY` and `AI_GATEWAY_API_KEY` set: which wins? Matches docs claim ("per-provider key first")?
- [ ] `OPENAI_BASE_URL` with trailing slash vs without: both work?
- [ ] `OPENAI_BASE_URL` set but no model env: does it pick a sensible default or fail loud?
- [ ] First request after server start: cold-path latency reasonable (< 2s to first token)?

Findings → `dx/`, `bugs/`, `docs-mismatch/`.

---

## 2. hooks.md

Doc: `docs/hooks.md`

### Golden path
- [ ] `usePilotState`: register `prefs` state, ask the model to update it, confirm modal opens, approve, React state updates, UI re-renders.
- [ ] `usePilotAction`: a non-mutating action runs without confirm. A `mutating: true` action shows confirm.
- [ ] `usePilotForm`: register a form, ask the model to fill it field by field, confirm submit fires `handleSubmit`.
- [ ] System prompt source: `.pilot/instructions/*.md` files load into the system prompt (verify by tailing server log on a request). Or server-set `createPilotHandler({ system: "..." })`. Or client-sent `body.system`.
- [ ] Suggestion chips: pass `suggestions={[...]}` to `<PilotSidebar>` / `<PilotPopup>` / `<PilotModal>`; chips render on empty state and clicking one sends. (Note: this is a prop, not a hook.)

### Edge cases
- [ ] Hook unmount mid-conversation: does the registered tool disappear from the next request body? (Critical: stale tools cause "no such tool" errors.)
- [ ] Two components register the same action name: dev warning? last-wins or first-wins? Documented?
- [ ] `usePilotState` rapid setter calls (e.g. typing into a controlled input): batched or one re-render per char?
- [ ] `usePilotForm` with field validation that throws: error path visible to user and model?
- [ ] `usePilotAction` whose `handler` throws: does the model receive a structured error result, or does the request hang?
- [ ] Action with empty `parameters` schema: still callable?
- [ ] Action whose `parameters` is `z.object({})` vs missing entirely: same behavior?

Findings → `dx/`, `bugs/`.

---

## 3. ui.md

Doc: `docs/ui.md`

### Golden path
- [ ] `<PilotSidebar>` opens and closes; messages render; composer sends.
- [ ] `<PilotPopup>` floating bubble opens a panel; messages render.
- [ ] `<PilotModal>` mounts a centered dialog; sends; closes.
- [ ] `<PilotHeadless>` exposes hooks-only API; you can build a custom surface.
- [ ] Tool-call markers render distinctly from text replies.
- [ ] Reasoning blocks (Anthropic with thinking) render in the collapsed details element.

### Edge cases
- [ ] Long message (5000+ chars): does the bubble wrap and stay scrollable?
- [ ] Rapid send (mash Enter 5x): are messages queued, dropped, or duplicated?
- [ ] Network drop mid-stream: does the UI surface "connection lost" or hang on a spinner forever?
- [ ] Dark mode / light mode toggle: any contrast or color issues?
- [ ] Mobile viewport (resize to 375x667): does the sidebar collapse, modal fit, popup not overlap input?
- [ ] Composer with multi-line paste (5+ newlines): grows? scrolls? capped?
- [ ] Markdown in replies: code blocks, lists, links render correctly.
- [ ] XSS attempt: model emits `<script>alert(1)</script>`, must render as text not execute.
- [ ] Two `<Pilot>` providers on the same page: state-isolated?

Findings → `ui-ux/`, `a11y/`, `bugs/`.

---

## 4. server.md

Doc: `docs/server.md`

### Golden path
- [ ] POST to `/api/pilot` with a UI-message body returns a streaming response.
- [ ] `.pilot/instructions/*.md` files load into the system prompt.
- [ ] Per-request body model override: `body.model: "anthropic/..."` actually routes to anthropic if its env key is set.
- [ ] System prompt assembly order matches the docs (provider defaults, then `.pilot/`, then runtime instructions, then ad-hoc).

### Edge cases
- [ ] Invalid request body (missing messages): 400 with a clear message?
- [ ] Model override for a provider whose adapter is not installed: clear error or generic 500?
- [ ] `.pilot/instructions/` containing a binary file or huge file (> 1 MB): handler crashes, ignores, or surfaces a warning?
- [ ] `.pilot/instructions/` directory missing entirely: handler still works?
- [ ] Concurrent requests from two tabs: streams isolated (no cross-talk in tool dispatch)?
- [ ] Aborted request (client `useChat` stop): server cleanup happens, no leaked stream?
- [ ] Tool call with malformed args from model: handler responds with structured error, model recovers (via `arguments: "{}"` shim or equivalent)?

Findings → `bugs/`, `dx/`, `performance/`.

---

## 5. runtimes.md

Doc: `docs/runtimes.md`

### Golden path
- [ ] Default `localRuntime` works (this is implicit in 1 to 4).
- [ ] `agUiRuntime({ agent })` with a fake AG-UI agent renders messages and dispatches tools.
- [ ] Multi-agent registry: register two agents, switch active id, conversation switches; second agent has its own message list.

### Edge cases
- [ ] Runtime swap mid-conversation: previous stream cleanly terminated, new runtime takes over without React error?
- [ ] `useRegisterAgent` with duplicate id: dev warning visible? Last-wins as documented?
- [ ] `useAgent("nonexistent")`: returns `undefined` cleanly, no throw?
- [ ] AG-UI agent disconnects mid-turn: UI surfaces the failure, does not hang.
- [ ] Rapid agent-switch (`activeId` changes 3 times in 200ms): no zombie streams, no React state corruption.
- [ ] Custom runtime implementing `PilotRuntime` minimally: confirm modal still works, HITL still works.

Findings → `bugs/`, `dx/`, `performance/`.

---

## 6. hitl-and-confirm.md

Doc: `docs/hitl-and-confirm.md`

### Golden path
- [ ] `mutating: true` action triggers confirm modal; Approve runs handler; Cancel does not.
- [ ] `renderAndWait`: render-prop UI shows; respond resolves with the picked value; cancel resolves with decline.
- [ ] Custom `renderConfirm` prop on `<Pilot>` overrides default modal.
- [ ] Mutating + `renderAndWait` combined: confirm first, then render-prop, then respond.

### Edge cases
- [ ] Escape key closes confirm modal without calling handler.
- [ ] Tab cycles between Confirm and Cancel buttons; focus stays trapped.
- [ ] Focus restoration: focus returns to the element that was focused before confirm opened.
- [ ] Calling both `respond` and `cancel` in `renderAndWait`: second is ignored (idempotent), no double-resolution warning in console.
- [ ] Calling neither: action sits forever; if the component unmounts, runtime auto-cancels.
- [ ] Confirm modal with very long arguments object (deep nested JSON): scrolls, does not break layout.
- [ ] Confirm modal during another modal (e.g., the user's app modal): z-index correct, focus trap correct.
- [ ] Decline reason text actually reaches the model on its next turn.

Findings → `ui-ux/`, `a11y/`, `bugs/`, `dx/`.

---

## 7. providers.md

Doc: `docs/providers.md`

### Golden path
- [ ] OpenAI (real): set `OPENAI_API_KEY` only, default model resolves, end-to-end chat works.
- [ ] vLLM: set `OPENAI_BASE_URL` and a model env, `examples/todo` works (this exercises the four shims).
- [ ] Anthropic: switch model to `anthropic/claude-haiku-4-5`, verify it routes.
- [ ] AI Gateway: only `AI_GATEWAY_API_KEY`, any prefix works.

### Edge cases (vLLM specific, the four shims)
- [ ] Reasoning leaks: remove `chat_template_kwargs.enable_thinking=false` (set `VLLM_REASONING=on` in the live UI test) and confirm reasoning frames flood. Restore.
- [ ] `store=false` removed: confirm `KeyError: 'role'` reappears on multi-turn. Restore.
- [ ] `normalizeVllmInputItem` removed: confirm 213 Pydantic errors after first text turn. Restore.
- [ ] `function_call.arguments` sanitizer removed: confirm 400 "item pairs from a mapping" on bad-args turn. Restore.
- [ ] `AGENTICKIT_OPENAI_PROTOCOL=chat` env: handler hits `/v1/chat/completions` instead of `/v1/responses`. Verify with vLLM trace.
- [ ] `AGENTICKIT_OPENAI_PROTOCOL=anything-else` (not "chat"): falls back to Responses (only "chat" is honored).

### Edge cases (provider routing)
- [ ] Per-request `body.model` override for a provider whose env key is not set: clear error, not generic 500.
- [ ] `OPENAI_BASE_URL` with `https://` scheme but plain http vLLM: TLS error surfaces clearly.
- [ ] Custom client built with `createOpenAI({ headers })`: headers actually flow on every request (check trace).

Findings → `bugs/`, `dx/`, `docs-mismatch/`.

---

## 8. testing.md

Doc: `docs/testing.md`

### Golden path
- [ ] `pnpm test` runs the mocked suite (296 tests), all green.
- [ ] `VLLM_BASE_URL=http://127.0.0.1:8000/v1 pnpm test:vllm` runs 4 protocol tests, all green.
- [ ] `VLLM_BASE_URL=... pnpm test` runs everything: mocked + protocol + UI suites, all green.

### Edge cases
- [ ] Without `VLLM_BASE_URL`: live suites are skipped, not failed.
- [ ] With wrong `VLLM_BASE_URL` (server not up): live tests fail with a clear connection error, not a confusing timeout.
- [ ] `VLLM_REASONING=on`: reasoning-on path runs, comparison data captured.
- [ ] `VLLM_CHAT_COMPLETIONS=on`: hits `/v1/chat/completions`, useful for protocol bisection.
- [ ] Trace file `/tmp/vllm-trace.jsonl` is appended (not overwritten) across runs.
- [ ] `installPilotFetchMock` cleanup: a test that does not unmount leaks fetch hijack into the next test, OR `afterEach` correctly restores. Verify.

Findings → `dx/`, `bugs/`.

---

## After the walkthrough

When you finish all eight sections:
1. Run a final `pnpm test` and `pnpm test:vllm`. If anything regressed during your manual session, file as `bugs/` blocker.
2. Pick the top three findings across categories by severity * frequency. Add them as `[ ]` items to `FEATURES.md` if they need design, or as `Status: open` in the original finding if they are bug fixes.
3. Update each category's `Last updated` cell in `INDEX.md` if you logged anything new.
