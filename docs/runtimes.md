# Runtimes and multi-agent

Agentickit has a `PilotRuntime` abstraction sitting between `<Pilot>` and the wire. By default it's `localRuntime()`, which drives `useChat` from `@ai-sdk/react` against your `createPilotHandler` route. Swap in `agUiRuntime({ agent })` to drive an AG-UI `AbstractAgent` instead, with no UI changes.

## localRuntime (default)

What you've been using when you wrote `<Pilot apiUrl="/api/pilot">`. Under the hood:

```ts
import { Pilot, localRuntime } from "@hec-ovi/agentickit";

<Pilot runtime={localRuntime({ apiUrl: "/api/pilot" })}>...</Pilot>

// equivalent to the shorthand:
<Pilot apiUrl="/api/pilot">...</Pilot>
```

`localRuntime` is `useChat` + the AI SDK 6 UIMessage stream protocol. Every framework piece (chat surfaces, confirm modal, tool dispatch, HITL gate) is built against the runtime contract, so nothing changes when you swap it out.

Source: [`packages/agentickit/src/runtime/local-runtime.ts`](../packages/agentickit/src/runtime/local-runtime.ts).

## agUiRuntime

For AG-UI `AbstractAgent` subclasses (LangGraph CoAgents, CrewAI, Mastra, Pydantic AI, custom). Same chat surfaces, same hooks, same confirm modal, but the wire is AG-UI events instead of AI SDK UIMessage frames.

```tsx
import { Pilot, agUiRuntime } from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";

const agent = new HttpAgent({ url: "https://your-agui-server.example.com/agent" });

<Pilot runtime={agUiRuntime({ agent })}>
  {/* same widgets, same chat surface */}
  <PilotSidebar defaultOpen />
</Pilot>
```

Optional peer deps required:

```bash
npm install @ag-ui/client @ag-ui/core
```

The runtime translates between the AG-UI event stream (text, tool call, tool result, state delta) and the dispatcher contract the rest of agentickit expects. State deltas flow through `usePilotAgentState`; activity events through `usePilotAgentActivity`.

Source: [`packages/agentickit/src/runtime/ag-ui-runtime.ts`](../packages/agentickit/src/runtime/ag-ui-runtime.ts).

## Swapping at runtime

The runtime prop is fully reactive. Swap from `localRuntime` to `agUiRuntime` (or to a different agent within `agUiRuntime`) and `<Pilot>` rebuilds the connection without violating the Rules of Hooks. This is what lets the multi-agent picker in the example work.

```tsx
const [mode, setMode] = useState<"local" | "agent">("local");

const runtime = useMemo(
  () => (mode === "local"
    ? localRuntime({ apiUrl: "/api/pilot" })
    : agUiRuntime({ agent: someAgUiAgent })),
  [mode],
);

<Pilot runtime={runtime}>{/* ... */}</Pilot>
```

## Multi-agent registry (Agent Lock Mode)

When you have many AG-UI agents and want the user to pick which one is active, use the registry plus the `useAgent` lookup:

```tsx
import {
  PilotAgentRegistry,
  useRegisterAgent,
  useAgent,
  agUiRuntime,
  Pilot,
} from "@hec-ovi/agentickit";

function RegisterMyAgents() {
  useRegisterAgent("billing", new HttpAgent({ url: "/agui/billing" }));
  useRegisterAgent("support", new HttpAgent({ url: "/agui/support" }));
  return null;
}

function App() {
  const [activeId, setActiveId] = useState("billing");
  const agent = useAgent(activeId);

  if (!agent) return <p>Loading agents...</p>;

  return (
    <Pilot runtime={agUiRuntime({ agent })}>
      <button type="button" onClick={() => setActiveId("billing")}>Billing</button>
      <button type="button" onClick={() => setActiveId("support")}>Support</button>
      <PilotSidebar defaultOpen />
    </Pilot>
  );
}

function Root() {
  return (
    <PilotAgentRegistry>
      <RegisterMyAgents />
      <App />
    </PilotAgentRegistry>
  );
}
```

What's load-bearing:

- `<PilotAgentRegistry>` is the parent context. Wrap your app once.
- `useRegisterAgent(id, agent)` registers an `AbstractAgent` instance under a string id. Last-wins on duplicate ids (with a dev warning).
- `useAgent(id)` reads back the registered instance reactively; `useAgents()` returns the full map.
- The active agent feeds into `agUiRuntime({ agent })`; switching `activeId` re-renders, the runtime swaps, the chat surface stays mounted.

Per-agent message isolation, separate state stores, and tool-call dispatch through the active agent only are all guaranteed by the registry. See [`packages/agentickit/src/components/pilot-agent-registry.tsx`](../packages/agentickit/src/components/pilot-agent-registry.tsx).

## When to use which

| Scenario | Pick |
| --- | --- |
| Single chat-style assistant against an LLM | `localRuntime` (the default) |
| One AG-UI agent (LangGraph, CrewAI, Mastra, etc.) | `agUiRuntime({ agent })` |
| Multiple AG-UI agents the user can pick from | `agUiRuntime` + `<PilotAgentRegistry>` + `useAgent` |
| Same UI but each route uses a different agent | Multiple `<Pilot>` providers, each with its own runtime |

## Building a custom runtime

Implement `PilotRuntime` from `packages/agentickit/src/runtime/types.ts`. The contract is small: render hooks, send/stop hooks, and a few callbacks. Any transport that emits message-shaped events can plug in.

The two shipped runtimes are good worked examples; both are around 200 lines.
