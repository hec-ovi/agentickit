# agentickit

**Wire an AI copilot into your React app's state, actions, and forms.** Three hooks, one sidebar, optional `.pilot/` skills folder.

[![npm](https://img.shields.io/npm/v/agentickit.svg?color=black)](https://www.npmjs.com/package/agentickit)
[![license: MIT](https://img.shields.io/badge/license-MIT-black.svg)](https://github.com/hec-ovi/agentickit/blob/master/LICENSE)
[![built on AI SDK 6](https://img.shields.io/badge/built%20on-AI%20SDK%206-black.svg)](https://ai-sdk.dev)

> Sits between Vercel AI SDK's primitives and CopilotKit's enterprise framework. Three hooks, AI SDK 6 native, under 1,500 lines. MIT. Not a chatbot framework, not a browser agent, not a LangGraph runner.

---

## Install

```bash
npm install agentickit ai @ai-sdk/react zod
# Optional — only required for usePilotForm:
npm install react-hook-form
```

**Peer requirements:** React 18 or 19, Node 20+, a framework with Web Fetch on the server (Next.js App Router, Bun, Cloudflare Workers, Hono).

---

## Quick start (Next.js)

### 1. Server route

```ts
// app/api/pilot/route.ts
import { createPilotHandler } from "agentickit/server";

export const POST = createPilotHandler({ model: "openai/gpt-4o" });
```

Set `AI_GATEWAY_API_KEY` in your environment. Model strings are gateway-formatted: `openai/*`, `anthropic/*`, `groq/*`.

### 2. Client

```tsx
"use client";
import { useState } from "react";
import { z } from "zod";
import { Pilot, PilotSidebar, usePilotState, usePilotAction } from "agentickit";

function TodoBoard() {
  const [todos, setTodos] = useState<string[]>([]);

  usePilotState({
    name: "todos",
    description: "Current list of todo items.",
    value: todos,
    schema: z.array(z.string()),
  });

  usePilotAction({
    name: "add_todo",
    description: "Add a new todo to the list.",
    parameters: z.object({ text: z.string().min(1) }),
    handler: ({ text }) => setTodos((t) => [...t, text]),
  });

  return <ul>{todos.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

export default function App() {
  return (
    <Pilot model="openai/gpt-4o" apiUrl="/api/pilot">
      <TodoBoard />
      <PilotSidebar />
    </Pilot>
  );
}
```

Say *"add a todo to buy groceries"* in the sidebar. The model calls `add_todo`, the list updates, and the assistant sees the new state on its next turn.

---

## API reference

### Hooks

#### `usePilotState({ name, description, value, schema, setValue? })`

Expose React state to the AI. Pass `setValue` to auto-register an `update_<name>` tool so the AI can propose whole-value updates (confirmed by the user before it lands).

```tsx
usePilotState({
  name: "cart_total",
  description: "Current cart total in USD.",
  value: total,
  schema: z.number(),
  setValue: setTotal,
});
```

#### `usePilotAction({ name, description, parameters, handler, mutating? })`

Register a typed, AI-callable tool. Parameters use Zod (inferred into the handler). Handler runs in the browser and can return any JSON-serializable value, which the assistant sees on its next step. `mutating: true` triggers a user confirmation before execution.

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

#### `usePilotForm(form, { name?, ghostFill? })`

Attach a `react-hook-form` instance to the copilot. Registers `set_<name>_field`, `submit_<name>`, `reset_<name>`. Returns the form unchanged.

```tsx
const form = useForm<{ email: string; amount: number }>();
usePilotForm(form, { name: "invoice" });
```

`ghostFill` is reserved for v0.2 (streaming preview with Tab-to-accept). Safe to pass today; currently a no-op.

### Components

#### `<Pilot model apiUrl pilotProtocolUrl? headers?>`

Top-level provider. Wraps an AI SDK 6 `useChat` transport that appends the current tool registry and state snapshot to every request. See the [root README](https://github.com/hec-ovi/agentickit#pilot-provider) for the full prop table.

#### `<PilotSidebar />`

Opinionated chat UI — slide-in panel, dark mode, CSS-variable theming, suggestion chips, accessible keyboard navigation. Props: `defaultOpen`, `position`, `width`, `suggestions`, `greeting`, `labels`, `onOpenChange`, `className`. Theme with CSS custom properties (`--pilot-bg`, `--pilot-accent`, `--pilot-radius`, …).

### Server

#### `createPilotHandler({ model, system?, maxSteps?, getProviderOptions? })`

Returns a `(Request) => Promise<Response>` for any Web Fetch runtime. Validates the `useChat` body with Zod, dispatches to `streamText`, wraps client-declared tools as `dynamicTool` (they stream to the browser — never execute server-side), and returns `toUIMessageStreamResponse()`.

```ts
export const POST = createPilotHandler({
  model: "anthropic/claude-sonnet-4-5",
  system: "You are a helpful copilot for a kanban app.",
  maxSteps: 5,
});
```

### Protocol (optional)

`import { parseResolver, parseSkill, loadManifest } from "agentickit/protocol";`

Reads an optional `.pilot/` folder (see below) with a resolver table, per-capability `SKILL.md` files, and a `manifest.json` index.

---

## The `.pilot/` skills folder

Ship capabilities as markdown. PMs and designers edit `SKILL.md` files; engineers only touch code when the *capability* changes. Compatible with Anthropic's Agent Skills frontmatter and gbrain's SKILL.md convention.

```
.pilot/
  RESOLVER.md              # trigger → skill routing table
  manifest.json            # machine-readable index
  skills/
    refund-order/SKILL.md
    fill-checkout/SKILL.md
```

Load it at mount with `<Pilot pilotProtocolUrl="/pilot" …>`. Skills whose `name` doesn't match a registered `usePilotAction` are filtered out of the system prompt — the model never sees an uninvokable capability.

Full spec, examples, and interop notes (Claude Code / Cursor / MCP): see the [root README on GitHub](https://github.com/hec-ovi/agentickit#the-pilot-skills-folder).

---

## Why agentickit over the alternatives?

- **vs CopilotKit** — CopilotKit is the Fortune-500 choice (AG-UI, CoAgents, managed cloud, ~60k LoC). agentickit is ~5% of that surface, for solo devs and small teams.
- **vs assistant-ui** — assistant-ui is 30+ chat primitives; agentickit is one opinionated sidebar plus the state/actions/forms wiring assistant-ui leaves to you.
- **vs raw AI SDK** — `useChat` + `streamText` is the right call if you want to write the integration layer yourself. agentickit is that layer.

Full comparison table in the [root README](https://github.com/hec-ovi/agentickit#compared-to-alternatives).

---

## Exports

```ts
import {
  Pilot,
  PilotSidebar,
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
} from "agentickit";

import {
  createPilotHandler,
  type CreatePilotHandlerOptions,
  type PilotErrorBody,
} from "agentickit/server";

import {
  parseResolver,
  parseSkill,
  loadManifest,
  type ResolverEntry,
  type SkillFrontmatter,
  type LoadedSkill,
} from "agentickit/protocol";
```

---

## Links

- **Full documentation, roadmap, FAQ** → [github.com/hec-ovi/agentickit](https://github.com/hec-ovi/agentickit)
- **License** → MIT. See [LICENSE](https://github.com/hec-ovi/agentickit/blob/master/LICENSE).
- **Attribution** → Inspired by CopilotKit and assistant-ui (both MIT). Built on Vercel AI SDK. `.pilot/` protocol inspired by Garry Tan's gbrain and Anthropic's Agent Skills standard. See [`NOTICE.md`](./NOTICE.md).
