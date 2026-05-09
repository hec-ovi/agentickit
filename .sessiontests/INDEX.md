# Session-tests index

Dispatcher table for manual-testing findings. Same spirit as research-skill INDEX.md: scan the one-liner column to decide which category file to load. Don't load all categories at once.

Loading hierarchy:
1. This INDEX (always).
2. Category FINDINGS.md when a one-liner matches.
3. A specific finding's body when the FINDINGS heading matches.
4. Linked code path / commit when verifying a fix.

Keep each finding self-contained. Cross-reference by category-slug + heading, not by line number.

| Category | Path | Last updated | One-liner |
| --- | --- | --- | --- |
| ui-ux | [ui-ux/FINDINGS.md](ui-ux/FINDINGS.md) | 2026-05-07 | PilotPopup + PilotSidebar toggle collision; visual + interaction friction across the four chat surfaces. |
| performance | [performance/FINDINGS.md](performance/FINDINGS.md) | 2026-05-07 | Render thrash, network waterfalls, token waste, memo gaps, large-history slowdowns. |
| bugs | [bugs/FINDINGS.md](bugs/FINDINGS.md) | 2026-05-07 | Functional regressions and broken paths discovered while exercising the docs. |
| dx | [dx/FINDINGS.md](dx/FINDINGS.md) | 2026-05-07 | Developer-experience friction: confusing APIs, missing types, footguns, error messages. |
| a11y | [a11y/FINDINGS.md](a11y/FINDINGS.md) | 2026-05-07 | Roles, labels, focus management, screen-reader and keyboard-only paths. |
| docs-mismatch | [docs-mismatch/FINDINGS.md](docs-mismatch/FINDINGS.md) | 2026-05-07 | Places where docs/ contradicts the actual codebase behavior. |

Other entries:
- [TEST-PLAN.md](TEST-PLAN.md): the manual walkthrough keyed to docs/, with edge cases per page.
- [FEATURES.md](FEATURES.md): running list of features to build, ranked.

## How to log a finding

1. Pick the right category (a finding can fit two; pick the dominant axis).
2. Open that category's FINDINGS.md, append a `### <short-title>` block with the schema below.
3. Update this INDEX's `Last updated` cell for the category if it was a meaningful add.

Schema for a single finding (paste at the bottom of the relevant FINDINGS.md):

```markdown
### <short title>

- Severity: minor | major | blocker
- Surface: <doc page or component path>
- Repro: <one-line steps>
- Observed: <what happened>
- Expected: <what should happen>
- Notes: <hypothesis, screenshot path, related finding>
- Status: open | fixed-in-<sha> | wontfix
```

Severity guide: blocker = breaks a documented path, major = visible flaw a user would hit, minor = polish or rare edge.
