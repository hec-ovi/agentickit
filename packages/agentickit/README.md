# @hec-ovi/agentickit

**Wire an AI copilot into your React app's state, actions, and forms.**

Three hooks, one sidebar, an optional `.pilot/` skills folder, and a one-line server handler. Built on the [Vercel AI SDK 6](https://ai-sdk.dev). MIT.

[![npm version](https://img.shields.io/npm/v/%40hec-ovi%2Fagentickit.svg?color=black&label=npm)](https://www.npmjs.com/package/@hec-ovi/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](https://github.com/hec-ovi/agentickit/blob/master/LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-black.svg)](https://www.typescriptlang.org/)

> Sits in the gap between Vercel AI SDK's primitives and CopilotKit's enterprise framework: small, typed, opinionated on the integration layer. Not a chatbot framework, not a browser-use agent, not a LangGraph runner.

- 📦 [Full documentation + roadmap + FAQ on GitHub](https://github.com/hec-ovi/agentickit)
- 🧪 [Testing notes (170 automated tests + vLLM e2e)](https://github.com/hec-ovi/agentickit#testing)
- 📜 [CHANGELOG](./CHANGELOG.md)
- 🎮 [Runnable demo: `examples/todo`](https://github.com/hec-ovi/agentickit/tree/master/examples/todo) — Vite + Hono with three widgets and a live tool-call log panel
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
npm install @hec-ovi/agentickit ai @ai-sdk/react zod

# Plus exactly one provider adapter (optional peer deps — install what you use):
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

See the "At a glance" snippet above, or the [runnable demo](https://github.com/hec-ovi/agentickit/tree/master/examples/todo) for three widgets (todo list, contact form, preferences) wired to every hook.

---

## API reference

### Hooks

| Hook | Purpose | Auto-registers |
| --- | --- | --- |
| `usePilotState({ name, description, value, schema, setValue? })` | Expose React state to the AI | `update_<name>` tool when `setValue` is supplied |
| `usePilotAction({ name, description, parameters, handler, mutating? })` | Register a typed, AI-callable tool. Handler runs in the browser | — |
| `usePilotForm(form, { name?, ghostFill? })` | Attach a `react-hook-form` instance | `set_<name>_field`, `submit_<name>`, `reset_<name>` |

`mutating: true` on any action (or via `usePilotState`'s auto-registered update tool) triggers a themed confirm modal before the handler fires. Override the modal via `<Pilot renderConfirm={…} />`.

### Components

| Component | Purpose |
| --- | --- |
| `<Pilot apiUrl? model? headers? renderConfirm?>` | Top-level provider. Owns the tool / state / form registry and drives AI SDK 6's `useChat` |
| `<PilotSidebar />` | Slide-in chat panel. Dark mode, CSS-variable theming, suggestion chips, keyboard-accessible |
| `<PilotConfirmModal />` | Themed confirm modal for mutating actions. Re-exported for custom layouts |

### Server

```ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";
```

`createPilotHandler({ model?, system?, pilotDir?, maxSteps?, getProviderOptions?, debug?, log?, onLogEvent? })` returns a `(Request) => Promise<Response>` for any Web Fetch runtime.

| Option | Default | Notes |
| --- | --- | --- |
| `model` | auto | `"<provider>/<model>"` string, `LanguageModel` instance, or a thunk. Omitted → walks env for a provider key |
| `system` | auto | Server-owned system prompt. When omitted, auto-loads `./.pilot/`. Pass a string to override, or `false` to disable |
| `pilotDir` | `".pilot"` | Directory the auto-load reads from (relative to `process.cwd()`) |
| `maxSteps` | `5` | Upper bound on tool-call → result → follow-up iterations per request |
| `getProviderOptions` | none | Per-request provider tuning (caching hints, thinking budgets) |
| `debug` | `false` | Stream a compact per-request transcript to the server console |
| `log` | `false` | Append the same lines to `./debug/agentickit-YYYY-MM-DD.log` (pass a string for a custom dir) |
| `onLogEvent` | none | Structured `PilotLogEvent` subscriber — wire to SSE / EventEmitter for live observability |

Full options reference, security notes, and runtime matrix: [server-handler docs on GitHub](https://github.com/hec-ovi/agentickit#server-handler).

### `.pilot/` skills folder

Ship capabilities as markdown. The server reads `RESOLVER.md` plus every `skills/<name>/SKILL.md` at startup and composes the system prompt from them. Edit markdown, restart the dev server, behavior changes — no TypeScript touched. Frontmatter is a strict superset of Anthropic's Agent Skills spec and Garry Tan's gbrain SKILL.md convention.

Full spec + interop notes (Claude Code, Cursor, MCP): [`.pilot/` docs on GitHub](https://github.com/hec-ovi/agentickit#the-pilot-skills-folder).

### CLI

Ships as the `agentickit` bin (no extra install — it's a transitive bin once you install the package).

```bash
npx agentickit init                 # create .pilot/ with one example skill
npx agentickit add-skill <name>     # add skills/<name>/SKILL.md + register it in RESOLVER.md
npx agentickit --help               # usage + exit codes
npx agentickit --version            # current package version
```

Skill names must be kebab-case. `init` refuses to overwrite an existing folder; `add-skill` refuses duplicates and requires `.pilot/` to exist first. Both commands emit the canonical markdown shape the parser accepts — hand-edit the prose, leave the frontmatter keys alone. Full reference: [CLI docs on GitHub](https://github.com/hec-ovi/agentickit#the-agentickit-cli).

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
| _any of the above_ | `AI_GATEWAY_API_KEY` | none — routes through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) | `openai/gpt-4o-mini` |

OpenAI-compatible local servers (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra) work via `OPENAI_BASE_URL` — the handler automatically switches the adapter to Chat Completions mode so tool-calling stays wired. For anything not in this list, pass a `LanguageModel` instance.

---

## Why `@hec-ovi/agentickit`?

- **vs CopilotKit** — CopilotKit is the Fortune-500 choice (AG-UI, CoAgents, managed cloud, ~60 kLoC). agentickit is ~5 % of that surface, for solo devs and small teams who want the integration layer without the platform.
- **vs assistant-ui** — assistant-ui ships 30+ chat primitives for you to assemble. agentickit ships one opinionated sidebar plus the state/actions/forms wiring assistant-ui leaves to you.
- **vs raw AI SDK** — `useChat` + `streamText` is the right call if you want to write the integration layer yourself. agentickit *is* that layer.

Full comparison table: [alternatives on GitHub](https://github.com/hec-ovi/agentickit#compared-to-alternatives).

---

## Testing

Ships with **170 automated tests** across 15 files (`pnpm test`). The suite includes 23 component-level integration scenarios that mount a real `<Pilot>` tree in `happy-dom`, replay scripted SSE frames, simulate user clicks, and assert on exact HTTP fetch counts — so the dangerous class of bugs (infinite resubmit loops that drain API credits) fails CI before it ships.

Beyond the mocked suite, `v0.1.0` was verified end-to-end against a local **vLLM** server running `openai/gpt-oss-120b` via the bundled `examples/todo` app: multi-tool conversation turns, confirm-modal approve + decline branches, progressive form fill + submit, auto-generated `update_<name>` state setters, and the full structured observability path through `debug` / `log` / `onLogEvent`.

Full testing notes + verified flows + known gaps: [Testing section on GitHub](https://github.com/hec-ovi/agentickit#testing).

---

## Exports

```ts
import {
  Pilot,
  PilotSidebar,
  PilotConfirmModal,
  usePilotState,
  usePilotAction,
  usePilotForm,
  type PilotSidebarProps,
  type PilotConfig,
  type PilotActionRegistration,
  type PilotStateRegistration,
  type PilotFormRegistration,
  type PilotMessage,
  type PilotMessagePart,
  type PilotConfirmRender,
  type PilotConfirmRenderArgs,
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
