---
category: ui-ux
created: 2026-05-07
last_updated: 2026-05-07
---

# UI / UX findings

Visual layout, interaction patterns, keyboard handling, theming friction, copy and microcopy. Anything a user sees or feels but is not strictly broken.

If a finding is also functionally wrong, mirror it in `bugs/` and link both ways.

## Findings

### Pilot CSS overrides lose to package's `:root` defaults

- Severity: major
- Surface: `packages/agentickit/src/components/pilot-sidebar-styles.ts` (PILOT_SIDEBAR_CSS injected on first mount), affects every `--pilot-*` token
- Repro: Set host theme tokens via `:root, [data-theme="light"] { --pilot-accent: var(--accent) }` in your stylesheet. Pilot's own `:root { --pilot-accent: #0a0a0a }` is injected AFTER, with equal specificity, so it wins.
- Observed: Sidebar pill stays at the package's hard-coded color regardless of host theme. Manual host dark-mode toggle does not change the pill (Pilot's dark variant is keyed off `@media (prefers-color-scheme: dark)`, not host state).
- Expected: Host theme overrides should win without consumers needing specificity tricks.
- Fix on the framework side: wrap the package's defaults in `:where(:root)` (specificity 0) so any host rule beats them. The dark variant should also accept a host-controlled signal (e.g., `:where(:root)[data-pilot-theme="dark"]` next to the existing media query).
- Workaround in this example: bump host overrides to `:root[data-theme="light"]` / `:root[data-theme="dark"]` (specificity 0,0,2,0 vs Pilot's 0,0,1,0). Defined for both light and dark variants so manual choice is honored. See `examples/travel/src/styles.css`.
- Status: workaround in example; framework fix open

### `<PilotPopup>` and `<PilotSidebar>` toggles collide at the same corner

- Severity: minor
- Surface: `examples/travel/src/routes/trip-detail.tsx` (destination card popup) + global `<PilotSidebar>` in `src/app.tsx`
- Repro: Open `/trips/:id`. The sidebar pill ("agentickit travel") and the destination popup circle both pin to bottom-right via `position: fixed`, so the small popup circle stacks on/under the sidebar pill.
- Observed: Two launchers visually overlap at the same viewport corner.
- Expected: Either documented guidance ("don't render both at once"), or `<PilotPopup>` auto-offsets when a `<PilotSidebar>` toggle is mounted, or the popup defaults to a different corner.
- Notes: Worked around by setting `position="bottom-left"` on the per-destination popup. Underlying issue is `<PilotPopup>` is designed as a single page-level floater, not as a per-card launcher; using it for card-scoped chat is misleading.
- Status: workaround applied, root cause open

