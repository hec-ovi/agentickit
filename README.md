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
    <Pilot model="openrouter/qwen/qwen3-coder:free" apiUrl="/api/pilot">
      <Checkout />
      <PilotSidebar />
    </Pilot>
  );
}
```

That's the whole library. Three hooks. One sidebar. One server route. The AI now sees `cart_total` and can call `apply_discount`.

---

## Why agentickit?

The React AI stack in 2026 has two settled layers: Vercel AI SDK for streaming, models, and tool calls; CopilotKit for Fortune-500 agent platforms. agentickit sits in the gap between them — the **app-integration layer**: "this state, this action, this form, go."

- **Three hooks you can memorize.** `usePilotState`, `usePilotAction`, `usePilotForm`. Type-inferred through Zod. No `useCopilotReadable` / `useCopilotAction` / `useCopilotChat` / `useCopilotChatSuggestions` sprawl.
- **AI SDK 6 native.** `streamText` underneath, tool-call streaming delegated, `UIMessage` on the wire. You keep every escape hatch the SDK already gives you.
- **Optional `.pilot/` skills folder.** Ship capabilities as markdown. PMs edit `SKILL.md` files to change AI behavior without redeploying the prompt.
- **Under 1,500 lines, MIT, two runtime dependencies** (`ai`, `@ai-sdk/react`). Readable in a lunch break.

**It is not:** a chatbot framework, a browser-use agent, a LangGraph runner, an MCP server, or an enterprise platform. If you need those, use the tool that specializes in them.

---

## Install

```bash
npm install agentickit ai @ai-sdk/react zod

# Plus exactly one provider adapter for your model choice. The free-tier
# friendly default is OpenRouter — sign up at https://openrouter.ai/keys:
npm install @openrouter/ai-sdk-provider

# Any of these also works, pick one:
#   npm install @ai-sdk/openai       # OPENAI_API_KEY
#   npm install @ai-sdk/anthropic    # ANTHROPIC_API_KEY
#   npm install @ai-sdk/groq         # GROQ_API_KEY
#   npm install @ai-sdk/google       # GOOGLE_GENERATIVE_AI_API_KEY
#   npm install @ai-sdk/mistral      # MISTRAL_API_KEY
# (or skip the adapter and set AI_GATEWAY_API_KEY to use the Vercel AI Gateway.)

# Optional — only if you want `usePilotForm`:
npm install react-hook-form
```

Requires **Node 20+** and a framework that supports the Web Fetch API on the server (Next.js App Router, Bun, Cloudflare Workers, Hono). The examples below use Next.js 15.

---

## Try it in 60 seconds

### 1. Server route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "agentickit/server";

// Free tier, no credit card — sign up at https://openrouter.ai/keys.
export const POST = createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" });
```

Set `OPENROUTER_API_KEY` and install `@openrouter/ai-sdk-provider`. Prefer a different provider? Swap the model string and the handler auto-routes through the matching `@ai-sdk/*` adapter (e.g. `"openai/gpt-4o"` + `OPENAI_API_KEY`). Or set `AI_GATEWAY_API_KEY` to let the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) resolve any prefix server-side.

### 2. Wrap your app

```tsx
// app/layout.tsx  (or any client-side root)
"use client";
import { Pilot, PilotSidebar } from "agentickit";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <Pilot model="openrouter/qwen/qwen3-coder:free" apiUrl="/api/pilot">
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

---

## The three hooks

### `usePilotState` — expose state to the AI

```tsx
usePilotState({
  name: "cart_total",
  description: "Current cart total in USD.",
  value: total,
  schema: z.number(),
  setValue: setTotal,   // optional — omit to stay read-only
});
```

The AI always sees the latest `value` on the next turn. When `setValue` is supplied, agentickit auto-registers an `update_<name>` tool with `schema` as its input — the AI can propose whole-value updates and the handler routes them through your setter. `mutating: true` is implied, so the user gets a confirmation prompt before the write lands.

### `usePilotAction` — register a typed tool

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

The handler runs in the browser — it has access to your React state, your auth'd `fetch`, and everything else a button's `onClick` would. Return values are JSON-serialized and fed back into the next model step so the assistant can narrate what happened.

`mutating: true` pops a confirmation dialog before the handler fires. Use it for anything destructive or side-effecting.

### `usePilotForm` — react-hook-form integration

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

Registers three tools scoped to the form: `set_invoice_field`, `submit_invoice`, `reset_invoice`. The assistant can fill the form progressively, validate with `shouldValidate: true`, and submit — same `onSubmit` path a click would take. Submission walks the registered field refs to find the `<form>` node; it will never submit a form outside your component tree.

---

## `<Pilot>` provider

| Prop               | Type                                            | Default          | Notes                                                                                           |
| ------------------ | ----------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `model`            | `string`                                        | `"openai/gpt-4o"` | `"<provider>/<model>"`. Supported prefixes: `openai`, `anthropic`, `groq`, `openrouter`, `google`, `mistral`. |
| `apiUrl`           | `string`                                        | `"/api/pilot"`   | Path to the route exposing `createPilotHandler`.                                                |
| `pilotProtocolUrl` | `string`                                        | `undefined`      | URL (or path) from which the runtime loads `.pilot/manifest.json`. Omit to run hook-only.       |
| `headers`          | `Record<string, string> \| () => Record<…>`     | `undefined`      | Forwarded on every request. Use the function form for dynamic auth tokens.                     |

All props except `apiUrl` can change at runtime. `apiUrl` is captured on mount — changing it mid-session would orphan the current stream.

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

No Tailwind, no design system — just CSS variables. Override on any parent scope:

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
| `model`              | `ModelSpec`                         | —       | Required. String (`"<provider>/<model>"`), `LanguageModel` instance, or a thunk returning one. Validated at startup. |
| `system`             | `string`                            | —       | Server-owned system prompt. Always prepended before any client-derived instructions.       |
| `maxSteps`           | `number`                            | `5`     | Upper bound on `call → result → follow-up` iterations per request.                         |
| `getProviderOptions` | `() => Record<string, unknown>`     | —       | Per-request provider tuning (caching hints, thinking budgets, etc.).                       |

**`ModelSpec` resolution:**

- **String** like `"openai/gpt-4o"` or `"openrouter/qwen/qwen3-coder:free"`: if a matching provider env var is set (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, ...) *and* the corresponding `@ai-sdk/*` peer package is installed, the direct adapter is used. Otherwise, if `AI_GATEWAY_API_KEY` is set, the raw string is handed to the Vercel AI Gateway. If neither applies, the factory throws at startup — never at request time.
- **`LanguageModel` instance**: used verbatim. No prefix validation. Ideal for Ollama, Azure, Bedrock, or any other provider not on the built-in list.
- **Thunk**: called once at handler creation; must return (or resolve to) a `LanguageModel`.

**What it does:**

1. Validates the `useChat` POST body against a narrow Zod schema.
2. Converts UI messages to model messages and forwards to `streamText`.
3. Wraps client-declared tools with `dynamicTool` — tool calls stream back to the browser; handlers never run on the server.
4. Returns the AI SDK's native UI-message stream. `useChat` reassembles text, tool parts, and reasoning with no custom decoder.
5. Emits CORS headers and a stable `{error, code}` envelope (`invalid_request | unsupported_provider | internal_error | method_not_allowed`) on failure.

**Security notes:**

- **API keys stay server-side.** Direct-provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ...), `OPENROUTER_API_KEY`, and `AI_GATEWAY_API_KEY` are read from `process.env`. The browser bundle never sees them.
- **Provider allow-list.** Unsupported model prefixes fail at handler-creation time, not at first request. Clients that try to override the model via the request body are re-validated against the same list — no path to injecting arbitrary strings.
- **Client tools never execute server-side.** They're forward declarations. If you need a true server-side tool, call `streamText` directly — the server handler is a shim, not a moat around it.
- **Mutating confirmations happen in the browser.** The server doesn't see the confirm step; the handler simply won't run until the user approves.

Runs on any Web Fetch runtime: Next.js App Router (tested), Bun, Cloudflare Workers, Hono, edge runtimes.

---

## The `.pilot/` skills folder

Most copilot libraries make you re-author AI behavior in TypeScript on every prompt change. `agentickit` lets you ship capabilities as markdown files your product team can edit.

**Problem:** The rules your assistant should follow ("always confirm refunds over $100", "when the user says 'summarize' on a >50-card board, group by status") live in the system prompt — which lives inside your bundle — which means a prompt change is a code change is a redeploy.

**Fix:** a committed `.pilot/` folder with a routing file (`RESOLVER.md`), a manifest (`manifest.json`), and one `SKILL.md` per capability. The runtime loads it at mount via `pilotProtocolUrl` and filters skills whose `name` doesn't match a registered `usePilotAction` — so the model never sees an uninvokable capability.

### Folder shape

```
.pilot/
  RESOLVER.md              # trigger → skill routing table
  manifest.json            # machine-readable index (built by tooling)
  skills/
    refund-order/
      SKILL.md             # frontmatter + procedural body
    fill-checkout/
      SKILL.md
    summarize-board/
      SKILL.md
  conventions/             # optional cross-cutting rules
    tone.md
    ui-safety.md
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
1. `get_order({ id })` — resolve the order.
2. If `order.total > 100`, summarize and ask the user to confirm.
3. `issue_refund({ orderId, amount })`.

## Anti-Patterns
- Do not refund partial line-items without matching `get_order.lineItems[]`.
- Do not batch refunds across orders.
```

Frontmatter is a **strict superset of Anthropic's Agent Skills spec** (which requires only `name` and `description`) and Garry Tan's gbrain convention (`triggers`, `tools`, `mutating`). A `SKILL.md` written for any of those three also parses here. agentickit also reads `allowed-tools` (Anthropic spelling) as a synonym for `tools`.

### Interop

- **Claude Code / Cursor / Aider users** who already have `AGENTS.md` or `CLAUDE.md` at the repo root can `extends` them in the manifest — the file stays a single source of truth for both authoring-time and runtime agents.
- **External agents** discovering your app can fetch `.pilot/manifest.json` as a machine-readable capability index. If you also emit a top-level `llms.txt`, point it at `/pilot/` so crawlers can find the folder.
- **MCP bridges** are on the roadmap (v0.2): expose `.pilot/*` as MCP resources so external LLM clients can consume the same skills your in-app copilot sees.

### When to use `.pilot/`

Use it when prompt logic is becoming a code-review bottleneck, when a non-engineer wants to tune AI behavior, or when you have enough capabilities (>5) that keeping them in JS strings becomes unreadable.

**Skip it** for prototypes, for apps with two or three actions, or when everything the AI does belongs in version control alongside the code that implements it. The hooks alone work with zero markdown.

---

## Compared to alternatives

| | **agentickit** | **CopilotKit** | **assistant-ui** | **Vercel AI SDK** | **Browser agents** (Stagehand, Browserbase) |
| --- | --- | --- | --- | --- | --- |
| Focus                    | App integration                | Enterprise agent platform      | Chat UI primitives            | Streaming + model adapters   | Web automation              |
| Approximate LoC          | ~1,500                         | ~60,000                        | ~15,000                       | N/A (library)                | N/A                         |
| Agent framework required | No                             | Yes (AG-UI / CoAgents)         | No                            | No                           | Own runtime                 |
| Form integration         | `usePilotForm` (RHF)           | Not shipped                    | `useAssistantForm` (RHF)      | DIY                          | N/A                         |
| Markdown skills (`.pilot/`) | Yes                          | No                             | No                            | No                           | No                          |
| Backend required         | 50-LoC route template          | Hosted runtime or self-host    | None (client-side API)        | None                         | Managed cloud               |
| Ceiling                  | Well-loved small library       | Fortune-500 platform           | YC-backed primitives layer    | Industry standard            | End-to-end automation       |

**Honest read.** CopilotKit is the mature choice if you need AG-UI, CoAgents, multi-vendor federation, or a managed cloud — they own that seat. assistant-ui has better chat primitives than we ship, and their `useAssistantForm` is more polished. Vercel AI SDK is what we sit on top of; if you want to write the integration layer yourself, go straight there. Our slot is "I want a copilot sidebar that understands my app state and actions, and I want to be done by dinner."

---

## FAQ

<details>
<summary><b>Who should use this?</b></summary>

React or Next.js apps where you want an AI copilot that reads your state, calls your functions, and fills your forms — and you want the whole integration layer to be readable source you can audit in a lunch break. Solo developers, small teams, side projects, internal tools.

Not you if: you need enterprise SSO, multi-agent orchestration, a managed cloud, or non-engineers authoring agents at scale. That's what CopilotKit is for.
</details>

<details>
<summary><b>Why not CopilotKit?</b></summary>

CopilotKit is ~60k LoC, 28k stars, a full agent framework with its own AG-UI protocol. It's the right tool if you're building a Fortune-500 frontend for agents. agentickit is ~5% of that surface. We optimize for a solo engineer reading the whole codebase in one sitting; they optimize for a team building on top of a platform. Different products.
</details>

<details>
<summary><b>Why not assistant-ui?</b></summary>

assistant-ui is the headless-primitives layer — `ThreadRoot`, `ComposerInput`, `MessagePartsGrouped`, thirty-odd composable pieces. If you want maximum control over every inch of chat UI, go straight there. We ship a single opinionated `<PilotSidebar>` and three hooks that wire chat to app state / actions / forms. We credit assistant-ui's primitives in [`packages/agentickit/NOTICE.md`](./packages/agentickit/NOTICE.md).
</details>

<details>
<summary><b>Why not raw <code>useChat</code> from the AI SDK?</b></summary>

You absolutely can. `useChat` + `streamText` is ~100 LoC from a working copilot. You write the tool-call loop integration, the state-sync reducer, the sidebar UI, the form binding, the confirmation flow. agentickit is the version of that code you'd write on your fourth copilot project.
</details>

<details>
<summary><b>Does it work outside Next.js?</b></summary>

Yes. `createPilotHandler` returns a `(Request) => Promise<Response>` — runs anywhere with Web Fetch. We use Next.js App Router in every example because it's the common case, but Bun, Hono, Cloudflare Workers, and Fastify with `@fastify/web-fetch` all work. The client hooks are framework-agnostic React.
</details>

<details>
<summary><b>What models are supported?</b></summary>

As of April 2026, string `model` values with any of these prefixes work out of the box: `openai/`, `anthropic/`, `groq/`, `openrouter/`, `google/`, `mistral/`. The handler picks the direct `@ai-sdk/*` adapter when the matching provider env var is set (e.g. `OPENAI_API_KEY`) — otherwise it falls back to the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) when `AI_GATEWAY_API_KEY` is present.

For anything else — Ollama (local), Azure, Bedrock, DeepInfra, custom OpenAI-compatible endpoints — pass a prebuilt `LanguageModel` instance instead of a string:

```ts
import { createOllama } from "ai-sdk-ollama";
const ollama = createOllama();
export const POST = createPilotHandler({ model: ollama("llama3.3") });
```

The prefix allow-list and env detection are skipped for instances; the model is handed to `streamText` verbatim. Supported via the `ModelSpec` escape hatch — no core change needed. For free tier experimentation without a credit card, try `"openrouter/qwen/qwen3-coder:free"` with `OPENROUTER_API_KEY`.
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

Yes. Hector Oviedo — <hector.ernesto.oviedo@gmail.com>. This library is the portfolio artifact.
</details>

---

## Roadmap

### v0.1 — shipped
- Three hooks (`usePilotState`, `usePilotAction`, `usePilotForm`)
- `<Pilot>` provider wiring AI SDK 6's `useChat` with a dynamic tool registry
- `<PilotSidebar>` with dark mode, CSS-variable theming, a11y, suggestion chips
- `createPilotHandler` for Next.js / Bun / Workers — direct adapters for `openai/*`, `anthropic/*`, `groq/*`, `openrouter/*`, `google/*`, `mistral/*`, plus Vercel AI Gateway fallback and a `LanguageModel`-instance escape hatch
- `.pilot/` protocol loader — `RESOLVER.md` parser, `SKILL.md` parser, `manifest.json` validator

### v0.2 — next
- **Ghost fills** — streaming form previews; Tab to accept, Shift-Tab to reject
- **AI cursor** — visible floating pointer that narrates DOM-touching actions
- **`renderConfirm` prop** on `<Pilot>` for custom confirmation modals (today: `window.confirm`)
- **DOM-fallback actuator** — accessibility-tree-driven action layer for sites without explicit integration

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

- Open an issue before a large PR — agentickit is deliberately small and we'd rather talk scope upfront than close a big PR.
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
