---
name: chart
version: 1.0.0
description: |
  Spawn or dismiss an inline chart panel. The panel is hidden by default
  and renders only when the agent calls `show_chart`. Once visible,
  re-calling `show_chart` updates its type and source. `hide_chart`
  removes it. The panel mounts inline in the chat thread (not as a
  separate dialog) so it stays in the conversation context.
triggers:
  - "show me stats"
  - "show a chart"
  - "visualize"
  - "breakdown"
  - "give me a graph"
  - "close the chart"
  - "hide the chart"
  - "remove the chart"
  - "I'm done with it"
tools:
  - show_chart
  - hide_chart
mutating: false
---

# When to use

Call `show_chart` when:

- The user asks to SEE something visual ("show me", "graph", "chart", "visualize", "breakdown").
- A numeric or categorical answer would be clearer as a chart than as prose (3+ data points, comparisons across categories, time series).
- The user asks for a summary that has natural axes (over time, by category, by region).

Call `hide_chart` when:

- The user signals they're done with the chart ("close that", "hide it", "remove the chart", "I'm done").
- The user explicitly asks to clear the visualization.

Do NOT call either when:

- The answer is one or two numbers (just say them).
- The user asked a yes/no or text-only question.
- A chart is already visible AND the new request matches it (read state first; don't re-spawn what's already there).

# How to use

1. Read the chart's current state from the registered context (the chart's visibility and current type/source are exposed). If a chart is already visible and the user wants the SAME view, do nothing extra. If they want a DIFFERENT view, call `show_chart` again with the new `type` / `source`.
2. Call `show_chart({ type, source? })`. `type` picks the visualization (`bar`, `line`, `pie`, `table`); `source` names the data slice if your app exposes more than one.
3. Narrate WHAT the chart shows in one short sentence (do not list every data point; the user can read the chart).
4. If the user signals done, call `hide_chart()`.

# Anti-patterns

- Do NOT spawn a chart for a one-number answer ("revenue last quarter was $1.2M" is prose, not a chart).
- Do NOT re-spawn a chart that is already visible with the same parameters.
- Do NOT describe every data point in prose after spawning the chart. The chart IS the description.
- Do NOT leave a chart visible across unrelated topics. If the conversation moves on, call `hide_chart`.
