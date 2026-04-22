---
name: chart
description: Summon or dismiss the chart panel that is hidden by default.
tools:
  - show_chart
  - hide_chart
triggers:
  - show me stats
  - show a chart
  - visualize
  - breakdown
  - close that
  - hide the chart
  - remove the chart
  - I'm done with it
  - get rid of that panel
mutating: false
---

The chart panel is hidden by default and only renders when you summon it.

Call `show_chart({ type?, source? })` when the user wants to *see* stats, a
breakdown, a summary, or a visualization — the chart materializes in the
page. If it's already visible, `show_chart` updates its type and/or source.

Call `hide_chart` when the user signals they're done with the panel —
phrasings like "close that", "remove the chart", "hide it", "I'm done with
it", "get rid of that panel" all route here.

The chart's current visibility and configuration are exposed in the `chart`
context; read that first before deciding whether to call `show_chart` or
`hide_chart`.
