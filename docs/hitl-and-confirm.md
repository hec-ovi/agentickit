# Human-in-the-loop

Two complementary primitives: the confirm modal (gate any mutating action) and `renderAndWait` (mount custom UI and pause until the user decides).

## Confirm modal: the easy case

Set `mutating: true` on a `usePilotAction`. The provider intercepts the call, mounts `<PilotConfirmModal>`, and waits.

```tsx
usePilotAction({
  name: "delete_account",
  description: "Permanently delete the user's account.",
  parameters: z.object({ confirm_phrase: z.string() }),
  handler: async ({ confirm_phrase }) => {
    if (confirm_phrase !== "DELETE") return { ok: false, reason: "Wrong phrase." };
    await api.deleteAccount();
    return { ok: true };
  },
  mutating: true,
});
```

What the user sees: a centered alertdialog showing the action name, description, and the AI-supplied arguments. Two buttons:

- **Confirm** runs your handler and feeds the return value back to the model.
- **Cancel** never calls your handler. The model receives `{ ok: false, reason: "User declined." }` so it can react conversationally instead of looping.

Keyboard: Escape cancels, Enter confirms (when focus isn't in a multi-line input). Tab cycles between the two buttons; focus restores to whatever was focused before the modal opened.

The modal portals to `document.body`, sits above any other surface, and is the same component regardless of which chat surface (sidebar/popup/modal/headless) you're using.

Source: [`packages/agentickit/src/components/pilot-confirm-modal.tsx`](../packages/agentickit/src/components/pilot-confirm-modal.tsx).

## Customizing the confirm modal

Override the rendered UI without losing the keyboard semantics:

```tsx
<Pilot
  apiUrl="/api/pilot"
  renderConfirm={({ name, description, input, approve, cancel }) => (
    <div className="my-modal">
      <h2>About to run {name}</h2>
      <p>{description}</p>
      <pre>{JSON.stringify(input, null, 2)}</pre>
      <button type="button" onClick={cancel}>No</button>
      <button type="button" onClick={approve}>Yes, do it</button>
    </div>
  )}
>
```

Required: call exactly one of `approve()` / `cancel()` per render-prop invocation. If your render swallows both, the model sits forever waiting for the tool result.

## renderAndWait: the powerful case

Sometimes "approve / cancel" isn't enough. You need to ask the user a question, render a custom form, show a preview, etc. `renderAndWait` replaces the action's `handler` with a render-prop UI that resolves with whatever value the user picks.

```tsx
usePilotAction({
  name: "ask_user_choice",
  description: "Ask the user to pick one of the proposed options.",
  parameters: z.object({
    question: z.string(),
    options: z.array(z.string()),
  }),
  renderAndWait: ({ input, respond, cancel }) => (
    <div className="hitl-card">
      <p>{input.question}</p>
      {input.options.map((opt) => (
        <button key={opt} type="button" onClick={() => respond({ choice: opt })}>
          {opt}
        </button>
      ))}
      <button type="button" onClick={() => cancel("user dismissed")}>Skip</button>
    </div>
  ),
});
```

### Anatomy

- `input` is the parsed, validated tool input (typed against `parameters`).
- `respond(value)` resolves the tool call with `value`. Whatever you pass becomes the tool result the model sees on its next turn.
- `cancel(reason?)` resolves with `{ ok: false, reason }` (default reason: `"User declined."`).
- The render prop renders **inside the chat surface**, between the assistant's message and any subsequent content. It unmounts after `respond` or `cancel` fires.

### Pitfalls

- **Destructure `input`, not `args`.** The signature is `({ input, respond, cancel }) => ReactNode`. `args` is undefined; `args.question` will throw at first render.
- Calling neither `respond` nor `cancel` leaves the tool call hanging forever (the model stays in "running" state). The runtime auto-cancels if the action unmounts mid-suspension; otherwise call one explicitly.
- Calling both is harmless; the second invocation is ignored. The resolver runs at most once.
- The component re-renders normally. Use refs if you need to keep state across re-renders without restarting the prompt.

### Combining with `mutating`

`renderAndWait` and `mutating` are independent. Set both for "show the confirm modal first, then mount the custom UI":

```tsx
usePilotAction({
  name: "compose_email",
  parameters: z.object({ to: z.string(), subject: z.string() }),
  mutating: true,
  renderAndWait: ({ input, respond, cancel }) => (
    /* preview UI */
  ),
});
```

The flow becomes: AI calls → confirm modal opens → user approves → render-prop UI mounts → user responds.

Source: [`packages/agentickit/src/hooks/use-pilot-action.ts`](../packages/agentickit/src/hooks/use-pilot-action.ts).

## Decision matrix

| Need | Use |
| --- | --- |
| Just gate a side-effect with "are you sure?" | `mutating: true` |
| Pick from a small set of choices | `renderAndWait` with buttons |
| Edit AI-proposed values before commit | `renderAndWait` with a form |
| Both: confirm AND custom prompt | `mutating: true` + `renderAndWait` |
| Two-step approval (e.g., manager + employee) | `renderAndWait` that internally renders two stages |

## Server-side awareness

The handler doesn't know about HITL. It just sees a tool result come back (whatever your `respond` / `cancel` produced). This is by design: the confirm modal and `renderAndWait` are pure client concerns; the model and server stay generic.
