---
category: docs-mismatch
created: 2026-05-07
last_updated: 2026-05-07
---

# Docs mismatch

Places where `docs/` says one thing but the code does another. Each finding here implies an action: either fix the doc, fix the code, or note a deliberate divergence with rationale.

When logging:
- Quote the exact doc sentence.
- Quote the actual behavior (or paste the relevant code path).
- Recommend which side moves: doc, code, or both.

## Findings

### Per-page system instructions: no first-class API

- Severity: minor
- Surface: `docs/hooks.md` (the doc is correct: only three hooks exist), framework gap
- Repro: While planning the travel example, looked for a way to attach extra system-prompt text per page (e.g. "on packing page, focus on packing"). No `usePilotInstructions` / `usePilotAdditionalInstructions` hook exists.
- Observed: The only mechanisms are: server-static `.pilot/instructions/*.md`, server-static `createPilotHandler({ system })`, or per-request client `body.system`. None of them are React-y per-page primitives.
- Expected: A small hook like `usePilotInstructions("on packing page, focus on packing")` that contributes to `body.system` while the component is mounted and tears down on unmount. Or a `system` prop on `<Pilot>` / chat surfaces.
- Notes: The current pattern (lean on `usePilotState`/`usePilotAction` descriptions to convey context) works and is documented implicitly, but newcomers will look for a dedicated knob. Consider adding to FEATURES.md as a P2 idea.
- Status: open
