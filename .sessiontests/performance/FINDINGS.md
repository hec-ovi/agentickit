---
category: performance
created: 2026-05-07
last_updated: 2026-05-07
---

# Performance findings

Render thrash, network waterfalls, token waste, memo gaps, large-history slowdowns, bundle-size regressions, hot-path allocations.

Quick instrumentation tips before logging:
- React Profiler (DevTools) for render counts and durations.
- Network tab for wire size and TTFB; `/tmp/vllm-trace.jsonl` for vLLM payloads.
- `usePilotPostCount()` (mock harness) catches loop-style regressions.
- Bundle: `pnpm --filter ./packages/agentickit build` then check `dist/` sizes against baseline.

## Findings

(none yet; append as `### <title>` blocks using the schema in `../INDEX.md`)
