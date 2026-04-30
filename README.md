# agentickit

**Wire an AI copilot into your React app's state, actions, and forms.** Three hooks, four chat surfaces, swappable runtime, optional `.pilot/` skills folder.

[![npm](https://img.shields.io/npm/v/%40hec-ovi%2Fagentickit.svg?color=black)](https://www.npmjs.com/package/@hec-ovi/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)

<!-- DEMO_GIF_HERE -->

```tsx
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

That's the smallest working setup. Three hooks. One chat surface. One server route. The AI now sees `cart_total` and can call `apply_discount`.

---

## What ships

**Three hooks** to wire app state and actions to the AI:

- `usePilotState`: expose state (Zod-typed, optional setter for AI-driven writes).
- `usePilotAction`: register a tool (typed parameters, `handler`, optional `renderAndWait` for human-in-the-loop pause-and-resume).
- `usePilotForm`: bind a `react-hook-form` instance so the assistant can fill and submit it.

**Four chat surfaces** (pick one or roll your own):

- `<PilotSidebar>`: slide-in panel docked to a viewport edge.
- `<PilotPopup>`: floating bubble anchored to a corner (Intercom-style).
- `<PilotModal>`: centered backdrop dialog with focus trap and focus restoration.
- `<PilotChatView>`: headless body the others use; mount it inside any custom chrome.

All four read from the same `<Pilot>` provider, so they share registry, confirm-modal, HITL gate, and runtime.

**Two runtimes** (swappable via `<Pilot runtime={...}>`):

- `localRuntime()` (default): drives `useChat` from `@ai-sdk/react` against an HTTP route that streams AI SDK 6 UIMessage frames. This is what `createPilotHandler` listens on.
- `agUiRuntime({ agent })`: drives an AG-UI `AbstractAgent` from `@ag-ui/client`. Lets you mount the same chat surfaces on top of LangGraph CoAgents, CrewAI, Mastra, Pydantic AI, or any custom `AbstractAgent` subclass without changing the UI layer.

**Plus** an optional `.pilot/` markdown protocol (`RESOLVER.md` + `skills/<name>/SKILL.md`) the server handler auto-loads, an `agentickit` CLI to scaffold it (`init`, `add-skill <name>`), and a one-line `createPilotHandler` for Next.js / Bun / Cloudflare Workers / Hono.

**It is not:** a chatbot framework, a browser-use agent, an MCP server, or an enterprise platform. If you need those, use the tool that specializes in them.

---

## Install

```bash
npm install @hec-ovi/agentickit

# Plus exactly one provider adapter for your model choice. The free-tier
# friendly default is OpenRouter (https://openrouter.ai/keys):
npm install @openrouter/ai-sdk-provider
# or one of:
#   npm install @ai-sdk/openai       # OPENAI_API_KEY
#   npm install @ai-sdk/anthropic    # ANTHROPIC_API_KEY
#   npm install @ai-sdk/groq         # GROQ_API_KEY
#   npm install @ai-sdk/google       # GOOGLE_GENERATIVE_AI_API_KEY
#   npm install @ai-sdk/mistral      # MISTRAL_API_KEY
# (or skip the adapter entirely and set AI_GATEWAY_API_KEY to route
#  through the Vercel AI Gateway.)

# Optional, only needed for usePilotForm:
npm install react-hook-form

# Optional, only if you use agUiRuntime:
npm install @ag-ui/client @ag-ui/core
```

Requires **Node 20+** and a framework that supports the Web Fetch API on the server (Next.js App Router, Bun, Cloudflare Workers, Hono). The examples below use Next.js 15.

---

## For AI agents

This repo ships with a root-level [`llms.txt`](./llms.txt) and a [`.pilot/`](./.pilot/) folder so any LLM agent can onboard cold, including a fresh Claude Code or Cursor session with no prior memory.

The path: read `llms.txt` first for the map, follow it to [`.pilot/AGENTS.md`](./.pilot/AGENTS.md) for the house rules and read order, then use [`.pilot/RESOLVER.md`](./.pilot/RESOLVER.md) to match the user's task to a `SKILL.md` file. Read the matching skill before writing code. Every snippet in `.pilot/` compiles against the current tree; the source under `packages/agentickit/src/` is the ground truth.

This `.pilot/` folder is also the canonical example of what an `agentickit`-using app's own `.pilot/` looks like when shipped.

---

## Try it in 60 seconds

### 1. Server route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

// Auto-detects a provider from your env. Set any ONE of GROQ_API_KEY,
// OPENROUTER_API_KEY (both free tier), OPENAI_API_KEY, ANTHROPIC_API_KEY,
// GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, or AI_GATEWAY_API_KEY.
export const POST = createPilotHandler({});
```

Install the matching provider adapter (e.g. `@ai-sdk/groq` for `GROQ_API_KEY`, `@openrouter/ai-sdk-provider` for `OPENROUTER_API_KEY`). Prefer an explicit model? Pass `model: "<provider>/<model-id>"` and the handler routes through the matching `@ai-sdk/*` adapter (e.g. `"openai/gpt-4o"` + `OPENAI_API_KEY`). Or set `AI_GATEWAY_API_KEY` to let the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) resolve any prefix server-side.

### 2. Wrap your app

```tsx
// app/layout.tsx  (or any client-side root)
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

### 3. Expose state, register an action

```tsx
"use client";
import { useState } from "react";
import { z } from "zod";
import { usePilotState, usePilotAction } from "@hec-ovi/agentickit";

export function TodoBoard() {
  const [todos, setTodos] = useState<string[]>([]);

  usePilotState({
    name: "todos",
    description: "Current list of todo items, in order.",
    value: todos,
    schema: z.array(z.string()),
  });

  usePilotAction({
    name: "add_todo",
    description: "Add a new todo to the end of the list.",
    parameters: z.object({ text: z.string().min(1) }),
    handler: ({ text }) => setTodos((t) => [...t, text]),
  });

  return <ul>{todos.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}
```

Open the sidebar, say *"add a todo to buy groceries."* The model calls `add_todo`, the list updates, and the assistant sees the new state on its next turn.

### 4. Or clone the runnable example

```bash
git clone https://github.com/hec-ovi/agentickit
cd agentickit
pnpm install
pnpm --filter @hec-ovi/agentickit build
cd examples/todo
cp .env.example .env.local       # pick your provider
pnpm dev
```

[`examples/todo`](./examples/todo) is a Vite + Hono demo with three widgets (todo list, contact form, preferences) and a live log panel that streams every tool call and token count. The `.pilot/` folder under it was scaffolded with `npx agentickit init` + `add-skill` calls, the same flow this README walks through.

---

## The three hooks

### `usePilotState`: expose state to the AI

```tsx
usePilotState({
  name: "cart_total",
  description: "Current cart total in USD.",
  value: total,
  schema: z.number(),
  setValue: setTotal,   // optional; omit to stay read-only
});
```

The AI always sees the latest `value` on the next turn. When `setValue` is supplied, agentickit auto-registers an `update_<name>` tool with `schema` as its input. The AI can propose whole-value updates and the handler routes them through your setter. `mutating: true` is implied, so the user gets a confirmation prompt before the write lands.

### `usePilotAction`: register a typed tool

```tsx
usePilotAction({
  name: "archive_card",
  description: "Archive a kanban card by id.",
  parameters: z.object({ cardId: z.string() }),
  handler: async ({ cardId }) => {
    await api.archive(cardId);
    return { ok: true };
  },
  mutating: true,
});
```

The handler runs in the browser. It has access to your React state, your auth'd `fetch`, and everything else a button's `onClick` would. Return values are JSON-serialized and fed back into the next model step so the assistant can narrate what happened.

`mutating: true` pops a confirmation dialog before the handler fires. Use it for anything destructive or side-effecting.

**Human-in-the-loop with `renderAndWait`:** instead of a `handler`, supply `renderAndWait` to mount your own UI and pause until the user resolves it.

```tsx
usePilotAction({
  name: "pick_letter",
  description: "Ask the user to pick a letter.",
  parameters: z.object({ prompt: z.string() }),
  renderAndWait: ({ input, respond, cancel }) => (
    <div>
      <p>{input.prompt}</p>
      <button onClick={() => respond({ letter: "A" })}>A</button>
      <button onClick={() => respond({ letter: "B" })}>B</button>
      <button onClick={() => cancel("changed mind")}>Skip</button>
    </div>
  ),
});
```

The model's tool call suspends until `respond(value)` (sends `value` as the tool output) or `cancel(reason)` (sends `{ ok: false, reason }`). Composes with `mutating`: the confirm modal gates first, then your UI mounts on approval. Auto-cancels with `"Action unmounted."` if the owning component unmounts mid-suspension.

### `usePilotForm`: react-hook-form integration

```tsx
import { useForm } from "react-hook-form";
import { usePilotForm } from "@hec-ovi/agentickit";

function InvoiceForm() {
  const form = useForm<{ email: string; amount: number }>();
  usePilotForm(form, { name: "invoice" });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register("email")} />
      <input type="number" {...form.register("amount", { valueAsNumber: true })} />
      <button type="submit">Send</button>
    </form>
  );
}
```

Registers three tools scoped to the form: `set_invoice_field`, `submit_invoice`, `reset_invoice`. The assistant can fill the form progressively, validate with `shouldValidate: true`, and submit via the same `onSubmit` path a click would take. Submission walks the registered field refs to find the `<form>` node; it will never submit a form outside your component tree.

---

## Chat surfaces

Four ways to render the chat. All four wrap `<PilotChatView>` inside chrome-specific layout, share the same `<Pilot>` provider, and consume the registry the hooks register.

```tsx
import { Pilot, PilotSidebar, PilotPopup, PilotModal, PilotChatView } from "@hec-ovi/agentickit";

<Pilot apiUrl="/api/pilot">
  <PilotSidebar />                                   {/* slide-in panel */}
  <PilotPopup position="bottom-right" />             {/* floating bubble */}
  <PilotModal open={open} onOpenChange={setOpen} /> {/* backdrop dialog */}

  {/* Or roll your own chrome around the headless body: */}
  <aside>
    <PilotChatView labels={{ title: "My copilot" }} />
  </aside>
</Pilot>
```

| Surface | Default position | Modality | Open state |
| --- | --- | --- | --- |
| `<PilotSidebar>` | docks to right edge | non-modal (`role="complementary"`) | uncontrolled |
| `<PilotPopup>` | bottom-right corner | non-modal | controlled or uncontrolled (`defaultOpen`) |
| `<PilotModal>` | centered overlay | modal (`aria-modal`, focus trap) | controlled only |
| `<PilotChatView>` | wherever you mount it | depends on your chrome | n/a |

All four accept `width`, `height`, `className`, `suggestions` (chip array shown in the empty state), and `labels` (i18n overrides). Sidebar and popup also accept `position`. Modal is controlled-only because that's how a backdrop dialog wants to behave; opening it is the consumer's call.

Theming is plain CSS variables (no Tailwind, no design system). Override on any parent scope:

```css
:root {
  --pilot-bg: #fff;
  --pilot-fg: #0a0a0a;
  --pilot-accent: #7c3aed;
  --pilot-user-bubble-bg: #ede9fe;
  --pilot-radius: 12px;
  --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
```

Dark mode is automatic (`prefers-color-scheme: dark`). Escape closes panel/modal and restores focus to the previously-focused element. `prefers-reduced-motion` disables the animations.

---

## Runtimes

`<Pilot>` ships with `localRuntime` by default. Pass a `runtime` prop to swap.

### `localRuntime()` (default)

Drives `useChat` from `@ai-sdk/react` against an HTTP route streaming AI SDK 6 UIMessage frames. This is what `createPilotHandler` listens on.

```tsx
<Pilot apiUrl="/api/pilot" model="openai/gpt-4o">
  ...
</Pilot>
```

When `apiUrl` and `model` are passed directly, the provider auto-constructs `localRuntime({ apiUrl, model })`. To configure explicitly:

```tsx
import { Pilot, localRuntime } from "@hec-ovi/agentickit";

const runtime = localRuntime({ apiUrl: "/api/pilot", model: "openai/gpt-4o" });

<Pilot runtime={runtime}>...</Pilot>
```

### `agUiRuntime({ agent })`

Drives an AG-UI `AbstractAgent` from [`@ag-ui/client`](https://github.com/ag-ui-protocol/ag-ui). Mounts the same chat surfaces on top of LangGraph CoAgents, CrewAI, Mastra, Pydantic AI, or any `AbstractAgent` subclass.

```tsx
import { useMemo } from "react";
import { Pilot, PilotSidebar, agUiRuntime } from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";

export default function App() {
  const agent = useMemo(
    () => new HttpAgent({ url: "https://my-langgraph-server.com/agent" }),
    [],
  );
  const runtime = useMemo(() => agUiRuntime({ agent }), [agent]);

  return (
    <Pilot runtime={runtime}>
      <Checkout />
      <PilotSidebar />
    </Pilot>
  );
}
```

The runtime subscribes to the agent's event stream (RUN_*, TEXT_MESSAGE_*, TOOL_CALL_*, STATE_*, ACTIVITY_*, REASONING_*), converts the AG-UI Message format into the AI SDK 6 UIMessage shape `<PilotChatView>` consumes, and bridges client-side tool calls. Tools registered via `usePilotAction` are forwarded as `Tool[]` on every run; when the agent emits `TOOL_CALL_END` for a registered tool, the runtime dispatches through the provider's confirm-modal and HITL gate, then appends a `role: "tool"` message and re-runs to continue the conversation. Tools NOT in the registry are left for the server to resolve via inline `TOOL_CALL_RESULT`.

For the agent's state and activity streams, two extra hooks (keyed by agent reference, no extra context provider needed):

```tsx
import { usePilotAgentState, usePilotAgentActivity } from "@hec-ovi/agentickit";

function StatusBar({ agent }: { agent: AbstractAgent }) {
  const state = usePilotAgentState<{ phase: string }>(agent);   // STATE_SNAPSHOT / STATE_DELTA
  const { activities, reasoning } = usePilotAgentActivity(agent); // ACTIVITY_*, REASONING_*
  return <div>Phase: {state?.phase}, {activities.length} activities</div>;
}
```

`agUiRuntime({ agent })` returns a stable runtime instance per agent reference (cached in a `WeakMap`), so consumers don't have to memoize the factory call themselves. `@ag-ui/client` and `@ag-ui/core` are optional peer dependencies; install them only if you use the AG-UI runtime.

### Multi-agent: register and switch between AG-UI agents

Wrap your app in `<PilotAgentRegistry>` and publish each agent under a stable id. `<Pilot>` drives whichever agent is currently active; switching the active id remounts the runtime cleanly without losing per-agent message history (each agent's `messages` array is preserved across swaps).

```tsx
import {
  PilotAgentRegistry,
  Pilot,
  PilotSidebar,
  agUiRuntime,
  useAgent,
  useAgents,
  useRegisterAgent,
} from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";
import { useMemo, useState } from "react";

function RegisterAgents() {
  useRegisterAgent("research", () => new HttpAgent({ url: "/agents/research" }));
  useRegisterAgent("code", () => new HttpAgent({ url: "/agents/code" }));
  return null;
}

function ActiveChat({ activeId }: { activeId: string }) {
  const agent = useAgent(activeId);
  const runtime = useMemo(() => (agent ? agUiRuntime({ agent }) : undefined), [agent]);
  if (!runtime) return null;
  return <Pilot runtime={runtime}><PilotSidebar /></Pilot>;
}

function AgentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const agents = useAgents();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {agents.map(({ id }) => <option key={id} value={id}>{id}</option>)}
    </select>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState("research");
  return (
    <PilotAgentRegistry>
      <RegisterAgents />
      <AgentPicker value={activeId} onChange={setActiveId} />
      <ActiveChat activeId={activeId} />
    </PilotAgentRegistry>
  );
}
```

`useRegisterAgent` constructs the agent once via the factory, registers under the id, and deregisters on unmount. Last-wins on duplicate ids (with a dev-mode warning). `useAgent(id)` re-renders the consumer when the id is registered, replaced, or unregistered. `useAgents()` lists every registered agent for picker UIs. `<PilotAgentRegistry>` is OPTIONAL: single-agent apps don't need to mount it.

The runnable `examples/todo` ships a three-agent demo (research / code / writing), each with distinct scripted behavior on its own mock server endpoint.

### Generative UI: render components from streamed agent state

When the agent emits structured state via `STATE_SNAPSHOT` and `STATE_DELTA` events (JSON Patch RFC 6902), the runtime applies them and any subscribed component re-renders. Use `<PilotAgentStateView>` for declarative JSX:

```tsx
import { PilotAgentStateView } from "@hec-ovi/agentickit";

interface ResearchState {
  steps: Array<{ id: string; label: string; status: "pending" | "active" | "done" }>;
}

<PilotAgentStateView<ResearchState>
  agent={agent}
  render={(state) => (
    <ol>
      {state?.steps?.map((s) => (
        <li key={s.id} data-state={s.status}>{s.label}</li>
      ))}
    </ol>
  )}
/>
```

The component is sugar over `usePilotAgentState`; pick whichever feels right. Multiple subscribers against the same agent share one store (single source of truth). The runnable `examples/todo` ships a "Thinking timeline" widget driven this way: switch to `agUiRuntime` and ask "process my data" to watch step transitions stream in.

---

## `<Pilot>` provider

| Prop      | Type                                        | Default        | Notes                                                                                                                            |
| --------- | ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apiUrl`  | `string`                                    | `"/api/pilot"` | Path to the route exposing `createPilotHandler`. Captured on mount; ignored when `runtime` is supplied.                         |
| `model`   | `string`                                    | `undefined`    | Optional `"<provider>/<model>"` override forwarded to the server. When omitted, the server's auto-detected choice wins.         |
| `headers` | `Record<string, string> \| () => Record<…>` | `undefined`    | Forwarded on every request. Use the function form for dynamic auth tokens.                                                       |
| `runtime` | `PilotRuntime`                              | `undefined`    | Custom chat-stream layer. When supplied, `apiUrl` and `model` are ignored (the runtime owns its own connection details).        |
| `renderConfirm` | `(args) => ReactNode`                  | built-in modal | Override the themed confirmation modal for `mutating: true` actions.                                                             |

---

## Server handler

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

export const POST = createPilotHandler({
  model: "openai/gpt-4o",
  system: "You are a helpful copilot for a kanban app.",
  maxSteps: 5,
});
```

| Option               | Type                                | Default | Notes                                                                                      |
| -------------------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `model`              | `ModelSpec`                         | auto    | String (`"<provider>/<model>"`), `LanguageModel` instance, or a thunk returning one. When omitted (or set to `"auto"`) the handler walks the env and picks a provider, throws at startup if none is configured. |
| `system`             | `string \| false`                   | auto    | Server-owned system prompt. When omitted, the handler auto-loads `./.pilot/` from `process.cwd()`. Pass a string to use it verbatim, or `false` to disable both. |
| `pilotDir`           | `string`                            | `".pilot"` | Directory the `.pilot/` auto-load reads from. Relative to `process.cwd()`. No effect when `system` is a string or `false`. |
| `maxSteps`           | `number`                            | `5`     | Upper bound on `call → result → follow-up` iterations per request.                         |
| `getProviderOptions` | `() => Record<string, unknown>`     | none    | Per-request provider tuning (caching hints, thinking budgets, etc.).                       |
| `debug`              | `boolean`                           | `false` | Stream a compact transcript of each request to the server console.                         |
| `log`                | `boolean \| string`                 | `false` | When truthy, append the same lines to `./debug/agentickit-YYYY-MM-DD.log`. Pass a string for a different directory. |
| `onLogEvent`         | `(event: PilotLogEvent) => void`    | none    | Structured subscriber for every log line. Wire to SSE for live in-browser visualization. |

**`ModelSpec` resolution:**

- **String** like `"openai/gpt-4o"` or `"openrouter/qwen/qwen3-coder:free"`: if a matching provider env var is set (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, ...) and the corresponding `@ai-sdk/*` peer package is installed, the direct adapter is used. Otherwise, if `AI_GATEWAY_API_KEY` is set, the raw string goes through the Vercel AI Gateway. If neither applies, the factory throws at startup.
- **`LanguageModel` instance**: used verbatim. No prefix validation. Ideal for Ollama, Azure, Bedrock, or any provider not on the built-in list.
- **Thunk**: called once at handler creation; must return (or resolve to) a `LanguageModel`.

**What it does:**

1. Validates the `useChat` POST body against a narrow Zod schema.
2. Converts UI messages to model messages and forwards to `streamText`.
3. Wraps client-declared tools with `dynamicTool`. Tool calls stream back to the browser; handlers never run on the server.
4. Returns the AI SDK's native UI-message stream. `useChat` reassembles text, tool parts, and reasoning with no custom decoder.
5. Emits CORS headers and a stable `{error, code}` envelope (`invalid_request | unsupported_provider | internal_error | method_not_allowed`) on failure.

**Security:**

- API keys stay server-side. The browser bundle has zero credentials.
- Provider allow-list. Unsupported model prefixes fail at handler creation, not at first request. Body-supplied `model` overrides re-validate against the same list.
- Client tools never execute server-side. They're forward declarations.
- Mutating confirmations happen in the browser. The server doesn't see the confirm step; the handler doesn't run until the user approves.

Runs on any Web Fetch runtime: Next.js App Router (tested), Bun, Cloudflare Workers, Hono, edge runtimes.

---

## The `.pilot/` skills folder

Most copilot libraries make you re-author AI behavior in TypeScript on every prompt change. `agentickit` lets you ship capabilities as markdown files your product team can edit.

**Problem:** the rules your assistant should follow ("always confirm refunds over $100", "when the user says 'summarize' on a >50-card board, group by status") live in the system prompt. The system prompt lives inside your bundle, so a prompt change is a code change is a redeploy.

**Fix:** a committed `.pilot/` folder with a routing file (`RESOLVER.md`) and one `SKILL.md` per capability. The server handler auto-loads it at startup and composes the system prompt from that markdown. Edit a file, restart the dev server, behavior changes; no TypeScript touched.

### The `agentickit` CLI

Every install ships an `agentickit` bin. Two subcommands, zero dependencies beyond Node 20+. The CLI emits the exact markdown shape the parser accepts.

```bash
npx agentickit --help
npx agentickit --version
```

**`agentickit init`** creates a fresh `.pilot/` folder with a `RESOLVER.md` header and one example skill. Refuses to overwrite an existing `.pilot/` (exit 2).

**`agentickit add-skill <name>`** creates `skills/<name>/SKILL.md` with canonical frontmatter and appends a row to `.pilot/RESOLVER.md`. Name must be kebab-case (`^[a-z][a-z0-9-]*$`). Refuses duplicates and case violations.

After either command, restart the dev server. `createPilotHandler` auto-loads `.pilot/` at startup, so changes only take effect on the next process boot.

### Folder shape

```
.pilot/
  RESOLVER.md              # persona + trigger -> skill routing table
  skills/
    refund-order/
      SKILL.md             # frontmatter + procedural body
    fill-checkout/
      SKILL.md
```

### `RESOLVER.md`

```markdown
# Checkout Skill Resolver

Skills are implementation. Read the skill file before acting.

## Always-on
| Trigger                              | Skill                              |
| ------------------------------------ | ---------------------------------- |
| "refund", "return", "cancel order"   | `skills/refund-order/SKILL.md`     |
| "fill checkout", "apply invoice"     | `skills/fill-checkout/SKILL.md`    |

## Disambiguation rules
1. Prefer the most specific skill.
2. When in doubt, ask the user.
```

Parsed by the 50-LoC resolver in `agentickit/protocol`. Two columns, backtick-wrapped path, H2 for section metadata.

### `SKILL.md`

```markdown
---
name: refund-order
description: |
  Refund a past order. Always confirms for amounts over $100.
triggers:
  - "refund"
  - "return"
tools:
  - get_order
  - issue_refund
mutating: true
---

# Refund Order

## Contract
- Never refund without fetching the order first.
- Amounts > $100 require explicit user confirmation.

## Phases
1. `get_order({ id })` to resolve the order.
2. If `order.total > 100`, summarize and ask the user to confirm.
3. `issue_refund({ orderId, amount })`.

## Anti-Patterns
- Do not refund partial line-items without matching `get_order.lineItems[]`.
- Do not batch refunds across orders.
```

Frontmatter is a strict superset of [Anthropic's Agent Skills spec](https://github.com/anthropics/skills) (which requires only `name` and `description`) and Garry Tan's gbrain convention (`triggers`, `tools`, `mutating`). A `SKILL.md` written for any of those three also parses here. `allowed-tools` (Anthropic spelling) is a synonym for `tools`.

### When to use `.pilot/`

Use it when prompt logic is becoming a code-review bottleneck, when a non-engineer wants to tune AI behavior, or when you have enough capabilities (>5) that keeping them in JS strings becomes unreadable.

**Skip it** for prototypes, for apps with two or three actions, or when everything the AI does belongs in version control alongside the code that implements it. The hooks alone work with zero markdown.

---

## Compared to alternatives

| | **agentickit** | **CopilotKit** | **assistant-ui** | **Vercel AI SDK** |
| --- | --- | --- | --- | --- |
| Focus                       | App integration                | Enterprise agent platform     | Chat UI primitives           | Streaming + model adapters   |
| Approximate LoC             | ~6,500 (incl. CSS-in-JS + CLI) | ~60,000                       | ~15,000                      | N/A (library)                |
| Multiple chat surfaces      | Sidebar, popup, modal, headless | Sidebar, popup, modal         | Headless primitives          | DIY                          |
| Runtime swap                | localRuntime + AG-UI runtime   | AG-UI native                  | LocalRuntime + ExternalStore | DIY                          |
| Form integration            | `usePilotForm` (RHF)           | Not shipped                   | `useAssistantForm` (RHF)     | DIY                          |
| Markdown skills (`.pilot/`) | Yes                            | No                            | No                           | No                           |
| Backend required            | 50-LoC route template          | Hosted runtime or self-host   | None (client-side API)       | None                         |

**Honest read.** CopilotKit is the mature choice if you need CoAgents, multi-vendor federation, multi-agent orchestration, or a managed cloud. They own that seat. assistant-ui has a more granular primitives layer than we ship, and their `useAssistantForm` is more polished. Vercel AI SDK is what we sit on top of; if you want to write the integration layer yourself, go straight there. Our slot is "I want a copilot that understands my app state and actions, can drive an AG-UI agent if I have one, and I want to be done by dinner."

---

## FAQ

<details>
<summary><b>Who should use this?</b></summary>

React or Next.js apps where you want an AI copilot that reads your state, calls your functions, and fills your forms, and you want the whole integration layer to be readable source you can audit in a lunch break. Solo developers, small teams, side projects, internal tools. Or anyone who has an AG-UI agent (LangGraph, CrewAI, Mastra) and wants a chat surface on top of it without re-implementing the chrome.

Not you if: you need enterprise SSO, multi-agent orchestration, a managed cloud, or non-engineers authoring agents at scale. That's what CopilotKit is for.
</details>

<details>
<summary><b>Why not CopilotKit?</b></summary>

CopilotKit is ~60k LoC, a full agent framework with its own AG-UI protocol it maintains. It's the right tool if you're building a Fortune-500 frontend for agents. agentickit is ~10% of that surface. We optimize for a solo engineer reading the whole codebase in one sitting; they optimize for a team building on top of a platform. We do speak AG-UI via the optional `agUiRuntime` so you can drop us in front of any AG-UI agent without their full runtime.
</details>

<details>
<summary><b>Why not assistant-ui?</b></summary>

assistant-ui is the headless-primitives layer: `ThreadRoot`, `ComposerInput`, `MessagePartsGrouped`, thirty-odd composable pieces. If you want maximum control over every inch of chat UI, go straight there. We ship four opinionated chat surfaces (sidebar, popup, modal, plus a headless `<PilotChatView>` you can wrap yourself) and three hooks that wire chat to app state / actions / forms. We credit assistant-ui's primitives in [`packages/agentickit/NOTICE.md`](./packages/agentickit/NOTICE.md).
</details>

<details>
<summary><b>Why not raw <code>useChat</code> from the AI SDK?</b></summary>

You absolutely can. `useChat` + `streamText` is ~100 LoC from a working copilot. You write the tool-call loop integration, the state-sync reducer, the chat UI, the form binding, the confirmation flow, the HITL pause-and-resume. agentickit is the version of that code you'd write on your fourth copilot project.
</details>

<details>
<summary><b>Does it work outside Next.js?</b></summary>

Yes. `createPilotHandler` returns a `(Request) => Promise<Response>` that runs anywhere with Web Fetch. We use Next.js App Router in every example because it's the common case, but Bun, Hono, Cloudflare Workers, and Fastify with `@fastify/web-fetch` all work. The client hooks are framework-agnostic React.
</details>

<details>
<summary><b>What models are supported?</b></summary>

Any of these prefixes work out of the box: `openai/`, `anthropic/`, `groq/`, `openrouter/`, `google/`, `mistral/`. The handler picks the direct `@ai-sdk/*` adapter when the matching provider env var is set (e.g. `OPENAI_API_KEY`). Otherwise it falls back to the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) when `AI_GATEWAY_API_KEY` is present.

For anything else (Ollama local, Azure, Bedrock, DeepInfra, custom OpenAI-compatible endpoints), pass a prebuilt `LanguageModel` instance instead of a string:

```ts
import { createOllama } from "ai-sdk-ollama";
const ollama = createOllama();
export const POST = createPilotHandler({ model: ollama("llama3.3") });
```

The prefix allow-list and env detection are skipped for instances; the model is handed to `streamText` verbatim. For free-tier experimentation without a credit card, try `"openrouter/qwen/qwen3-coder:free"` with `OPENROUTER_API_KEY`.
</details>

<details>
<summary><b>How does it handle security?</b></summary>

- API keys only live on the server. All provider keys (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, ...) are read from `process.env` on the server; the browser bundle has zero credentials.
- Tool allow-list by construction. The server only sees tool *declarations* from the client; it never executes them. The browser-side dispatcher only runs actions registered through `usePilotAction`. There is no "the AI called an unknown function" path.
- Mutating confirmations. Any action with `mutating: true` (and every auto-generated `update_<state>` tool) pops a confirmation dialog showing the exact arguments before the handler fires.
- Form submissions are scoped. `submit_<form>` walks the form's registered field refs upward to find the `<form>` DOM node. It will not submit a form outside the component that called `usePilotForm`.
- System prompt layering. Server-owned `system` always comes first, then any `.pilot/`-derived fragment, then the current state snapshot. A tampered client can't override or shadow server instructions.
</details>

<details>
<summary><b>Is the author looking for a job?</b></summary>

Yes. Hector Oviedo, <hector.ernesto.oviedo@gmail.com>. This library is the portfolio artifact.
</details>

---

## Testing

`agentickit` ships **294 automated tests** across 25 files under `packages/agentickit/src/**/*.test.{ts,tsx}`, runnable with `pnpm test`. Coverage at a glance:

- **23 component-level integration tests** (`pilot-integration.test.tsx`) that mount a real `<Pilot>` tree in `happy-dom`, install a scripted fetch mock that replays captured-from-real-providers SSE frames, simulate clicks via `@testing-library/react`, and assert on three observable surfaces: the DOM, the handler invocations, and the fetch call count. The fetch-count assertion catches the dangerous class of bugs: infinite resubmit loops that drain API credits.
- **52 chat-surface tests** across `pilot-chat-view.test.tsx`, `pilot-sidebar.test.tsx`, `pilot-popup.test.tsx`, `pilot-modal.test.tsx`. Real `fireEvent` user simulation: type into the composer, click send, click backdrop, press Escape, Tab through the focus trap. DOM-shape inline snapshots catch silent rename / wrapper-drift regressions.
- **8 renderAndWait HITL tests** covering respond/cancel paths, mutating + approve combo, mutating + decline (HITL never mounts), respond-twice idempotency, action-unmounted-mid-suspension auto-cancel.
- **24 runtime-swap + AG-UI tests** verifying the `PilotRuntime` seam contract, the `agUiRuntime` event-stream adapter, tool-call bridging through the registry gate, mutating + confirm gate composition under AG-UI, `usePilotAgentState` / `usePilotAgentActivity` hooks, factory stability via `WeakMap`, the 16-iteration continuation cap, the re-entry guard, and the runtime-swap regression test (Rules-of-Hooks safety across runtime prop changes).
- **6 generative-UI tests** for `<PilotAgentStateView>`: undefined-state-before-mount, initial-state-seeded, STATE_SNAPSHOT propagation, STATE_DELTA via JSON Patch, multi-consumer-single-source-of-truth, identity-stable updates do not churn renders.
- **21 multi-agent registry tests**: 14 unit tests for `<PilotAgentRegistry>` + `useRegisterAgent` / `useAgent` / `useAgents` (registration lifecycle, last-wins, stale-token-safety, StrictMode convergence, snapshot stability, register/unregister roundtrip), plus 7 integration tests covering multi-agent + Pilot + agUiRuntime composition (per-agent message isolation, separate state stores, tool-call dispatch through active agent only, picker UI sync, zero React errors during rapid swaps with and without StrictMode).
- Unit coverage for every public hook (`usePilotState` / `usePilotAction` / `usePilotForm`), the server handler's provider-resolution + request-body validation + error envelope, the `.pilot/` protocol parsers, the `agentickit` CLI (init + add-skill with exit-code assertions), and the structured-event logger.

### Live verification against vLLM + `openai/gpt-oss-120b`

Beyond the mocked suite, the package was exercised end-to-end against a real LLM using the bundled `examples/todo` Vite + Hono app pointed at a local vLLM server. Verified user journeys:

- **Multi-tool conversation turn.** *"Add three todos: buy milk, call mom, pay rent"* produces exactly four HTTP round-trips: three consecutive `add_todo` tool calls (one per item, model waits for each result before emitting the next) followed by a text confirmation. `finishReason` transitions from `tool-calls` on turns 1-3 to `stop` on turn 4. Zero infinite loops.
- **Mutating actions with confirm-modal approve + decline branches.** Approving runs the handler and feeds `{ ok: true }` back to the model; declining records `{ ok: false, reason: "User declined." }` so the model can react conversationally rather than looping.
- **Progressive form fill.** *"Fill contact form, hector, hector@…, message 'how ya doing'"* produces three consecutive `set_contact_field` calls, then `submit_contact` (mutating, confirm modal, approve) which triggers the actual `react-hook-form` `handleSubmit` path with the typed values.
- **State-setter round-trip.** `update_preferences` (auto-generated by `usePilotState` because the hook supplies a setter) writes the model's new `{ accent, density }` through to React state after the confirm-modal approve.
- **Structured observability.** With `createPilotHandler({ debug: true, log: true, onLogEvent })` the server emits a request-scoped transcript captured to console, to `./debug/agentickit-YYYY-MM-DD.log`, and streamed live over SSE to the example's **Live log** tab.

Two real-world provider quirks surfaced during live testing and are fixed in shipped code:

- vLLM's Responses API (via `@ai-sdk/openai`) streams tool-input JSON deltas but never emits the completion marker `useChat` waits on. The handler now auto-switches the OpenAI adapter to the Chat Completions path (`openai.chat(modelId)`) whenever `OPENAI_BASE_URL` is set, so every major OpenAI-compatible server (vLLM, Ollama, LM Studio, Fireworks, Together, DeepInfra) works without code changes.
- The initial `sendAutomaticallyWhen` check returned `true` on any assistant message with a completed tool output, causing resubmit-after-text loops. Fix walks parts from the tail and stops at the first text or reasoning part; a dedicated integration test asserts the fetch count stays at 4 on the 3-tools-then-text scenario.

### What's not yet verified end-to-end

- A live roundtrip against a hosted OpenAI / Anthropic / Groq / OpenRouter / Google / Mistral endpoint. Those paths are covered by the mocked handler tests but not by a v0.1 live smoke.
- A live AG-UI server (LangGraph CoAgents, CrewAI, Mastra). The AG-UI runtime is covered by 32 tests against a `FakeAgent extends AbstractAgent` exercising the real `defaultApplyEvents` apply pipeline; an actual hosted server may surface event-shape edge cases we haven't reproduced.
- A real-browser smoke for `<PilotPopup>` and `<PilotModal>`. `examples/todo` only wires up the sidebar; popup and modal CSS rules were exercised only by `happy-dom`.

These gaps are what keep this release pre-1.0.

---

## Roadmap

### Shipped

- **Three hooks**: `usePilotState`, `usePilotAction` (with optional `renderAndWait` HITL), `usePilotForm`.
- **Four chat surfaces**: `<PilotSidebar>`, `<PilotPopup>`, `<PilotModal>`, `<PilotChatView>` (headless body).
- **Provider** wiring AI SDK 6's `useChat` with a dynamic tool registry, mutating-action confirm modal, HITL pause-and-resume, focus restoration.
- **Runtime abstraction**: `localRuntime()` (default, AI SDK 6 over HTTP) and `agUiRuntime({ agent })` (AG-UI agents). Swap via `<Pilot runtime={...}>`.
- **AG-UI hooks**: `usePilotAgentState<T>(agent)`, `usePilotAgentActivity(agent)` for STATE_*, ACTIVITY_*, REASONING_* streams.
- **Generative UI**: `<PilotAgentStateView>` declarative wrapper for rendering components from streamed agent state.
- **Multi-agent registry**: `<PilotAgentRegistry>`, `useRegisterAgent`, `useAgent`, `useAgents` to publish multiple AG-UI agents under stable ids and switch between them at runtime (Agent Lock Mode).
- **`createPilotHandler`** for Next.js / Bun / Workers, with direct adapters for `openai/*`, `anthropic/*`, `groq/*`, `openrouter/*`, `google/*`, `mistral/*`, plus Vercel AI Gateway fallback and a `LanguageModel`-instance escape hatch.
- **`.pilot/` markdown protocol**: `RESOLVER.md` + `skills/<name>/SKILL.md`, auto-loaded by `createPilotHandler` at startup.
- **`agentickit` CLI**: `init` + `add-skill` scaffold and grow `.pilot/` without hand-writing markdown.
- **Observable server**: `debug` / `log` / `onLogEvent` options on `createPilotHandler`, structured per-request transcripts (tool calls + args, token usage, finish reason, errors).

### Planned

- **Server-side AG-UI emitter**: optional adapter so agentickit's own server route can be consumed by external AG-UI clients (`@ag-ui/vercel-ai-sdk`).
- **MCP tool activity rendering**: sandboxed iframe + JSON-RPC bridge for MCP-supplied UI.
- **Resolver validator**: startup health check that flags orphan skills, missing files, and drift between `RESOLVER.md` and the filesystem.

### Out of scope

- Generic chatbot framework.
- Managed cloud (a minimal eval harness CLI is plausible if users ask).

---

## Contributing

```bash
pnpm install
pnpm build
pnpm test
```

- Open an issue before a large PR. agentickit is deliberately small and we'd rather talk scope upfront than close a big PR.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Every public API change needs a test. Current suite uses Vitest + happy-dom, with `@testing-library/react` for component-level interactions.
- Biome for lint + format (`pnpm lint`, `pnpm format`).

---

## License + attribution

MIT. Copyright (c) 2026 Hector Oviedo. See [LICENSE](./LICENSE).

- Inspired by [CopilotKit](https://github.com/CopilotKit/CopilotKit) and [assistant-ui](https://github.com/assistant-ui/assistant-ui) (both MIT). See [`packages/agentickit/NOTICE.md`](./packages/agentickit/NOTICE.md) for structural credits.
- Built on top of the [Vercel AI SDK](https://ai-sdk.dev) (Apache 2.0) and the [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) (Apache 2.0).
- `.pilot/` protocol inspired by Garry Tan's [gbrain](https://github.com/garrytan/gbrain) "Thin Harness, Fat Skills" convention and [Anthropic's Agent Skills](https://github.com/anthropics/skills) frontmatter standard.
- Resolver-table parser pattern borrowed from gbrain (also MIT).
