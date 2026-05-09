---
category: dx
created: 2026-05-07
last_updated: 2026-05-07
---

# Developer experience findings

Confusing APIs, missing or wrong types, footguns, unhelpful error messages, awkward setup, peer-dep surprises, inconsistent naming.

Useful framing when logging:
- "I expected X based on the docs / type signature. I got Y."
- "I burned N minutes on this." (calibrates severity)
- For type or signature issues, paste the offending snippet.

## Findings

### `usePilotAction` requires `handler` even when `renderAndWait` is set

- Severity: minor
- Surface: `packages/agentickit/src/hooks/use-pilot-action.ts` `UsePilotActionOptions`
- Repro: Build a renderAndWait-only action without a handler. TypeScript errors with "Property 'handler' is missing".
- Observed: The hook docstring says "renderAndWait replaces handler at dispatch time" but the type union still requires handler, so consumers must provide a no-op fallback (e.g. `handler: () => ({ ok: false, reason: "..." })`). On top of that, the inferred result type from the handler narrows what `respond(...)` can pass back, forcing an explicit return-type annotation on the no-op or a unified result-shape type.
- Expected: Either an `XOR<{handler}, {renderAndWait}>` union so handler becomes optional when renderAndWait is set, or an explicit overload. Failing that, document the handler-as-fallback pattern in `docs/hitl-and-confirm.md` so newcomers don't trip.
- Notes: Worked around in `examples/travel/src/routes/itinerary.tsx` by giving the no-op handler an explicit `: { ok: boolean; reason?: string; picked?: string }` annotation so respond can return the wider shape.
- Status: open

