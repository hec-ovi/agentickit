# @hec-ovi/agentickit

**An npm package for adding your own AI copilot to a React app.** Reads your app's state, fills forms, confirms destructive actions, and calls any tool you define (database queries, web search, custom functions in your stack). Built on the [Vercel AI SDK 6](https://ai-sdk.dev). MIT.

[![npm version](https://img.shields.io/npm/v/%40hec-ovi%2Fagentickit.svg?color=black&label=npm)](https://www.npmjs.com/package/@hec-ovi/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](https://github.com/hec-ovi/agentickit/blob/main/LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-black.svg)](https://www.typescriptlang.org/)

![agentickit demo: the agent opens a popup, fills the form, calls multiple tools, and submits the trip](https://raw.githubusercontent.com/hec-ovi/agentickit/main/docs/demo.gif)

> The agent controls the website end to end: opens the new-trip popup, fills every field, calls multiple tools (weather, flights, hotels), and submits the completed form back into the app. Recorded against a local vLLM server in the `examples/travel` app, then trimmed and sped up.

## What it does

- Reads your app state so the assistant has real context, not guesses.
- Fills forms automatically. Optional confirmation step before submit.
- Confirms destructive actions before they run. Built-in human-in-the-loop gate.
- Calls tools you define: database operations, file uploads, anything in your stack.
- Ships ready-to-use skills for web search (Serper, Tavily, Firecrawl, DuckDuckGo) and chart rendering. Add your own with `agentickit add-skill <name>`.
- **Multi-agent.** Different assistants for different pages, modes, or permission levels (customer-facing, admin, read-only). Each has its own tools, prompt, and rules. Switch on the fly.

## Install and try it

```bash
npm install @hec-ovi/agentickit
npx agentickit init
```

You get the React hooks, a sidebar chat surface, a one-line server route, and a `.pilot/` folder where you teach the copilot about your app in plain markdown (no TypeScript for the skill files).

## Tested

- 579 automated tests across 56 files (478 on the package, 101 on the travel example).
- Verified live against a local vLLM model on the `examples/travel` template. The GIF above is that recording.

## Links

- [Full documentation, roadmap, FAQ on GitHub](https://github.com/hec-ovi/agentickit)
- [CHANGELOG](./CHANGELOG.md)
- [Runnable demo: `examples/travel`](https://github.com/hec-ovi/agentickit/tree/main/examples/travel)
- [Report an issue](https://github.com/hec-ovi/agentickit/issues)

---

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

See the "At a glance" snippet above, or the [runnable demo](https://github.com/hec-ovi/agentickit/tree/master/examples/travel) for a multi-route trip-planning app that wires every primitive (state, action, form, renderAndWait, instructions, all four chat surfaces, multi-agent registry, custom `renderConfirm` modal, headless `<PilotChatView>`, live agent-state HUD) plus three theme modes, a real-LLM AG-UI bridge, and **eleven fat skills under `.pilot/`** that compose the system prompt at startup. The travel README has a capability map showing which file demonstrates which package surface.

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

Skills are NOT general-purpose agent capabilities, NOT executable code, and NOT shared across apps. They're your app's instruction manual for its own copilot, version-controlled alongside the app. `RESOLVER.md` is the index that lists every skill; the loader is **RESOLVER-driven** (only skills referenced by RESOLVER load, in RESOLVER order, NOT alphabetical). Always-on warnings fire on startup for orphan skill folders (file exists but RESOLVER does not list it) and missing files (RESOLVER lists them but the file is gone), so a misconfigured `.pilot/` is loud, not silent.

Workflow: edit a markdown file, restart the dev server, behavior changes (no TypeScript touched, no rebuild). Frontmatter is a strict superset of Anthropic's Agent Skills spec and Garry Tan's gbrain `SKILL.md` convention so skills can be shared with Claude Code, Cursor, and MCP-compatible tools where it makes sense.

Stock skills shipped today (install with `npx agentickit add-skill <name>`): `web-search` (4 backends with rich SKILL.md guidance) and `chart` (inline panel with show/hide actions). Run `npx agentickit list-skills` to browse.

Full spec + interop notes (Claude Code, Cursor, MCP): [`.pilot/` docs on GitHub](https://github.com/hec-ovi/agentickit#the-pilot-skills-folder).

### CLI

Ships as the `agentickit` bin (no extra install; it's a transitive bin once you install the package). Skills-first: every CLI-scaffolded capability is a skill (markdown instructions plus optional hook code), never a "tool" without instructions. There is no `add-tool` command.

```bash
npx agentickit init                              # create .pilot/ with one example skill
npx agentickit add-skill <name>                  # if <name> matches a stock template, install it;
                                                 # else scaffold a custom skill (see --type)
npx agentickit add-skill <name> --type text          # SKILL.md only (pure instruction skill)
npx agentickit add-skill <name> --type server-tool   # SKILL.md + src/plugins/<name>.tsx + server/<name>/index.ts
npx agentickit add-skill <name> --type ui-component  # SKILL.md + src/plugins/<name>.tsx (show/hide actions + panel)
npx agentickit list-skills                       # list stock skill templates you can install by name
npx agentickit list-agents                       # list stock agent templates (chat, observational)
npx agentickit add-agent <name> --type T         # scaffold an agent (defaults to --type chat)
npx agentickit --help                            # usage + exit codes
npx agentickit --version                         # current package version
```

Stock skills shipped today: `web-search` (4 backends: DuckDuckGo, Tavily, Firecrawl, Serper) and `chart` (inline panel with show/hide actions). `add-skill <name>` auto-detects whether `<name>` matches a stock template; if it does, the manifest's `type` wins and a conflicting `--type` is rejected.

Skill names must be kebab-case. `init` refuses to overwrite an existing folder; `add-skill` refuses to overwrite any existing file (skill folder, plugin file, or server endpoint). Stock installs append env-var stubs to `.env.example` idempotently. Full reference: [CLI docs on GitHub](https://github.com/hec-ovi/agentickit#the-agentickit-cli).

The bundled `web-search` skill template and the `observational` agent template assume a [Hono](https://hono.dev) server (`app.get('/api/...', handler)` style), the same shape `examples/travel/server/index.ts` uses. If you're on Express, Next.js Route Handlers, or Cloudflare Workers, the route bodies translate one-to-one; the import lines are what change.

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

Ships with **450+ automated tests** across 35+ files (`pnpm test`). The suite includes component-level integration scenarios that mount a real `<Pilot>` tree in `happy-dom`, replay scripted SSE frames, simulate user clicks, and assert on exact HTTP fetch counts so the dangerous class of bugs (infinite resubmit loops that drain API credits) fails CI before it ships. Plus chat-surface tests with real `fireEvent` user simulation, renderAndWait HITL tests, runtime-swap + AG-UI tests against a fake AG-UI agent that exercises the real `defaultApplyEvents` apply pipeline, generative-UI tests for `<PilotAgentStateView>`, multi-agent registry tests covering registration lifecycle and per-agent state isolation under Pilot, exhaustive CLI tests pinning every `--type` variant for `add-skill`, and unit coverage for every public hook + the server handler + the `.pilot/` parsers + the loader's orphan/missing warnings.

Beyond the mocked suite, the package is verified end-to-end against a local **vLLM** server (Qwen3 family) via two paths. (1) The bundled `examples/travel` app exercises multi-tool conversation turns across the trip-detail / itinerary / booking / packing routes, confirm-modal approve and decline branches on every mutating tool, progressive form fill plus submit through `usePilotForm`, auto-generated `update_<name>` state setters, real LLM specialists reached over an AG-UI `HttpAgent` bridge with curated tool subsets, and disk-logging via `log: true`. (2) A gated live test (`handler.live-vllm-pilot.test.ts`, runs when `VLLM_BASE_URL` is set) plants a unique secret token inside a SKILL.md body and asks the model to recall it. Cryptographic proof the `.pilot/` loader is wired through `createPilotHandler` to the real model.

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
