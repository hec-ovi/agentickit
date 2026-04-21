---
name: customize-sidebar
version: 1.0.0
description: |
  Theme, relabel, reposition, and customize `<PilotSidebar>`. Covers CSS
  variables (the sidebar has no Tailwind, no design system), labels for
  i18n, suggestion chips, position and width. Also covers when to drop
  the sidebar entirely and build a custom UI from PilotChatContext.
triggers:
  - "customize the sidebar"
  - "theme the copilot"
  - "change labels"
  - "dock to left"
  - "suggestion chips"
  - "dark mode"
  - "custom copilot UI"
tools:
  - edit_file
  - edit_css
mutating: true
---

# Customize Sidebar

## Contract

By the end of this skill the consumer has:

- A `<PilotSidebar>` styled to match their app (CSS variables overridden on
  a parent scope).
- Labels localized or branded via the `labels` prop.
- (Optionally) suggestion chips pinned to common prompts.
- (Optionally) position / width / greeting customized.
- A clear decision about whether to keep using the bundled sidebar or
  build a custom one from `PilotChatContext`.

## Iron Law: don't copy-paste the sidebar source, override via CSS variables

The sidebar is ~350 lines split across four sibling files
(`packages/agentickit/src/components/pilot-sidebar*.tsx` + the styles
file). It uses CSS variables scoped with `--pilot-*`. See the exported
`pilotSidebarStyles` injection path in `pilot-sidebar.tsx` line 41 +
132-134. **Overriding via CSS variables on any parent is idempotent and
survives package upgrades. Patching the bundled styles via `!important`
or a fork is a maintenance landmine.**

## Phases

### Phase 1: inventory what the consumer wants to change

- **Colors / radius / shadow**: CSS variables, Phase 2.
- **Label text / placeholder / buttons**: `labels` prop, Phase 3.
- **Position (left/right) or width**: props, Phase 4.
- **Suggestion chips** on empty state: `suggestions` prop, Phase 5.
- **Fundamentally different layout** (bottom-anchored, inline, modal):
  build a custom UI from `PilotChatContext`, Phase 6.

### Phase 2: theme with CSS variables

Anywhere in the app's global CSS:

```css
:root {
  --pilot-bg: #fff;
  --pilot-fg: #0a0a0a;
  --pilot-accent: #7c3aed;          /* send button, toggle pill, focus */
  --pilot-user-bubble-bg: #ede9fe;
  --pilot-radius: 12px;
  --pilot-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
```

Dark mode works automatically via `prefers-color-scheme: dark` (see
`pilot-sidebar.tsx` line 257 in the header docstring). Consumers who want
to force light or dark mode set the variables on an ancestor with
`data-theme` or similar.

### Phase 3: override labels

All six labels are optional; omitted keys use the built-in English
defaults (see `DEFAULT_LABELS` in `pilot-sidebar.tsx` lines 91-98).

```tsx
<PilotSidebar
  labels={{
    title: "Help",
    inputPlaceholder: "Describe what you want to do…",
    sendButton: "Ask",
    emptyState: "Hi! How can I help?",
    openButton: "Open help panel",
    closeButton: "Close help panel",
  }}
/>
```

The `openButton` and `closeButton` labels are important: they're used as
the `aria-label` on the toggle and close controls (lines 221-224, 258-260).
Localize them for accessibility.

### Phase 4: position and width

```tsx
<PilotSidebar
  position="left"        // default "right"
  width={420}            // default "380px"; number → px, string → any CSS unit
  defaultOpen={true}     // default false
/>
```

`width` accepts a number (rendered as px) or any CSS length string
(`"32rem"`, `"50vw"`, `"clamp(320px, 30vw, 540px)"`). See lines 213-214.

`position` renders `data-position="left|right"` on the outer `<aside>`
(line 246). The bundled styles mirror the slide-in and toggle based on
that attribute.

### Phase 5: suggestion chips

Only shown when `messages.length === 0` (empty state). Clicking a chip
calls `sendMessage(chipText)` and focuses the composer (lines 189-195,
280-294).

```tsx
<PilotSidebar
  suggestions={[
    "What's still pending?",
    "Add 'buy milk' to my list",
    "Remove the first one",
  ]}
/>
```

Four to six chips is the practical maximum before they wrap awkwardly.
Omit the prop entirely to hide the row.

### Phase 6: build a custom UI from `PilotChatContext`

Drop the bundled sidebar when:

- The app needs a bottom-anchored bar (ChatGPT-style), modal, inline
  thread, or slash-command input surface.
- The design system is strongly opinionated and CSS-variable theming
  isn't enough.

The chat surface reads from `PilotChatContext` (exported from
`packages/agentickit/src/context.ts`):

```tsx
import { useContext } from "react";
import { PilotChatContext } from "agentickit";   // still under <Pilot>

function MyComposer() {
  const chat = useContext(PilotChatContext);
  if (!chat) return null;
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const text = new FormData(e.currentTarget).get("q");
      if (typeof text === "string" && text.trim()) chat.sendMessage(text.trim());
    }}>
      <input name="q" disabled={chat.isLoading} />
      <button type="submit">Send</button>
    </form>
  );
}
```

`PilotChatContextValue` shape (from `context.ts` / `pilot-provider.tsx`
lines 434-445):

- `messages: UIMessage[]`
- `status: "idle" | "submitted" | "streaming" | "ready" | "error"`
- `error: Error | undefined`
- `isLoading: boolean` (derived: `status === "submitted" | "streaming"`)
- `sendMessage(text: string): Promise<void>`
- `stop(): void`

Render `messages` however the design calls for. The parts array is
documented in the AI SDK's `UIMessage` type. For tool parts, check
`part.type === "tool-<name>"` and `part.state === "output-available"`.

## Anti-Patterns

- `!important` overrides in a global stylesheet "because the sidebar's
  styles are too specific". The sidebar styles are low-specificity by
  design; if you need `!important`, you're probably targeting the wrong
  selector.
- Passing unstyled JSX into `greeting` that doesn't match the surrounding
  empty-state chrome. The `greeting` slot replaces the default empty
  text but keeps the parent `.pilot-empty` container.
- Building a custom UI that still renders `<PilotSidebar>` hidden via
  `display: none`. Two copies of the message list re-render on every
  token. Pick one UI.
- Forgetting to wrap the sidebar (bundled or custom) in a `<Pilot>`
  provider. The chat context is a tree context; no provider, no chat.

## Output Format

After customization, report:

- The CSS variables overridden (if any).
- The labels / position / width / suggestions overridden (if any).
- Whether the consumer kept `<PilotSidebar>` or built a custom UI from
  `PilotChatContext`.

## Tools Used

- Edit the consumer's global CSS to override `--pilot-*` variables.
- Edit the component that renders `<PilotSidebar>` to pass props.
- Read `packages/agentickit/src/components/pilot-sidebar.tsx` to verify
  the prop shape and available labels.
