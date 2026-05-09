---
category: a11y
created: 2026-05-07
last_updated: 2026-05-07
---

# Accessibility findings

Roles, accessible names, focus management, keyboard-only paths, screen reader behavior, color contrast, motion preferences, reduced-motion respect.

Quick checks during manual testing:
- Tab through every surface (sidebar, popup, modal, confirm). Focus must be visible and trapped where appropriate.
- Esc closes modals.
- VoiceOver (Mac) or NVDA (Windows): each interactive element announces a meaningful name.
- `prefers-reduced-motion`: animations honor it.
- Contrast: WCAG AA at minimum for text against bubble backgrounds.

## Findings

(none yet; append as `### <title>` blocks using the schema in `../INDEX.md`)
