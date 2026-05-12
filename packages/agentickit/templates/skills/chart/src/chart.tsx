/**
 * Chart skill — `show_chart` / `hide_chart` plugin.
 *
 * Drop this file into `src/plugins/chart.tsx` (the path the CLI maps it to
 * by default). Mount it under `<PilotPlugins>` and the agent will be able
 * to spawn the chart panel inline whenever the SKILL.md's triggers fire.
 *
 * The default panel below is a bare placeholder. Replace the `<ChartPanel>`
 * body with a real chart (Recharts, visx, ECharts — whatever your app
 * already uses). The skill contract only requires that:
 *   - `show_chart({ type, source? })` causes the panel to mount with that
 *     configuration;
 *   - `hide_chart()` removes it;
 *   - the panel's current visibility + config are exposed via
 *     `usePilotState` so the agent can read them before re-spawning.
 *
 * Replace `<replace this>` markers as you customize.
 */

import { useState } from "react";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";

const chartTypes = ["bar", "line", "pie", "table"] as const;
type ChartType = (typeof chartTypes)[number];

interface ChartConfig {
  type: ChartType;
  source: string | null;
}

export function ChartPlugin(): null {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ChartConfig>({ type: "bar", source: null });

  // Expose the chart's current visibility + config so the agent can read
  // before deciding whether to call show_chart vs do nothing.
  usePilotState({
    name: "chart_visibility",
    description: "Whether the chart panel is currently visible, and what type/source it is showing.",
    value: { visible, type: config.type, source: config.source },
    schema: z.object({
      visible: z.boolean(),
      type: z.enum(chartTypes),
      source: z.string().nullable(),
    }),
  });

  usePilotAction({
    name: "show_chart",
    description: "Spawn the chart panel inline, or update the visible chart's type/source. See the chart SKILL.md for when to use this.",
    parameters: z.object({
      type: z.enum(chartTypes).describe("Visualization type. bar | line | pie | table."),
      source: z
        .string()
        .optional()
        .describe("Optional data source identifier if your app exposes more than one slice."),
    }),
    handler: ({ type, source }) => {
      setConfig({ type, source: source ?? null });
      setVisible(true);
      return { ok: true, type, source: source ?? null };
    },
    mutating: false,
  });

  usePilotAction({
    name: "hide_chart",
    description: "Remove the chart panel from view. Call when the user signals they are done with it.",
    parameters: z.object({}),
    handler: () => {
      setVisible(false);
      return { ok: true };
    },
    mutating: false,
  });

  return null;
}

/**
 * Render the chart panel itself. Mount this somewhere in your layout where
 * an inline panel makes sense — typically near the chat surface or above
 * the page content. Reads visibility + config from the same React state
 * the plugin owns.
 */
export function ChartPanel(props: { config: ChartConfig; visible: boolean }): JSX.Element | null {
  if (!props.visible) return null;
  return (
    <div role="region" aria-label="Chart panel" data-chart-type={props.config.type}>
      {/* <replace this with a real chart component (Recharts, visx, ECharts, ...)>
          The chart should render data filtered by `props.config.source` (or all
          data if source is null), in the visualization style named by
          `props.config.type`. */}
      <p>Chart placeholder ({props.config.type})</p>
    </div>
  );
}
