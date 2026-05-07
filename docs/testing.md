# Testing

Three layers, picked at the granularity of the thing under test.

| Layer | What it covers | Real network? | Wall time |
| --- | --- | --- | --- |
| Mocked unit + integration suite | Hooks, components, server handler routing, .pilot/ parsing, runtime contract | No | ~2s for 296 tests |
| Live protocol suite | The wire-level contract against real vLLM at `/v1/responses` | Yes (gated on `VLLM_BASE_URL`) | ~13s for 4 tests |
| Live UI suite | Full React + handler + vLLM end-to-end flows | Yes (gated on `VLLM_BASE_URL`) | ~90s for 7 tests |

Default: only the mocked suite runs. The two live suites stay skipped unless `VLLM_BASE_URL` is set, so CI without a vLLM stays green.

```bash
pnpm test                                 # mocked suite, always
VLLM_BASE_URL=http://127.0.0.1:8000/v1 pnpm test:vllm   # protocol suite only
VLLM_BASE_URL=... pnpm test               # everything: mocked + both live suites
```

## The mocked harness

For component tests against `<Pilot>`, the canonical helper is `installPilotFetchMock` (in `packages/agentickit/src/test-utils/stream-mock.ts`). It hijacks `globalThis.fetch`, queues canned UI-message SSE responses, and asserts the POST count for loop-detection.

```ts
import { installPilotFetchMock, toolCallTurn, textReplyTurn } from "@hec-ovi/agentickit/test-utils";

const mock = installPilotFetchMock();
mock.push(toolCallTurn({ toolCallId: "c1", toolName: "add_todo", input: { text: "buy milk" } }));
mock.push(textReplyTurn({ id: "t1", text: "Done." }));

// render <Pilot> + your widget, fire the send button, await DOM
expect(mock.pilotPostCount()).toBe(2);
```

What it gives you for free:
- Real `useChat` parser sees real `text/event-stream` bytes (no parser shortcuts).
- Per-frame yield to the event loop so race conditions surface.
- `pilotPostCount()` so infinite-loop regressions get caught in CI, not in production token bills.

When to use it: any test that exercises the chat lifecycle without needing model behavior.

## Live protocol tests

File: [`packages/agentickit/src/server/handler.live-vllm.test.ts`](../packages/agentickit/src/server/handler.live-vllm.test.ts).

Four tests, all gated on `VLLM_BASE_URL`:

1. **Negative control** - confirms raw vLLM `/v1/responses` defaults to streaming reasoning frames. If this fails, our "reasoning off via `chat_template_kwargs.enable_thinking=false`" assertions in the other tests stop being meaningful.
2. **Text-only turn** - clean text-delta stream, finish=stop, no reasoning frames, `providerMetadata.openai.itemId` proves the Responses path.
3. **Tool-calling turn** - the `tool-input-available` marker fires (the marker the old chat-completions shim was working around). Without it, `useChat` hangs.
4. **Two-turn round trip** - after feeding the tool result back, the model produces final text and the conversation terminates with finish=stop.

Run only this file:

```bash
pnpm test:vllm
# or
VLLM_BASE_URL=http://127.0.0.1:8000/v1 \
  pnpm vitest run src/server/handler.live-vllm.test.ts
```

Override the model:

```bash
VLLM_BASE_URL=http://localhost:8000/v1 \
  VLLM_MODEL=Qwen3.6-72B-AWQ4 \
  pnpm test:vllm
```

## Live UI tests

File: [`packages/agentickit/src/components/handler.live-vllm.ui.test.tsx`](../packages/agentickit/src/components/handler.live-vllm.ui.test.tsx).

Mounts real `<Pilot>` components in happy-dom, hijacks `globalThis.fetch` to route `/api/pilot` to the in-process `createPilotHandler` against the real vLLM, and drives the UI with `@testing-library/react`. Nothing mocked.

Coverage:

1. Multi-tool turn: model issues consecutive `add_todo` calls, DOM updates, conversation terminates with text reply.
2. Mutating action approve: confirm modal opens, click Confirm, handler runs with the model's args.
3. Mutating action cancel: click Cancel, handler is never called, model gets the decline and replies.
4. `usePilotState` setter auto-tool: model writes through `update_<name>`, confirm + approve, React state changes.
5. `usePilotForm` progressive fill: `set_<name>_field` populates each input, `submit_<name>` fires the form's `handleSubmit`.
6. `renderAndWait` HITL respond: HITL UI mounts, user picks an option, model resumes with the choice.
7. `renderAndWait` HITL cancel: user dismisses, handler never resolves, model receives the cancel and continues.

The shim that talks to vLLM (custom `fetch`, `chat_template_kwargs.enable_thinking=false`, assistant-history shape normalize, `function_call.arguments` sanitize) is duplicated in this file so the test mirrors what `examples/todo` does in production.

```bash
VLLM_BASE_URL=http://127.0.0.1:8000/v1 \
  pnpm vitest run src/components/handler.live-vllm.ui.test.tsx
```

### Toggles for diagnostics

Two env-controlled flags inside the live UI file:

- `VLLM_REASONING=on` - skip the `enable_thinking=false` injection. Useful when comparing reasoning-on vs reasoning-off behavior.
- `VLLM_CHAT_COMPLETIONS=on` - build the model with `client.chat(modelId)` instead of `client.responses(modelId)` and hit `/v1/chat/completions` instead of `/v1/responses`. Useful when isolating whether a failure is protocol-specific.

Both default off so CI behavior stays canonical.

## Frontend test conventions (per CLAUDE.md)

- Render with `@testing-library/react`, drive with `fireEvent` (or `user-event` if you add it).
- Query by role and accessible name. Avoid querying by class or test-id unless the role makes the query ambiguous (the form test scopes the composer with `name: /Ask me anything/i` because the form widget renders its own textareas).
- `await waitFor`/`findBy*` for async state. Don't `setTimeout` and hope.
- Mock at the network layer (the `installPilotFetchMock` helper, or the file-scope `globalThis.fetch` hijack the live tests use).
- Cover invalid states too (disabled buttons, validation errors, decline branches).
- A simulated DOM (happy-dom) is sufficient. Headless component testing (Playwright Component Testing, Vitest browser-mode) is also valid; you don't need a visible browser. "I can't open a browser" is not an excuse to skip frontend tests.

## What to do when a live test fails

1. Read the trace at `/tmp/vllm-trace.jsonl` (the live UI file logs every `/v1/responses` request and its response status).
2. If it's a 4xx, vLLM rejected the shape. Check the request body in the trace; you may need a new shim.
3. If the model emitted prose JSON instead of calling a tool, check that the tool is actually in `body.tools` (a missing tool means a registration bug, not a model bug).
4. If the multi-tool test times out at 240s, the model probably truncated a function_call mid-stream. The current example uses two tools to dodge this on Qwen3-27B-AWQ4; a stronger model handles three.

The investigation that produced the four shims is documented in this commit's PR. Use it as a worked example next time something new breaks.
