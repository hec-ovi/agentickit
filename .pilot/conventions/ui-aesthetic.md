# UI aesthetic — the "not a chatbot" rule

Read this before touching ANY visual component in this repo. The bar here
is higher than usual. This is the user-facing surface of the package; if
it reads as "generic chatbot" we lose the differentiation that makes
`agentickit` worth picking over ten other libraries.

## Core position

This is an **agent interface**, not a chatbot. That distinction lives in
the visuals before it lives in the code. A chatbot is passive: it sits in
a corner and waits for you to type. An agent is present: it moves through
the app, shows you what it's about to do, pulses when it touches state,
and leaves visible traces of its work.

## Non-negotiables

1. **No speech bubbles in the page body.** The `<PilotSidebar>` is the only
   place chat-shaped UI appears. Anywhere else, agent actions show up as
   state changes, form fills, chart updates, widget insertions. Never as
   a character balloon.
2. **No avatars, no personas, no "Hi, I'm Pilot!".** The greeting label
   in the sidebar is intentionally terse. Do not add mascot imagery,
   robot icons, or anthropomorphizing copy.
3. **No emojis in UI chrome.** Emojis belong in text messages authored by
   the user or the model, not in labels, buttons, or status indicators.
4. **No Clippy animations.** No bouncy springs, no wobble, no bounce-in.
   Ease-outs up to 300ms, subtle accent pulses, tasteful fades. Linear,
   Vercel, Arc, Raycast — that family.
5. **Visible agent activity.** When the agent touches something, the
   user should notice without being yelled at. A brief ring pulse, a
   transient "new" label, a field highlight that fades. Earned, not
   spammed.

## Reference: `/home/hector/workspace/rebel-forge-frontend/frontend/`

Before writing a new widget or animation, read the equivalent shape in
the Rebel Forge frontend. That repo has been through several passes of
visual polish on tooling-adjacent UI (panels, inline actions, state
indicators, chart widgets, subtle motion). **We do not copy its code** —
that's a different project with its own design system. We study the
decisions:

- How does it separate "you did that" from "the agent did that"?
- What's the motion vocabulary? How long, which easing, which properties?
- Where do status indicators live? Badges, dots, rings, gradients?
- How are ambient elements (sidebars, inspector strips, toolbars) set
  off from primary content?

Take those answers and build our own primitives in that spirit. Similar
taste, original code.

## Positive patterns (what to build)

- **Soft accent rings** on panels the agent just mutated. 300ms ease-out,
  fade to nothing. `var(--pilot-accent)` at ~25% opacity is usually right.
- **Transient labels** ("new", "updated", "filling…") that appear next
  to state that just changed and auto-dismiss after 2–3 seconds.
- **Live-fill highlight** on form fields the agent is writing to. A
  background flash on the input during the `set_field` tool call, then
  settle.
- **Inline tool-call cards** inside chart/form panels that briefly show
  the call's intent ("updating chart to pie") before the real update
  lands. Optional for v0.1.
- **Dimmed previews** when an action is pending a confirm (`mutating:
  true`). The target element renders at ~50% opacity with a cursor-
  pointer ghost until the user approves.

## Negative patterns (what to avoid)

- Typing-indicator dots outside the sidebar.
- Speech-bubble tails pointing at random page elements.
- Full-screen loading overlays during agent work (use inline indicators).
- "Powered by AI ✨" badges. The product speaks for itself.
- Color schemes that scream "LLM app": neon purple gradients, matrix
  green, dark-slate-plus-pink tropes. Neutral tones with a single
  accent always read more premium.
- Non-semantic motion (bouncing buttons, wobble on hover, infinite loops
  anywhere). Motion should have a reason.

## Acceptance heuristic

Before shipping a visual change, ask: *"Would a senior Linear or Vercel
designer look at this and nod, or would they wince?"* If you're unsure,
err on the side of less motion, less color, and more whitespace. You
can always add later; stripping back is harder.

## When modifying UI

Every agent that touches visual code must:

1. Read this file first.
2. Visit the relevant subtree under `/home/hector/workspace/rebel-forge-frontend/frontend/`
   to study the pattern in context.
3. Produce original code — never copy.
4. Favor subtraction. If a new animation doesn't earn its keep in a
   7-day re-look, it shouldn't ship.
