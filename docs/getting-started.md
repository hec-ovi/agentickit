# Getting started

Zero to working copilot in about five minutes. Pick a server framework you already use; the snippets below are Next.js App Router. Bun, Cloudflare Workers, and Hono work the same way: any Web Fetch API runtime is fine.

## Install

```bash
npm install @hec-ovi/agentickit
```

Plus exactly one provider adapter for whichever model you want to call:

```bash
# Free-tier friendly default
npm install @openrouter/ai-sdk-provider

# Or any one of:
npm install @ai-sdk/openai       # OPENAI_API_KEY
npm install @ai-sdk/anthropic    # ANTHROPIC_API_KEY
npm install @ai-sdk/groq         # GROQ_API_KEY
npm install @ai-sdk/google       # GOOGLE_GENERATIVE_AI_API_KEY
npm install @ai-sdk/mistral      # MISTRAL_API_KEY
```

Or skip the adapter entirely and set `AI_GATEWAY_API_KEY` to route through the Vercel AI Gateway. The handler auto-detects which path applies based on which env var is set.

Optional peer deps:

```bash
npm install react-hook-form        # only if you'll use usePilotForm
npm install @ag-ui/client @ag-ui/core   # only if you'll use agUiRuntime
```

Requires Node 20+ and React 18 or 19.

## The smallest working app

Two files. Server route + a page.

### Server route

`app/api/pilot/route.ts`:

```ts
import { createPilotHandler } from "@hec-ovi/agentickit/server";

const handler = createPilotHandler({ model: "openrouter/qwen/qwen3-coder:free" });

export const POST = (req: Request) => handler(req);
```

That's the whole server. The handler validates the request body, loads the matching provider adapter, runs `streamText` from AI SDK 6, and returns the UIMessage stream `useChat` expects.

### Client

`app/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { z } from "zod";
import {
  Pilot,
  PilotSidebar,
  usePilotState,
  usePilotAction,
} from "@hec-ovi/agentickit";

function Cart() {
  const [total, setTotal] = useState(100);

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
    handler: ({ percent }) => setTotal((t) => Math.round(t * (1 - percent / 100))),
    mutating: true,
  });

  return <p>Total: ${total}</p>;
}

export default function Page() {
  return (
    <Pilot apiUrl="/api/pilot">
      <Cart />
      <PilotSidebar defaultOpen />
    </Pilot>
  );
}
```

Run it. The sidebar opens on the right, the AI sees `cart_total`, and asking it to "apply a 25 percent discount" pops a confirm modal because `mutating: true`. Approve, the handler runs, the React state updates.

## What just happened

- `<Pilot>` is the provider. It owns the chat connection, the registry of state and actions, the confirm-modal queue, and the runtime. Everything else reads from it.
- `usePilotState` registers a piece of React state (`cart_total`) so the AI can read it. The Zod schema is the contract.
- `usePilotAction` registers a tool the AI can call. `parameters` is the input schema; `handler` is what runs. `mutating: true` says "ask the user before firing this".
- `<PilotSidebar>` is one of four chat surfaces. Same provider, different chrome. See [chat surfaces](./ui.md).
- `createPilotHandler` is the server side. Same provider you use directly with AI SDK, just with the agentickit envelope around it.

## Next steps

- The three hooks in depth: [hooks.md](./hooks.md)
- Other chat surfaces (popup bubble, modal, headless): [ui.md](./ui.md)
- `.pilot/` skills protocol so the AI sees a curated guidebook of what your app does: [server.md](./server.md)
- Pointing at a hosted vs local model: [providers.md](./providers.md)

## Run the bundled example

```bash
git clone https://github.com/hec-ovi/agentickit
cd agentickit
pnpm install
pnpm --filter @hec-ovi/agentickit build

cd examples/todo
cp .env.example .env.local
# edit .env.local: pick a provider, set its key
pnpm dev
```

Vite serves the React app on `:5173`, Hono serves the API on `:8787`, the dev server proxies `/api` to Hono. Three widgets (todo list, contact form, preferences picker) plus a live log panel that streams every server-side event.
