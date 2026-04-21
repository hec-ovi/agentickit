---
name: install-and-setup
version: 1.0.0
description: |
  Install agentickit into an existing React app (Next.js App Router is the
  happy path; Bun / Cloudflare Workers / Hono also work). Wire the server
  route, the provider, and the sidebar. Use when a consumer says "add
  agentickit to my app" or "getting started".
triggers:
  - "install agentickit"
  - "getting started"
  - "add to my app"
  - "first time setup"
  - "wire the copilot"
tools:
  - run_npm_install
  - edit_file
  - read_env
mutating: true
---

# Install and Setup

## Contract

By the end of this skill the consumer's app has:

- `agentickit` installed alongside its required peers (`ai`,
  `@ai-sdk/react`, `zod`) plus exactly one provider adapter.
- An API route exporting `createPilotHandler` at a path the client can
  reach.
- A `<Pilot>` provider wrapping the component tree and a `<PilotSidebar>`
  rendered as a sibling.
- A working round-trip: open the sidebar, send "hello", see a streamed
  response.

## Iron Law: one provider adapter, one env var

Every install MUST set exactly one of the supported provider env vars AND
install the matching `@ai-sdk/*` peer package. Auto-detection walks the list
in order (see `packages/agentickit/src/server/handler.ts` `AUTO_DETECT_ORDER`)
and throws `noProviderConfiguredError()` if none are present. Shipping
without a provider produces a clear handler-creation-time error — but
shipping with a key and the wrong adapter produces a `MODULE_NOT_FOUND` on
first request. **Verify both before you claim the install is done.**

## Phases

### Phase 1: install runtime deps

```bash
npm install agentickit ai @ai-sdk/react zod
```

Pick **one** provider. Free-tier-friendly is OpenRouter; zero-latency is
Groq; widest model selection is the Vercel AI Gateway:

```bash
# OpenRouter — free tier, no credit card
npm install @openrouter/ai-sdk-provider
# or Groq
npm install @ai-sdk/groq
# or any of: @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/mistral
```

If the consumer wants `usePilotForm`:

```bash
npm install react-hook-form
```

### Phase 2: set the env var

In `.env.local` (or the consumer's equivalent):

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Auto-detect priority (first hit wins): `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`MISTRAL_API_KEY`, `AI_GATEWAY_API_KEY`.

Cross-reference with `skills/choose-provider/SKILL.md` if the consumer is
unsure which to pick.

### Phase 3: create the server route

Next.js App Router — `app/api/pilot/route.ts`:

```ts
import { createPilotHandler } from "agentickit/server";

// Omit `model` to auto-detect a provider from env.
// Pass `model: "openrouter/qwen/qwen3-coder:free"` etc. to be explicit.
export const POST = createPilotHandler({});
```

For Bun / Hono / Cloudflare Workers: `createPilotHandler({})` returns a
`(request: Request) => Promise<Response>` — hand it to whichever routing
primitive the framework uses.

### Phase 4: wrap the client tree

```tsx
// app/layout.tsx (client boundary) or any root client component
"use client";
import { Pilot, PilotSidebar } from "agentickit";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Pilot apiUrl="/api/pilot">
      {children}
      <PilotSidebar />
    </Pilot>
  );
}
```

`apiUrl` defaults to `/api/pilot` so it's usually redundant — leave it for
clarity. Do not pass `model` on `<Pilot>` unless you want a client-side
override of the handler's default.

### Phase 5: smoke test

1. `npm run dev`.
2. Open the app in a browser. The sidebar's toggle button is a pill on the
   right edge labeled "Copilot".
3. Click it. Type "hello".
4. Expect a streamed response within one second.

Failure modes and fixes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| 500 on first message, `MODULE_NOT_FOUND` | Env var set but adapter not installed | `npm install @ai-sdk/<provider>` |
| 500 with "no model configured" | No env var set | Set one of the supported keys |
| 400 `unsupported_provider` | Model string prefix typo (e.g. `opnai/gpt-4o`) | Fix the prefix; see `SUPPORTED_PROVIDER_PREFIXES` in `server/handler.ts` |
| CORS error | Calling the route cross-origin without the handler's CORS headers being preserved | Don't wrap the response — let `createPilotHandler` own the `Response` |

## Anti-Patterns

- Installing multiple provider adapters "just in case" — the auto-detect
  order is deterministic, extra keys just confuse the next developer.
- Exposing provider API keys in the browser bundle. `OPENAI_API_KEY` etc.
  are read server-side from `process.env`; never import them into client
  code.
- Passing `model` on both `<Pilot>` AND `createPilotHandler({ model })`.
  The client value wins; if the consumer intended the server choice they'll
  be confused.
- Putting `<PilotSidebar />` outside `<Pilot>`. The sidebar reads from
  `PilotChatContext`; without the provider it renders but won't chat.

## Output Format

After install, report:

- The env var you configured (name only, never the value).
- The adapter package you installed.
- The route path you created.
- One sentence confirming the smoke test passed, or the exact error if it
  didn't.

## Tools Used

- Run `npm install` to add deps.
- Edit `.env.local` to set the provider key.
- Edit the app's layout / route files to wire the provider + handler.
