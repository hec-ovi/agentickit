# Guides

Focused, navigation-friendly walkthroughs for building with `@hec-ovi/agentickit`. Each page is self-contained: open the one matching your task, copy the snippets, ship.

The root [README](../README.md) is the marketing-and-overview page. These guides are the "I'm in the editor, now what" pages.

## Read in this order if you're new

1. [Getting started](./getting-started.md) - install, minimal Next/Bun example, run it locally
2. [The three hooks](./hooks.md) - `usePilotState`, `usePilotAction`, `usePilotForm`
3. [Chat surfaces](./ui.md) - `<PilotSidebar>`, `<PilotPopup>`, `<PilotModal>`, `<PilotChatView>`
4. [Server handler](./server.md) - `createPilotHandler`, the `.pilot/` skills protocol, the CLI

## Reach for these when the task asks

5. [Runtimes and multi-agent](./runtimes.md) - swap `localRuntime` for `agUiRuntime`; route to one of many agents
6. [Human-in-the-loop](./hitl-and-confirm.md) - confirm modal for mutating actions, `renderAndWait` for pause-and-resume
7. [Providers](./providers.md) - the supported AI SDK adapters; vLLM-specific gotchas (live-verified)
8. [Testing](./testing.md) - the mocked fetch harness, the live vLLM gate, what to assert

## What's NOT in here

- API surface reference. Use TypeScript and your editor's hover, or read [`packages/agentickit/src/types.ts`](../packages/agentickit/src/types.ts) directly. Types are the contract.
- Phase history. The [CHANGELOG](../packages/agentickit/CHANGELOG.md) is the running log.
- Generative UI internals. See [`PilotAgentStateView`](../packages/agentickit/src/components/pilot-agent-state-view.tsx) source; the test file alongside it is a good worked example.

## House rules

- Compact, opinionated, code-first. If a page is more than a screen of prose, something is wrong.
- Examples are real. Every snippet here is structurally close to something in `packages/agentickit/src/` or `examples/todo/`.
- We update these alongside the code. If a guide claims something the source no longer does, file an issue.
