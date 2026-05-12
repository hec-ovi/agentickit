# @hec-ovi/agentickit

**Wire an AI copilot into your React app's state, actions, and forms.**

Three hooks, four chat surfaces (sidebar, popup, modal, headless), swappable runtime (default AI SDK 6, optional AG-UI), an optional `.pilot/` skills folder, and a one-line server handler. Built on the [Vercel AI SDK 6](https://ai-sdk.dev). MIT.

[![npm version](https://img.shields.io/npm/v/%40hec-ovi%2Fagentickit.svg?color=black&label=npm)](https://www.npmjs.com/package/@hec-ovi/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](https://github.com/hec-ovi/agentickit/blob/master/LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-black.svg)](https://www.typescriptlang.org/)

> Sits in the gap between Vercel AI SDK's primitives and CopilotKit's enterprise framework: small, typed, opinionated on the integration layer. Optional AG-UI runtime lets you mount the same chat surfaces on top of LangGraph CoAgents, CrewAI, Mastra, or any `AbstractAgent`.

> ### The `.pilot/` skills folder is the heart of this project
>
> The hooks, the chat surfaces, the runtime, the CLI: all of it is wiring. The actual differentiator is the `.pilot/` folder you ship inside YOUR app. It's where you teach your app's copilot about your app's own UI capabilities and rules.
>
> Concrete example. Your app has a chart panel that's hidden by default. You want the user to be able to say "show me a breakdown of my trips" and have the agent open the panel. You write two things:
>
> 1. A `usePilotAction({ name: "show_chart", ... })` registration in React that opens the panel.
> 2. A `.pilot/skills/chart/SKILL.md` that tells the agent what the panel is for, the trigger phrases ("show me stats", "visualize", "I'm done with it"), and which tool to call. Markdown teaches; code executes. The pair ships together.
>
> Skills are NOT general-purpose agent capabilities. They're NOT executable code. They're NOT shared across apps. They're your app's instruction manual for its own copilot, version-controlled alongside the app, hot-reloadable on server restart, no TypeScript touched. The `agentickit init` CLI scaffolds the folder; `agentickit add-skill <name>` adds each capability. Full explanation in the [`.pilot/` skills folder](#pilot-skills-folder) section.
>
> Note. This repo also has a `/.pilot/` at the root, but that one is a separate audience: it teaches AI coding assistants (Claude, Cursor) how to develop the framework itself. The consumer-app `.pilot/` (yours, inside your app) is the one that matters for the value prop.

- 📦 [Full documentation + roadmap + FAQ on GitHub](https://github.com/hec-ovi/agentickit)
- 🧪 [Testing notes (300+ automated tests + vLLM e2e)](https://github.com/hec-ovi/agentickit#testing)
- 📜 [CHANGELOG](./CHANGELOG.md)
- 🎮 [Runnable demo: `examples/travel`](https://github.com/hec-ovi/agentickit/tree/master/examples/travel)
- 🐛 [Report an issue](https://github.com/hec-ovi/agentickit/issues)

---

## At a glance

```tsx
"use client";
import { useState } from "react";
import { z } from "zod";
import { Pilot, PilotSidebar, usePilotState, usePilotAction } from "@hec-ovi/agentickit";

function Checkout() {
  const [total, setTotal] = useState(42);

  usePilotState({
    name: "cart_total",
    description: "Current cart total in USD.",
    value: total,
    schema: z.number(),
  });

  usePilotAction({
    name: "apply_discount",
    description: "Apply a percentage discount to the cart.",
    parameters: z.object({ percent: z.number().min(0).max(100) }),
    handler: ({ percent }) => setTotal((t) => t * (1 - percent / 100)),
    mutating: true,
  });

  return <>{/* your app */}</>;
}

export default function App() {
  return (
    <Pilot apiUrl="/api/pilot">
      <Checkout />
      <PilotSidebar />
    </Pilot>
  );
}
```

The AI now sees `cart_total` and can call `apply_discount`. `mutating: true` pops a confirmation dialog before any side effect lands.

---

## Install

```bash
# One line. `ai`, `@ai-sdk/react`, `zod`, `nanoid` are regular deps of
# the package and come along automatically (you don't need to list them).
npm install @hec-ovi/agentickit

# Plus exactly one provider adapter (optional peer deps, install what you use):
npm install @openrouter/ai-sdk-provider    # free tier, no credit card
#   or: npm install @ai-sdk/openai         # OPENAI_API_KEY
#   or: npm install @ai-sdk/anthropic      # ANTHROPIC_API_KEY
#   or: npm install @ai-sdk/groq           # GROQ_API_KEY
#   or: npm install @ai-sdk/google         # GOOGLE_GENERATIVE_AI_API_KEY
#   or: npm install @ai-sdk/mistral        # MISTRAL_API_KEY
# (Or skip adapters and set AI_GATEWAY_API_KEY to route through the Vercel AI Gateway.)

# Optional, only required for usePilotForm:
npm install react-hook-form
```

**Peer requirements:** React 18 or 19, Node 20+, a framework with Web Fetch on the server (Next.js App Router, Bun, Cloudflare Workers, Hono).

---

## Quick start (Next.js)

### 1. Server route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

// Auto-detects a provider from whichever API key is in your env.
export const POST = createPilotHandler({});
```

Set exactly one of `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, or `AI_GATEWAY_API_KEY`. The handler picks the first it finds and uses a tool-calling-capable default model for that provider.

Want explicit control? Pass `model: "openai/gpt-4o-mini"` (or any `"<provider>/<model>"` string). Or hand in a `LanguageModel` instance for Ollama / Azure / Bedrock / anything off the built-in list:

```ts
import { createOllama } from "ai-sdk-ollama";
export const POST = createPilotHandler({ model: createOllama()("llama3.3") });
```

### 2. Wrap your app

```tsx
// app/layout.tsx
"use client";
import { Pilot, PilotSidebar } from "@hec-ovi/agentickit";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <Pilot apiUrl="/api/pilot">
      {children}
      <PilotSidebar />
    </Pilot>
  );
}
```

### 3. Expose state + register actions

See the "At a glance" snippet above, or the [runnable demo](https://github.com/hec-ovi/agentickit/tree/master/examples/travel) for a multi-route trip-planning app that wires every primitive (state, action, form, renderAndWait, instructions, all four chat surfaces, multi-agent registry) plus three theme modes and a real-LLM AG-UI bridge.

---

## API reference

### Hooks

| Hook | Purpose | Auto-registers |
| --- | --- | --- |
| `usePilotState({ name, description, value, schema, setValue? })` | Expose React state to the AI | `update_<name>` tool when `setValue` is supplied |
| `usePilotAction({ name, description, parameters, handler, mutating?, renderAndWait? })` | Register a typed, AI-callable tool. Handler runs in the browser. `renderAndWait` mounts a custom UI and pauses until the user resolves it | (none) |
| `usePilotForm(form, { name?, confirm? })` | Attach a `react-hook-form` instance. `confirm: { submit?, reset? }` per-form opt-out for the confirm-modal gate (defaults to `true`) | `set_<name>_field`, `submit_<name>`, `reset_<name>` |
| `usePilotInstructions({ name, value })` | Add page-scoped instructions to the system prompt. Auto-cleans up on unmount so route-specific guidance doesn't leak across pages | (none) |
| `usePilotAgentState<T>(agent)` | Subscribe to an AG-UI agent's state via STATE_SNAPSHOT / STATE_DELTA | (none) |
| `usePilotAgentActivity(agent)` | Subscribe to an AG-UI agent's ACTIVITY_* and REASONING_* streams | (none) |

`mutating: true` on any action (or via `usePilotState`'s auto-registered update tool) triggers a themed confirm modal before the handler fires. Override the modal via `<Pilot renderConfirm={…} />`.

### Components

| Component | Purpose |
| --- | --- |
| `<Pilot apiUrl? model? headers? runtime? renderConfirm?>` | Top-level provider. Owns the tool / state / form registry and drives the runtime (`localRuntime` by default, swappable). Auto-registers an `inspect_context` tool the agent can call to introspect everything you've registered |
| `<PilotSidebar mode? composer? suggestions?>` | Slide-in chat panel. `mode="overlay"` (default, floats over content) or `mode="push"` (squeezes the page). `composer="full" \| "suggestions" \| "off"` controls visibility. Dark mode, CSS-variable theming, keyboard-accessible |
| `<PilotPopup composer?>` | Floating chat bubble anchored to a corner. Toggle hides while open (Intercom convention) |
| `<PilotModal composer?>` | Centered backdrop dialog. Controlled-only, focus trap, Escape and backdrop-click close, focus restoration |
| `<PilotChatView composer?>` | Headless chat body the others wrap. Mount inside any custom chrome |
| `<PilotAgentStateView />` | Generative-UI helper. Renders a child node from streamed agent state via `usePilotAgentState` |
| `<PilotAgentRegistry>` | Top-level provider holding a `Map<agentId, AbstractAgent>`. Optional; only needed for multi-agent setups |
| `<PilotConfirmModal />` | Themed confirm modal for mutating actions. Re-exported for custom `renderConfirm` layouts |

### Runtimes

| Function | Purpose |
| --- | --- |
| `localRuntime({ apiUrl?, model?, initialMessages?, onMessagesChange? })` | Default. Drives `useChat` from `@ai-sdk/react` against the HTTP route created by `createPilotHandler`. `initialMessages` seeds the conversation; `onMessagesChange` fires on every message-array change for per-thread persistence |
| `agUiRuntime({ agent })` | Drives an AG-UI `AbstractAgent` from `@ag-ui/client`. Optional peer dep; install `@ag-ui/client` + `@ag-ui/core` to use |

### Multi-agent registry (Agent Lock Mode)

| Export | Purpose |
| --- | --- |
| `<PilotAgentRegistry>` | Top-level provider holding a `Map<agentId, AbstractAgent>`. Optional; only needed for multi-agent setups |
| `useRegisterAgent(id, factory)` | Construct an agent once and publish under `id`. Returns the agent reference |
| `useAgent(id)` | Read a registered agent by id. Returns `undefined` for unknown ids; re-renders on registry changes |
| `useAgents()` | List every registered agent for picker UIs |

### Server

```ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";
```

`createPilotHandler({ model?, system?, pilotDir?, allowTools?, maxSteps?, getProviderOptions?, debug?, log?, onLogEvent? })` returns a `(Request) => Promise<Response>` for any Web Fetch runtime.

| Option | Default | Notes |
| --- | --- | --- |
| `model` | auto | `"<provider>/<model>"` string, `LanguageModel` instance, or a thunk. Omitted → walks env for a provider key |
| `system` | auto | Server-owned system prompt. When omitted, auto-loads `./.pilot/`. Pass a string to override, or `false` to disable |
| `pilotDir` | `".pilot"` | Directory the auto-load reads from (relative to `process.cwd()`) |
| `allowTools` | all | Per-agent tool whitelist. When set, only the listed client-registered tool names reach this handler. Lets you mount specialist endpoints (flights agent, hotels agent, etc.) that share a registry but see different subsets |
| `maxSteps` | `5` | Upper bound on tool-call → result → follow-up iterations per request |
| `getProviderOptions` | none | Per-request provider tuning (caching hints, thinking budgets) |
| `debug` | `false` | Stream a compact per-request transcript to the server console |
| `log` | `false` | Append the same lines to `./debug/agentickit-YYYY-MM-DD.log` (pass a string for a custom dir) |
| `onLogEvent` | none | Structured `PilotLogEvent` subscriber. Wire to SSE / EventEmitter for live observability |

Full options reference, security notes, and runtime matrix: [server-handler docs on GitHub](https://github.com/hec-ovi/agentickit#server-handler).

### `.pilot/` skills folder

**This is how YOUR app teaches the agent about itself.** A skill is a markdown file (`.pilot/skills/<name>/SKILL.md`) that ships with your app and gets injected into the agent's system prompt at server startup. Use it to encode app-specific knowledge the model can't infer from tool signatures: domain rules ("always quote prices in USD"), terminology ("a 'trip' has a primary destination and 0+ stops"), UI guidance ("prefer the itinerary editor over chat for date changes"), brand voice, escalation rules, anything that should hold for every conversation in your app.

Skills are NOT general-purpose agent capabilities, NOT executable code, and NOT shared across apps. They're your app's instruction manual for its own copilot, version-controlled alongside the app. `RESOLVER.md` is the index that lists every skill so the loader knows what to compose.

Workflow: edit a markdown file, restart the dev server, behavior changes (no TypeScript touched, no rebuild). Frontmatter is a strict superset of Anthropic's Agent Skills spec and Garry Tan's gbrain `SKILL.md` convention so skills can be shared with Claude Code, Cursor, and MCP-compatible tools where it makes sense.

Full spec + interop notes (Claude Code, Cursor, MCP): [`.pilot/` docs on GitHub](https://github.com/hec-ovi/agentickit#the-pilot-skills-folder).

### CLI

Ships as the `agentickit` bin (no extra install; it's a transitive bin once you install the package).

```bash
npx agentickit init                       # create .pilot/ with one example skill
npx agentickit add-skill <name>           # add skills/<name>/SKILL.md + register it in RESOLVER.md
npx agentickit list-tools                 # list stock tool plugins shipped with the package
npx agentickit add-tool <name>            # scaffold a stock tool (e.g. web-search) into your repo
npx agentickit list-agents                # list stock agent templates (chat, observational)
npx agentickit add-agent <name> --type T  # scaffold an agent into your repo (defaults to chat)
npx agentickit --help               # usage + exit codes
npx agentickit --version            # current package version
```

Skill names must be kebab-case. `init` refuses to overwrite an existing folder; `add-skill` refuses duplicates and requires `.pilot/` to exist first. Both commands emit the canonical markdown shape the parser accepts (hand-edit the prose, leave the frontmatter keys alone). Full reference: [CLI docs on GitHub](https://github.com/hec-ovi/agentickit#the-agentickit-cli).

The bundled `web-search` and `observational` agent templates assume a [Hono](https://hono.dev) server (`app.get('/api/...', handler)` style), the same shape `examples/travel/server/index.ts` uses. If you're on Express, Next.js Route Handlers, or Cloudflare Workers, the route bodies translate one-to-one; the import lines are what change.

### Protocol parsers (advanced)

```ts
import { parseResolver, parseSkill } from "@hec-ovi/agentickit/protocol";
```

`createPilotHandler` uses these internally. You only need them if you're building tooling on top of the `.pilot/` format.

---

## Provider support

| Prefix | Env var | Peer package | Auto-detect default |
| --- | --- | --- | --- |
| `openai/` | `OPENAI_API_KEY` | `@ai-sdk/openai` | `openai/gpt-4o-mini` |
| `anthropic/` | `ANTHROPIC_API_KEY` | `@ai-sdk/anthropic` | `anthropic/claude-haiku-4-5` |
| `groq/` | `GROQ_API_KEY` | `@ai-sdk/groq` | `groq/llama-3.3-70b-versatile` |
| `openrouter/` | `OPENROUTER_API_KEY` | `@openrouter/ai-sdk-provider` | `openrouter/qwen/qwen3-coder:free` |
| `google/` | `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` | `google/gemini-2.5-flash` |
| `mistral/` | `MISTRAL_API_KEY` | `@ai-sdk/mistral` | `mistral/mistral-small-latest` |
| _any of the above_ | `AI_GATEWAY_API_KEY` | none, routes through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) | `openai/gpt-4o-mini` |

OpenAI-compatible local servers (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra) work via `OPENAI_BASE_URL` and use the Responses API by default, same as real OpenAI. If your server is an older Responses implementation that never emits `function_call_arguments.done` and stalls `useChat`'s tool-call lifecycle, set `AGENTICKIT_OPENAI_PROTOCOL=chat` to fall back to Chat Completions. For anything outside this list, pass a `LanguageModel` instance directly.

---

## Why `@hec-ovi/agentickit`?

- **vs CopilotKit:** CopilotKit is the Fortune-500 choice (CoAgents, managed cloud, ~60 kLoC). agentickit is ~10% of that surface, for solo devs and small teams who want the integration layer without the platform. We do speak AG-UI via the optional `agUiRuntime` so you can drop us in front of any AG-UI agent without their full runtime.
- **vs assistant-ui:** assistant-ui ships 30+ chat primitives for you to assemble. agentickit ships four opinionated chat surfaces plus the state/actions/forms wiring assistant-ui leaves to you.
- **vs raw AI SDK:** `useChat` + `streamText` is the right call if you want to write the integration layer yourself. agentickit *is* that layer.

Full comparison table: [alternatives on GitHub](https://github.com/hec-ovi/agentickit#compared-to-alternatives).

---

## Testing

Ships with **300+ automated tests** across 30+ files (`pnpm test`). The suite includes component-level integration scenarios that mount a real `<Pilot>` tree in `happy-dom`, replay scripted SSE frames, simulate user clicks, and assert on exact HTTP fetch counts so the dangerous class of bugs (infinite resubmit loops that drain API credits) fails CI before it ships. Plus chat-surface tests with real `fireEvent` user simulation, renderAndWait HITL tests, runtime-swap + AG-UI tests against a fake AG-UI agent that exercises the real `defaultApplyEvents` apply pipeline, generative-UI tests for `<PilotAgentStateView>`, multi-agent registry tests covering registration lifecycle and per-agent state isolation under Pilot, and unit coverage for every public hook + the server handler + the `.pilot/` parsers + the CLI.

Beyond the mocked suite, the package is verified end-to-end against a local **vLLM** server (Qwen3 family) via the bundled `examples/travel` app: multi-tool conversation turns across the trip-detail / itinerary / booking / packing routes, confirm-modal approve and decline branches on every mutating tool, progressive form fill plus submit through `usePilotForm`, auto-generated `update_<name>` state setters, real LLM specialists reached over an AG-UI `HttpAgent` bridge with curated tool subsets, and the full structured observability path through `debug` / `log` / `onLogEvent`.

Full testing notes + verified flows + known gaps: [Testing section on GitHub](https://github.com/hec-ovi/agentickit#testing).

---

## Exports

```ts
import {
  Pilot,
  PilotSidebar,
  PilotPopup,
  PilotModal,
  PilotChatView,
  PilotAgentStateView,
  PilotAgentRegistry,
  PilotConfirmModal,
  usePilotState,
  usePilotAction,
  usePilotForm,
  usePilotInstructions,
  localRuntime,
  agUiRuntime,
  usePilotAgentState,
  usePilotAgentActivity,
  useRegisterAgent,
  useAgent,
  useAgents,
  type PilotProps,
  type PilotSidebarProps,
  type PilotPopupProps,
  type PilotPopupPosition,
  type PilotModalProps,
  type PilotChatViewProps,
  type PilotChatViewHandle,
  type PilotChatViewLabels,
  type PilotAgentStateViewProps,
  type PilotAgentRegistryProps,
  type PilotConfig,
  type PilotConfirmModalProps,
  type PilotActionRegistration,
  type PilotStateRegistration,
  type PilotFormRegistration,
  type PilotConfirmRender,
  type PilotConfirmRenderArgs,
  type PilotRenderAndWait,
  type PilotRenderAndWaitArgs,
  type PilotRuntime,
  type PilotRuntimeConfig,
  type PilotIncomingToolCall,
  type AgUiRuntimeOptions,
} from "@hec-ovi/agentickit";

import {
  createPilotHandler,
  autoDetectModel,
  loadPilotProtocol,
  type CreatePilotHandlerOptions,
  type LoadPilotProtocolOptions,
  type ModelSpec,
  type PilotErrorBody,
  type PilotLogEvent,
  type PilotLogEventMeta,
  type LogKind,
} from "@hec-ovi/agentickit/server";

import {
  parseResolver,
  parseSkill,
  type ResolverEntry,
  type SkillFrontmatter,
} from "@hec-ovi/agentickit/protocol";
```

---

## License

MIT © 2026 [Hector Oviedo](https://github.com/hec-ovi). See [LICENSE](./LICENSE).

Inspired by [CopilotKit](https://github.com/CopilotKit/CopilotKit) and [assistant-ui](https://github.com/assistant-ui/assistant-ui) (both MIT). Built on [Vercel AI SDK](https://ai-sdk.dev) (Apache 2.0). `.pilot/` protocol inspired by Garry Tan's [gbrain](https://github.com/garrytan/gbrain) and [Anthropic's Agent Skills](https://github.com/anthropics/skills) standard.
