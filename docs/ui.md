# Chat surfaces

Four ready-made surfaces. Pick whichever fits the page; they all read from the same `<Pilot>` provider so they share registry, runtime, confirm modal, and HITL gate.

## Quick comparison

| Surface | Shape | When to reach for it |
| --- | --- | --- |
| [`<PilotSidebar>`](#pilotsidebar) | Slide-in panel docked left or right | Default for desktop apps. Always-on copilot. |
| [`<PilotPopup>`](#pilotpopup) | Floating bubble in a corner | Marketing sites, chat-first feel. Intercom/Drift convention. |
| [`<PilotModal>`](#pilotmodal) | Centered backdrop dialog | Heavy, focused workflow. Triggered from a button. |
| [`<PilotChatView>`](#pilotchatview) | Headless body | You're rolling your own chrome (drawer, embedded card, popover). |

All four mount inside `<Pilot apiUrl="/api/pilot">...</Pilot>`. None of them is required; you can build a fully custom surface from the context (see the headless section).

## PilotSidebar

```tsx
import { Pilot, PilotSidebar } from "@hec-ovi/agentickit";

<Pilot apiUrl="/api/pilot">
  {/* your app */}
  <PilotSidebar
    defaultOpen={false}      // collapsed by default; toggle button appears
    position="right"          // or "left"
    width={380}                // panel width when open, in px
    labels={{
      title: "Helper",
      openButton: "Open helper",
      closeButton: "Close",
      inputPlaceholder: "Ask anything",
      sendButton: "Send",
      emptyState: "Hi! What can I help with?",
    }}
  />
</Pilot>
```

Renders a collapsed toggle button when closed and an `<aside role="complementary">` when open. Focus restores to the toggle on close. `aria-label` is configurable via `labels.title`.

The sidebar internally renders `<PilotChatView>` for the body, so suggestions, error banner, skills panel, and composer behavior are identical across all four surfaces.

### `mode="overlay" | "push"`

- `"overlay"` (default): the sidebar floats over your page; nothing else moves. The current behavior.
- `"push"`: while the sidebar is open, the package marks `<html>` with `data-pilot-sidebar-mode="push"`, `data-pilot-sidebar-state="open"`, `data-pilot-sidebar-position="left|right"`, and a CSS variable `--pilot-sidebar-width-active`. The package's own CSS applies a matching `padding-left` / `padding-right` to `<body>` so the page content shifts to make room. The user sees both your full app and the chat side-by-side, instead of one floating over the other.

Use push mode for editor-style or dashboard-style apps where the underlying page IS the work and the chat is a long-running side panel. Use overlay for AI-first surfaces where the chat is the work and the page is context.

Consumers can override the package's body-padding rule and instead push a specific element (e.g., `main`) by selecting on the same `data-pilot-sidebar-mode="push"` attribute set:

```css
html[data-pilot-sidebar-mode="push"][data-pilot-sidebar-state="open"][data-pilot-sidebar-position="right"] body {
  padding-right: 0;
}
html[data-pilot-sidebar-mode="push"][data-pilot-sidebar-state="open"][data-pilot-sidebar-position="right"] main {
  padding-right: var(--pilot-sidebar-width-active);
}
```

Source: [`packages/agentickit/src/components/pilot-sidebar.tsx`](../packages/agentickit/src/components/pilot-sidebar.tsx).

## PilotPopup

```tsx
import { Pilot, PilotPopup } from "@hec-ovi/agentickit";

<Pilot apiUrl="/api/pilot">
  {/* your app */}
  <PilotPopup
    position="bottom-right"   // or "bottom-left", "top-right", "top-left"
    labels={{ title: "Help", openButton: "Open help" }}
  />
</Pilot>
```

Circular toggle button anchored to a corner; opens into a card. The toggle hides while open (Intercom convention); the card has its own close X. `aria-modal="false"` because the page behind stays interactive.

Source: [`packages/agentickit/src/components/pilot-popup.tsx`](../packages/agentickit/src/components/pilot-popup.tsx).

## PilotModal

Controlled component, unlike the other three. You manage the open state and trigger:

```tsx
import { useState } from "react";
import { Pilot, PilotModal } from "@hec-ovi/agentickit";

function App() {
  const [open, setOpen] = useState(false);

  return (
    <Pilot apiUrl="/api/pilot">
      <button type="button" onClick={() => setOpen(true)}>Ask AI</button>
      <PilotModal open={open} onClose={() => setOpen(false)} />
      {/* your app */}
    </Pilot>
  );
}
```

Portals to `document.body`. `aria-modal="true"`, full Tab focus trap (cycles between first and last focusable in the dialog), Escape and backdrop-click close. Focus restores to whatever was focused before the modal opened.

Source: [`packages/agentickit/src/components/pilot-modal.tsx`](../packages/agentickit/src/components/pilot-modal.tsx).

## PilotChatView

The headless body. The other three surfaces wrap this; you can mount it directly inside any chrome of your own.

```tsx
import { Pilot, PilotChatView } from "@hec-ovi/agentickit";

<Pilot apiUrl="/api/pilot">
  <div className="my-custom-drawer">
    <header>Custom header</header>
    <PilotChatView
      labels={{
        emptyState: "Pick a suggestion or type below",
        inputPlaceholder: "Ask...",
        sendButton: "Go",
      }}
      suggestions={["Show recent orders", "Refund the latest one"]}
      showSkillsPanel={false}
    />
  </div>
</Pilot>
```

What you get: error banner, optional suggestion-chip row (rendered when `messages.length === 0` and `suggestions` is non-empty), optional collapsible skills panel, message list, and composer. No outer chrome. Bring your own borders and animation.

### `composer="full" | "suggestions" | "off"`

Available on every chat surface (`<PilotChatView>`, `<PilotSidebar>`, `<PilotPopup>`, `<PilotModal>`). Controls whether the user can type into the chat at all.

- `"full"` (default): textarea + send button + suggestion chips + skills panel.
- `"suggestions"`: hides the textarea and send button; suggestion chips remain so the user can drive the chat via canned prompts only. The skills panel is also hidden because it implies typing.
- `"off"`: hides the composer AND the chips. The chat surface becomes purely observational, useful for streaming agent state where free text would not make sense.

Use `"suggestions"` or `"off"` when the active runtime is scripted, deterministic, or runs in a one-shot mode where the user typing free text would be misleading. The default `"full"` keeps existing behavior.

### Theming with `data-pilot-theme`

The package's chat surfaces auto-track OS dark mode via `@media (prefers-color-scheme: dark)`. To override that with your app's theme toggle, set `data-pilot-theme="dark"` (or `"light"`) on `<html>` (or any ancestor of the chat surface). The package CSS honors that attribute alongside the `@media` query, so your manual choice always wins.

The defaults are wrapped in `:where(:root)` (specificity 0), so any `:root { --pilot-* : ... }` override in your stylesheet wins without needing higher-specificity selectors.

Imperative handle via ref:

```tsx
const chatRef = useRef<PilotChatViewHandle>(null);
chatRef.current?.focus();
chatRef.current?.prefill("Suggested prompt");
```

Source: [`packages/agentickit/src/components/pilot-chat-view.tsx`](../packages/agentickit/src/components/pilot-chat-view.tsx).

## Going fully custom

Drop the surface entirely; consume `PilotChatContext` directly.

```tsx
import { useContext } from "react";
import { Pilot, PilotChatContext } from "@hec-ovi/agentickit";

function MyComposer() {
  const chat = useContext(PilotChatContext);
  if (!chat) return null;

  return (
    <button type="button" onClick={() => chat.sendMessage("hello")}>
      Say hi
    </button>
  );
}

<Pilot apiUrl="/api/pilot">
  <MyComposer />
  {/* render chat.messages however you want */}
</Pilot>
```

`PilotChatContext` is the same `useChat` return value (typed). You get `messages`, `sendMessage`, `stop`, `error`, `status`, `setMessages`. From there you decide how things look.

## Confirm modal

Always renders, regardless of which surface (or no surface) you're using. It's a sibling portal mounted by `<Pilot>` itself. Triggered when a `mutating: true` action is invoked. To replace its look, pass `renderConfirm` to `<Pilot>`:

```tsx
<Pilot
  apiUrl="/api/pilot"
  renderConfirm={({ name, description, input, approve, cancel }) => (
    /* your custom UI */
  )}
>
```

See [hitl-and-confirm.md](./hitl-and-confirm.md) for the full HITL story.

## Generative UI

If your runtime is `agUiRuntime` (LangGraph CoAgents, CrewAI, Mastra, etc.), the agent can stream a typed state object that your React tree reads via `<PilotAgentStateView>`. Out of scope for this guide; see the source and its alongside test for the worked example.

[`packages/agentickit/src/components/pilot-agent-state-view.tsx`](../packages/agentickit/src/components/pilot-agent-state-view.tsx).
