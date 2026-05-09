# Features to work on

Running list of features and improvements we are building. Distinct from `bugs/` (a bug is "documented behavior is broken"; a feature is "we want new behavior").

Priority bands:
- **P0**: blocks adoption or correctness.
- **P1**: significant value, on the critical path for the next milestone.
- **P2**: meaningful but can wait.
- **P3**: nice to have.

Format per item:

```markdown
### <feature title>

- Priority: P0 | P1 | P2 | P3
- Why: <user-visible benefit, one sentence>
- Sketch: <how it could work, one paragraph>
- Origin: <session-test finding ref or external request>
- Status: idea | designed | in-progress | shipped-in-<sha>
- Owner: <name or unassigned>
```

Move items to `Status: shipped-in-<sha>` rather than deleting; keeps the trail intact.

---

## P0

(none yet)

## P1

### Lower Pilot CSS specificity so host themes win by default

- Priority: P1
- Why: Today the Pilot package's `:root { --pilot-* : ... }` defaults beat consumer overrides written at `:root` because the package's stylesheet is injected after the host's. Consumers must use higher-specificity selectors to theme the chat surfaces, which is surprising.
- Sketch: Wrap every default-token block in `:where(:root) { ... }` (specificity 0) so any host rule wins. Bonus: add a `data-pilot-theme="dark"` honor alongside the existing `@media (prefers-color-scheme: dark)` so hosts with manual theme toggles can drive the chat surface explicitly.
- Origin: `.sessiontests/ui-ux/FINDINGS.md` "Pilot CSS overrides lose to package's `:root` defaults"
- Status: idea
- Owner: unassigned

### Per-agent message-store persistence + smooth runtime swap

- Priority: P1
- Why: Two related symptoms with one root cause. (a) Switching the active agent in `<PilotAgentRegistry>` loses the previous agent's chat history because each `<Pilot runtime={...}>` swap remounts `useChat`, dropping the messages array. (b) The sidebar visibly flickers / disappears during the swap because the chat surface empties in the same frame. Real consumers will treat per-agent threads as independent and expect both: history preserved per agent, and zero visible churn during the switch.
- Sketch: A `PilotMessageStore` keyed by agent id (string for AG-UI agents, a sentinel `"__local__"` for the default runtime). The store lives at `<PilotAgentRegistry>` level. Each runtime reads `initialMessages` from the store on mount and writes back on every change. The runtime's transport changes; the surrounding chat surface stays mounted (a single stable provider-level useChat that swaps its transport rather than being recreated). Swapping runtimes preserves both threads AND keeps the UI in place. Optional persistence layer (sessionStorage by default, pluggable for IndexedDB or server).
- Workaround until then (example-side): cache runtime instances in a `useRef<Map<id, PilotRuntime>>` so switching back returns the same instance with its in-memory state intact. Reduces flicker; doesn't fully eliminate it because the runtime identity still changes per swap.
- Origin: user report — concierge → flights → concierge round-trip wiped the concierge thread, and the sidebar visibly refreshes during every swap.
- Status: idea
- Owner: unassigned

### Built-in `inspect_context` (or `refresh_context`) tool

- Priority: P1
- Why: When the user is ambiguous and the model isn't sure what state, forms, or tools are currently mounted, it has no way to "look around". Today the registry snapshot is sent on every request, but the model never sees it as structured, queryable data; it has to infer from the tool list. A first-class introspection tool gives the model a deterministic way to ground itself.
- Sketch: Auto-register `inspect_context()` on every `<Pilot>` (no consumer opt-in needed). Returns `{ states: [{ name, description, valuePreview, schemaShape }], actions: [{ name, description, mutating, hasRenderAndWait }], forms: [{ name, fields: [...], values: {...} }] }`. Cheap, deterministic, model-readable. The model can call it before deciding what to do when the user is ambiguous.
- Sketch v2 if v1 is too noisy: parameterize as `inspect_context({ filter: "states" | "actions" | "forms" })` to keep responses small.
- Origin: user request: "allow the agent to refresh the react thing itself with an internal tool of agentickit, so if user asks ambiguity of something not present the agent can refresh its actual present forms or whatever".
- Status: idea
- Owner: unassigned

### Composer visibility prop on chat surfaces (`composer="full" | "suggestions" | "off"`)

- Priority: P1
- Why: Today every chat surface (`<PilotSidebar>`, `<PilotPopup>`, `<PilotModal>`, `<PilotChatView>`) unconditionally renders a textarea + send button. When the active agent is scripted (no LLM, no real reception of free text — e.g., a state-machine demo or a tape player), the input is misleading: the user types and nothing meaningful happens. That erodes trust across the whole UI.
- Sketch: Add `composer?: "full" | "suggestions" | "off"` prop to all four chat surfaces. `"full"` = current behavior (default, no breaking change). `"suggestions"` = hide the textarea + send button, render only the suggestion chips so the user can still drive the agent via canned prompts. `"off"` = no composer at all, the surface is read-only (good for purely observable agents like activity logs).
- Sketch v2 (more automatic): runtimes declare a `capabilities: { interactiveText?: boolean; suggestions?: boolean }` field. Chat surfaces read the capability and pick a default composer mode. Explicit prop overrides the default. Consumers don't have to remember to set the prop per agent.
- Origin: user observation: "if they do not chat agentickit should not offer input in that mode". Surfaced while running the scripted multi-agent demo where typing into the composer with a specialist active produced no meaningful response.
- Status: idea
- Owner: unassigned

### `<PilotSidebar mode="overlay" | "push">` prop

- Priority: P1
- Why: Today `<PilotSidebar>` always overlays the page (`position: fixed`). Some consumers want the sidebar to push the page content aside instead, so the underlying page stays fully visible and laid out around the chat. Both modes are valid for different products (overlay for AI-first surfaces, push for editors/dashboards where the page IS the work).
- Sketch: Add a `mode?: "overlay" | "push"` prop to `<PilotSidebar>`. Default `"overlay"` (current behavior, no breaking change). When `"push"`: the sidebar is in document flow rather than fixed; emits a CSS class on `<html>` (e.g. `data-pilot-sidebar-open`) that consumers can use to apply `padding-right: var(--pilot-sidebar-width)` to their main content. Optionally the package itself sets the body padding when in push mode so consumers don't have to wire it.
- Origin: user request: "have a flag of the mode of how that side bar is being shown, can be like it is now which is over the website, or can be like moves it all and the whole original site is visible".
- Status: idea
- Owner: unassigned

## P2

### usePilotInstructions hook

- Priority: P2
- Why: Per-page additional system prompt as a React-y primitive. Today consumers must rely on `.pilot/` files, server-static `system`, or hand-roll `body.system` injection via a custom runtime; none of those scope cleanly to a mounted page.
- Sketch: `usePilotInstructions(text: string)` registers a fragment with the provider; the runtime's `prepareSendMessagesRequest` collects all live fragments and appends them to `body.system` (or a sibling `body.additionalInstructions` field the server merges). Cleanup on unmount.
- Origin: `.sessiontests/docs-mismatch/FINDINGS.md` "Per-page system instructions: no first-class API"
- Status: idea
- Owner: unassigned

## P3

(none yet)

---

## Shipped

(none yet; entries move here after merge with the commit sha)
