# agentickit

**Wire an AI copilot into your React app's state, actions, and forms.** Three hooks, one sidebar, optional `.pilot/` skills folder.

[![npm](https://img.shields.io/npm/v/agentickit.svg?color=black)](https://www.npmjs.com/package/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)

<!-- DEMO_GIF_HERE -->

```tsx
import { useState } from "react";
import { z } from "zod";
import { Pilot, PilotSidebar, usePilotState, usePilotAction } from "agentickit";

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

That's the whole library. Three hooks. One sidebar. One server route. The AI now sees `cart_total` and can call `apply_discount`.

---

## Why agentickit?

The React AI stack in 2026 has two settled layers: Vercel AI SDK for streaming, models, and tool calls; CopilotKit for Fortune-500 agent platforms. agentickit sits in the gap between them as the **app-integration layer**: "this state, this action, this form, go."

- **Three hooks you can memorize.** `usePilotState`, `usePilotAction`, `usePilotForm`. Type-inferred through Zod. No `useCopilotReadable` / `useCopilotAction` / `useCopilotChat` / `useCopilotChatSuggestions` sprawl.
- **AI SDK 6 native.** `streamText` underneath, tool-call streaming delegated, `UIMessage` on the wire. You keep every escape hatch the SDK already gives you.
- **Optional `.pilot/` skills folder.** Ship capabilities as markdown. PMs edit `SKILL.md` files to change AI behavior without redeploying the prompt.
- **Four runtime deps** (`ai`, `@ai-sdk/react`, `zod`, `nanoid`) and six **optional** peer adapters — you install exactly the one you need. MIT. Source tree is ~5 kLoC of implementation + CSS-in-JS + a CLI, small enough to read end-to-end in an afternoon.

**It is not:** a chatbot framework, a browser-use agent, a LangGraph runner, an MCP server, or an enterprise platform. If you need those, use the tool that specializes in them.

---

## Install

```bash
npm install agentickit ai @ai-sdk/react zod

# Plus exactly one provider adapter for your model choice. The free-tier
# friendly default is OpenRouter. Sign up at https://openrouter.ai/keys:
npm install @openrouter/ai-sdk-provider

# Any of these also works, pick one:
#   npm install @ai-sdk/openai       # OPENAI_API_KEY
#   npm install @ai-sdk/anthropic    # ANTHROPIC_API_KEY
#   npm install @ai-sdk/groq         # GROQ_API_KEY
#   npm install @ai-sdk/google       # GOOGLE_GENERATIVE_AI_API_KEY
#   npm install @ai-sdk/mistral      # MISTRAL_API_KEY
# (or skip the adapter and set AI_GATEWAY_API_KEY to use the Vercel AI Gateway.)

# Optional, only if you want `usePilotForm`:
npm install react-hook-form
```

Requires **Node 20+** and a framework that supports the Web Fetch API on the server (Next.js App Router, Bun, Cloudflare Workers, Hono). The examples below use Next.js 15.

---

## For AI agents

This repo ships with a root-level [`llms.txt`](./llms.txt) and a [`.pilot/`](./.pilot/) folder so any LLM agent can onboard cold, including a fresh Claude Code or Cursor session with no prior memory.

The path: read `llms.txt` first for the map, follow it to [`.pilot/AGENTS.md`](./.pilot/AGENTS.md) for the house rules and read order, then use [`.pilot/RESOLVER.md`](./.pilot/RESOLVER.md) to match the user's task to one of ten `SKILL.md` files. Read the matching skill before writing code. Every snippet in `.pilot/` compiles against the current tree; the source under `packages/agentickit/src/` is the ground truth.

This `.pilot/` folder is also the canonical example of what an `agentickit`-using app's own `.pilot/` looks like when shipped. To author skills for your own app, follow [`skills/write-a-consumer-skill/SKILL.md`](./.pilot/skills/write-a-consumer-skill/SKILL.md).

```bash
cat llms.txt
cat .pilot/AGENTS.md
cat .pilot/RESOLVER.md
```

---

## Try it in 60 seconds

### 1. Server route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "agentickit/server";

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
import { Pilot, PilotSidebar } from "agentickit";

export default function Root({ children }: { children: React.ReactNode }) {
  // `model` is optional. Omit it and the route handler's auto-detected
  // choice is used. Pass a string here only to override per-request.
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
import { usePilotState, usePilotAction } from "agentickit";

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

Want to poke at a working app before writing a line? The repo ships [`examples/todo`](./examples/todo) — a minimal Vite + Hono demo with three widgets (todo list, contact form, preferences) and a live log panel that streams every tool call and token count as it happens.

```bash
git clone https://github.com/hec-ovi/agentickit
cd agentickit
pnpm install
pnpm --filter agentickit build
cd examples/todo
cp .env.example .env.local       # pick your provider; the default assumes a local vLLM server
pnpm dev
```

The `.pilot/` folder under `examples/todo/.pilot/` was scaffolded with `npx agentickit init` + three `add-skill` calls — the same flow the README walks you through, just already completed. Run it once, then read the widget code to see how every hook is wired.

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

### `usePilotForm`: react-hook-form integration

```tsx
import { useForm } from "react-hook-form";
import { usePilotForm } from "agentickit";

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

## `<Pilot>` provider

| Prop      | Type                                        | Default        | Notes                                                                                                                            |
| --------- | ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `model`   | `string`                                    | `undefined`    | Optional `"<provider>/<model>"` override forwarded to the server. When omitted, the server handler's own model (or auto-detect) wins. |
| `apiUrl`  | `string`                                    | `"/api/pilot"` | Path to the route exposing `createPilotHandler`.                                                                                 |
| `headers` | `Record<string, string> \| () => Record<…>` | `undefined`    | Forwarded on every request. Use the function form for dynamic auth tokens.                                                       |

All props except `apiUrl` can change at runtime. `apiUrl` is captured on mount; changing it mid-session would orphan the current stream.

---

## `<PilotSidebar>` component

| Prop            | Type                                         | Default        | Notes                                                                  |
| --------------- | -------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `defaultOpen`   | `boolean`                                    | `false`        | Render expanded on first mount.                                        |
| `position`      | `"left" \| "right"`                          | `"right"`      | Which edge the sidebar docks to.                                       |
| `width`         | `number \| string`                           | `"380px"`      | Accepts any CSS width unit.                                            |
| `suggestions`   | `ReadonlyArray<string>`                      | `undefined`    | One-click prompt chips shown above the composer when chat is empty.    |
| `greeting`      | `ReactNode`                                  | `undefined`    | Custom empty-state content.                                            |
| `onOpenChange`  | `(open: boolean) => void`                    | `undefined`    | Observe open/close transitions.                                        |
| `labels`        | `{ title?, inputPlaceholder?, sendButton?, emptyState?, openButton?, closeButton? }` | English defaults | i18n override per label. |
| `className`     | `string`                                     | `undefined`    | Extra class on the outer `<aside>`.                                    |

### Theming

No Tailwind, no design system. Just CSS variables. Override on any parent scope:

```css
:root {
  --pilot-bg: #fff;
  --pilot-fg: #0a0a0a;
  --pilot-accent: #7c3aed;       /* send button + toggle */
  --pilot-user-bubble-bg: #ede9fe;
  --pilot-radius: 12px;
  --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
```

Dark mode is automatic (`prefers-color-scheme: dark`). Escape closes the panel and returns focus to the toggle button. `role="complementary"`, labeled heading, and live-region error banner are all wired up.

---

## Server handler

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "agentickit/server";

export const POST = createPilotHandler({
  model: "openai/gpt-4o",
  system: "You are a helpful copilot for a kanban app.",
  maxSteps: 5,
});
```

| Option               | Type                                | Default | Notes                                                                                      |
| -------------------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `model`              | `ModelSpec`                         | auto    | String (`"<provider>/<model>"`), `LanguageModel` instance, or a thunk returning one. When omitted (or set to `"auto"`) the handler walks the env and picks a provider — throws at startup if none is configured. Validated at startup. |
| `system`             | `string \| false`                   | auto    | Server-owned system prompt. When omitted, the handler auto-loads `./.pilot/` from `process.cwd()`. Pass a string to use it verbatim, or `false` to disable both. Always prepended before any client-derived instructions. |
| `pilotDir`           | `string`                            | `".pilot"` | Directory the `.pilot/` auto-load reads from. Relative to `process.cwd()`. No effect when `system` is a string or `false`. |
| `maxSteps`           | `number`                            | `5`     | Upper bound on `call → result → follow-up` iterations per request.                         |
| `getProviderOptions` | `() => Record<string, unknown>`     | none    | Per-request provider tuning (caching hints, thinking budgets, etc.).                       |
| `debug`              | `boolean`                           | `false` | When `true`, stream a compact transcript of each request to the server console: incoming messages, registered tools, per-step tool-calls with args, finish reason, token usage, errors. Every line is tagged with a short request id so concurrent requests don't interleave visually. |
| `log`                | `boolean \| string`                 | `false` | When truthy, append the same structured lines to `./debug/agentickit-YYYY-MM-DD.log` (one file per UTC day). Pass a string to use a different directory. Fails silently on read-only filesystems (edge runtimes) so a write error never breaks a live chat. |
| `onLogEvent`         | `(event: PilotLogEvent) => void`    | none    | Structured subscriber for every log line. Each event carries `ts`, `requestId`, `kind`, `message`, plus optional `meta` (tool name + args, usage, finish reason, error message). Wire this to an SSE endpoint or an EventEmitter to visualize the tool-calling loop live in the browser. |

**`ModelSpec` resolution:**

- **String** like `"openai/gpt-4o"` or `"openrouter/qwen/qwen3-coder:free"`: if a matching provider env var is set (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, ...) *and* the corresponding `@ai-sdk/*` peer package is installed, the direct adapter is used. Otherwise, if `AI_GATEWAY_API_KEY` is set, the raw string is handed to the Vercel AI Gateway. If neither applies, the factory throws at startup, never at request time.
- **`LanguageModel` instance**: used verbatim. No prefix validation. Ideal for Ollama, Azure, Bedrock, or any other provider not on the built-in list.
- **Thunk**: called once at handler creation; must return (or resolve to) a `LanguageModel`.

**What it does:**

1. Validates the `useChat` POST body against a narrow Zod schema.
2. Converts UI messages to model messages and forwards to `streamText`.
3. Wraps client-declared tools with `dynamicTool`. Tool calls stream back to the browser; handlers never run on the server.
4. Returns the AI SDK's native UI-message stream. `useChat` reassembles text, tool parts, and reasoning with no custom decoder.
5. Emits CORS headers and a stable `{error, code}` envelope (`invalid_request | unsupported_provider | internal_error | method_not_allowed`) on failure.

**Security notes:**

- **API keys stay server-side.** Direct-provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ...), `OPENROUTER_API_KEY`, and `AI_GATEWAY_API_KEY` are read from `process.env`. The browser bundle never sees them.
- **Provider allow-list.** Unsupported model prefixes fail at handler-creation time, not at first request. Clients that try to override the model via the request body are re-validated against the same list, so there's no path to injecting arbitrary strings.
- **Client tools never execute server-side.** They're forward declarations. If you need a true server-side tool, call `streamText` directly. The server handler is a shim, not a moat around it.
- **Mutating confirmations happen in the browser.** The server doesn't see the confirm step; the handler simply won't run until the user approves.

Runs on any Web Fetch runtime: Next.js App Router (tested), Bun, Cloudflare Workers, Hono, edge runtimes.

---

## The `.pilot/` skills folder

Most copilot libraries make you re-author AI behavior in TypeScript on every prompt change. `agentickit` lets you ship capabilities as markdown files your product team can edit.

**Problem:** The rules your assistant should follow ("always confirm refunds over $100", "when the user says 'summarize' on a >50-card board, group by status") live in the system prompt. The system prompt lives inside your bundle, so a prompt change is a code change is a redeploy.

**Fix:** a committed `.pilot/` folder with a routing file (`RESOLVER.md`) and one `SKILL.md` per capability. The server handler auto-loads it at startup and composes the system prompt from that markdown. Edit a file, restart the dev server, behavior changes — no TypeScript touched.

### The `agentickit` CLI

Every install of the package ships an `agentickit` bin. Two subcommands, zero dependencies beyond Node 20+. The CLI emits the exact markdown shape the parser accepts, so hand-authoring never has to race the parser.

```bash
npx agentickit --help
npx agentickit --version
```

#### `agentickit init`

Creates a fresh `.pilot/` folder with a `RESOLVER.md` header and one example skill. Run once per project, usually right after `npm install agentickit`.

```bash
cd my-app
npx agentickit init
```

Produces:

```
.pilot/
  RESOLVER.md                 # persona + "## Skills" routing table
  skills/
    example/
      SKILL.md                # frontmatter + TODO-marked body
```

Refuses to overwrite an existing `.pilot/` (exit 2, no file touched). Delete the folder first if you want to restart clean.

#### `agentickit add-skill <name>`

Creates `skills/<name>/SKILL.md` with canonical frontmatter and appends a row to `.pilot/RESOLVER.md`. The name must be kebab-case (matches `^[a-z][a-z0-9-]*$`), e.g. `chart`, `detail-form`, `refund-order`.

```bash
npx agentickit add-skill refund-order
npx agentickit add-skill fill-checkout
npx agentickit add-skill summarize-board
```

Each call emits:

- `.pilot/skills/<name>/SKILL.md` — `name:` and `description:` pre-filled, `tools:` / `triggers:` / body left as `TODO` markers you fill in.
- One appended line to the `## Skills` table in `.pilot/RESOLVER.md`. Trigger text starts as `TODO: describe when to trigger <name>` — edit it to match the phrasings real users will type.

Refuses a duplicate skill name (exit 2). Refuses kebab-case violations (`Chart`, `my_skill`, `1skill`, empty — exit 1). Refuses to run if there's no `.pilot/` folder in the current directory; tells you to run `init` first (exit 2).

After either command, restart your dev server — `createPilotHandler` auto-loads `.pilot/` at startup, so changes to these files only take effect on the next process boot.

#### When to hand-edit vs. use the CLI

Use the CLI for the **shapes** — anything the parser reads: frontmatter, the `## Skills` table, the directory layout. Hand-edit for **prose** — skill descriptions, procedural bodies, anti-patterns, inline examples, any content inside a skill file. That's why `init` emits a canonical starting file rather than a magic registry: you own the markdown.

The YAML mini-parser in `agentickit/protocol` only handles the shapes the CLI emits (scalar `key: value`, list items with `- `, `|`-style block scalars for descriptions, booleans). Anchors, flow-style lists, and nested maps are silently dropped. Start from a CLI-emitted file and you never bump against that.

### Folder shape

```
.pilot/
  RESOLVER.md              # persona + trigger → skill routing table
  skills/
    refund-order/
      SKILL.md             # frontmatter + procedural body
    fill-checkout/
      SKILL.md
    summarize-board/
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

Frontmatter is a **strict superset of Anthropic's Agent Skills spec** (which requires only `name` and `description`) and Garry Tan's gbrain convention (`triggers`, `tools`, `mutating`). A `SKILL.md` written for any of those three also parses here. agentickit also reads `allowed-tools` (Anthropic spelling) as a synonym for `tools`.

### Interop

- **Claude Code / Cursor / Aider users** who already have `AGENTS.md` or `CLAUDE.md` at the repo root can keep their authoring-time context there and reference skills from both files. The markdown format is deliberately compatible.
- **External agents** discovering your app can read `.pilot/RESOLVER.md` directly as a capability index, or you can emit a top-level `llms.txt` pointing at `/.pilot/` so crawlers find the folder.
- **MCP bridges** are on the roadmap (v0.2): expose `.pilot/*` as MCP resources so external LLM clients can consume the same skills your in-app copilot sees.

### When to use `.pilot/`

Use it when prompt logic is becoming a code-review bottleneck, when a non-engineer wants to tune AI behavior, or when you have enough capabilities (>5) that keeping them in JS strings becomes unreadable.

**Skip it** for prototypes, for apps with two or three actions, or when everything the AI does belongs in version control alongside the code that implements it. The hooks alone work with zero markdown.

---

## Compared to alternatives

| | **agentickit** | **CopilotKit** | **assistant-ui** | **Vercel AI SDK** | **Browser agents** (Stagehand, Browserbase) |
| --- | --- | --- | --- | --- | --- |
| Focus                    | App integration                | Enterprise agent platform      | Chat UI primitives            | Streaming + model adapters   | Web automation              |
| Approximate LoC          | ~5,000 (incl. CSS-in-JS + CLI) | ~60,000                        | ~15,000                       | N/A (library)                | N/A                         |
| Agent framework required | No                             | Yes (AG-UI / CoAgents)         | No                            | No                           | Own runtime                 |
| Form integration         | `usePilotForm` (RHF)           | Not shipped                    | `useAssistantForm` (RHF)      | DIY                          | N/A                         |
| Markdown skills (`.pilot/`) | Yes                          | No                             | No                            | No                           | No                          |
| Backend required         | 50-LoC route template          | Hosted runtime or self-host    | None (client-side API)        | None                         | Managed cloud               |
| Ceiling                  | Well-loved small library       | Fortune-500 platform           | YC-backed primitives layer    | Industry standard            | End-to-end automation       |

**Honest read.** CopilotKit is the mature choice if you need AG-UI, CoAgents, multi-vendor federation, or a managed cloud. They own that seat. assistant-ui has better chat primitives than we ship, and their `useAssistantForm` is more polished. Vercel AI SDK is what we sit on top of; if you want to write the integration layer yourself, go straight there. Our slot is "I want a copilot sidebar that understands my app state and actions, and I want to be done by dinner."

---

## FAQ

<details>
<summary><b>Who should use this?</b></summary>

React or Next.js apps where you want an AI copilot that reads your state, calls your functions, and fills your forms, and you want the whole integration layer to be readable source you can audit in a lunch break. Solo developers, small teams, side projects, internal tools.

Not you if: you need enterprise SSO, multi-agent orchestration, a managed cloud, or non-engineers authoring agents at scale. That's what CopilotKit is for.
</details>

<details>
<summary><b>Why not CopilotKit?</b></summary>

CopilotKit is ~60k LoC, 28k stars, a full agent framework with its own AG-UI protocol. It's the right tool if you're building a Fortune-500 frontend for agents. agentickit is ~5% of that surface. We optimize for a solo engineer reading the whole codebase in one sitting; they optimize for a team building on top of a platform. Different products.
</details>

<details>
<summary><b>Why not assistant-ui?</b></summary>

assistant-ui is the headless-primitives layer: `ThreadRoot`, `ComposerInput`, `MessagePartsGrouped`, thirty-odd composable pieces. If you want maximum control over every inch of chat UI, go straight there. We ship a single opinionated `<PilotSidebar>` and three hooks that wire chat to app state / actions / forms. We credit assistant-ui's primitives in [`packages/agentickit/NOTICE.md`](./packages/agentickit/NOTICE.md).
</details>

<details>
<summary><b>Why not raw <code>useChat</code> from the AI SDK?</b></summary>

You absolutely can. `useChat` + `streamText` is ~100 LoC from a working copilot. You write the tool-call loop integration, the state-sync reducer, the sidebar UI, the form binding, the confirmation flow. agentickit is the version of that code you'd write on your fourth copilot project.
</details>

<details>
<summary><b>Does it work outside Next.js?</b></summary>

Yes. `createPilotHandler` returns a `(Request) => Promise<Response>` that runs anywhere with Web Fetch. We use Next.js App Router in every example because it's the common case, but Bun, Hono, Cloudflare Workers, and Fastify with `@fastify/web-fetch` all work. The client hooks are framework-agnostic React.
</details>

<details>
<summary><b>What models are supported?</b></summary>

As of April 2026, string `model` values with any of these prefixes work out of the box: `openai/`, `anthropic/`, `groq/`, `openrouter/`, `google/`, `mistral/`. The handler picks the direct `@ai-sdk/*` adapter when the matching provider env var is set (e.g. `OPENAI_API_KEY`). Otherwise it falls back to the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) when `AI_GATEWAY_API_KEY` is present.

For anything else (Ollama local, Azure, Bedrock, DeepInfra, custom OpenAI-compatible endpoints), pass a prebuilt `LanguageModel` instance instead of a string:

```ts
import { createOllama } from "ai-sdk-ollama";
const ollama = createOllama();
export const POST = createPilotHandler({ model: ollama("llama3.3") });
```

The prefix allow-list and env detection are skipped for instances; the model is handed to `streamText` verbatim. Supported via the `ModelSpec` escape hatch, no core change needed. For free tier experimentation without a credit card, try `"openrouter/qwen/qwen3-coder:free"` with `OPENROUTER_API_KEY`.
</details>

<details>
<summary><b>How does it handle security?</b></summary>

- **API keys only live on the server.** All provider keys (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, …) are read from `process.env` on the server; the browser bundle has zero credentials.
- **Tool allow-list by construction.** The server only sees tool *declarations* from the client; it never executes them. The browser-side dispatcher only runs actions registered through `usePilotAction`. There is no "the AI called an unknown function" path.
- **Mutating confirmations.** Any action with `mutating: true` (and every auto-generated `update_<state>` tool) pops a confirmation dialog showing the exact arguments before the handler fires.
- **Form submissions are scoped.** `submit_<form>` walks the form's registered field refs upward to find the `<form>` DOM node. It will not submit a form outside the component that called `usePilotForm`.
- **System prompt layering.** Server-owned `system` always comes first, then any `.pilot/`-derived fragment the client supplies, then the current state snapshot. A tampered client can't override or shadow server instructions.
</details>

<details>
<summary><b>Is the author looking for a job?</b></summary>

Yes. Hector Oviedo, <hector.ernesto.oviedo@gmail.com>. This library is the portfolio artifact.
</details>

---

## Roadmap

### v0.1 (shipped)
- Three hooks (`usePilotState`, `usePilotAction`, `usePilotForm`)
- `<Pilot>` provider wiring AI SDK 6's `useChat` with a dynamic tool registry
- `<PilotSidebar>` with dark mode, CSS-variable theming, a11y, suggestion chips
- `createPilotHandler` for Next.js / Bun / Workers, with direct adapters for `openai/*`, `anthropic/*`, `groq/*`, `openrouter/*`, `google/*`, `mistral/*`, plus Vercel AI Gateway fallback and a `LanguageModel`-instance escape hatch
- `.pilot/` markdown protocol: `RESOLVER.md` + `skills/<name>/SKILL.md`, auto-loaded by `createPilotHandler` at startup
- `agentickit` CLI: `init` + `add-skill` scaffold and grow `.pilot/` without hand-writing markdown
- `renderConfirm` prop on `<Pilot>` for themed confirmation modals
- Observable server: `debug` / `log` / `onLogEvent` options on `createPilotHandler` emit structured per-request transcripts (tool calls + args, token usage, finish reason, errors) to console, append-only daily log files, and an in-process subscriber the example wires to an SSE visualization panel

### v0.2 (next)
- **Ghost fills**: streaming form previews; Tab to accept, Shift-Tab to reject
- **AI cursor**: visible floating pointer that narrates DOM-touching actions
- **DOM-fallback actuator**: accessibility-tree-driven action layer for sites without explicit integration
- **Resolver validator**: startup health check that flags orphan skills, missing files, and drift between `RESOLVER.md` and the filesystem

### Out of scope
- Generic chatbot framework
- Multi-agent orchestration runtime
- Managed cloud (though a minimal eval harness CLI is plausible if users ask)

---

## Contributing

```bash
pnpm install
pnpm build
pnpm test
```

- Open an issue before a large PR. agentickit is deliberately small and we'd rather talk scope upfront than close a big PR.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Every public API change needs a test. Current suite uses Vitest + happy-dom.
- Biome for lint + format (`pnpm lint`, `pnpm format`).

---

## License + attribution

MIT. Copyright (c) 2026 Hector Oviedo. See [LICENSE](./LICENSE).

- Inspired by [CopilotKit](https://github.com/CopilotKit/CopilotKit) and [assistant-ui](https://github.com/assistant-ui/assistant-ui) (both MIT). See [`packages/agentickit/NOTICE.md`](./packages/agentickit/NOTICE.md) for structural credits.
- Built on top of the [Vercel AI SDK](https://ai-sdk.dev) (Apache 2.0).
- `.pilot/` protocol inspired by Garry Tan's [gbrain](https://github.com/garrytan/gbrain) "Thin Harness, Fat Skills" convention and [Anthropic's Agent Skills](https://github.com/anthropics/skills) frontmatter standard.
- Resolver-table parser pattern borrowed from gbrain (also MIT).
