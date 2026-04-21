"use client";

/**
 * StatsPanel — a single card that renders todo statistics as bar/pie/line.
 *
 * The chart config (`{ type, source }`) lives in the app context so a sibling
 * `usePilotAction("update_chart")` at the page scope can mutate it. This panel
 * derives its series synchronously from the current `todos` array.
 *
 * Recharts note: we picked recharts because it tree-shakes (Bar/Line/Pie all
 * live in separate entry points), has zero canvas fiddliness in React 19, and
 * is ~40 kB gzipped. Chart.js would have required `react-chartjs-2` on top of
 * Chart.js itself, and its `ref`-based imperative model is awkward in a
 * server-components world.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartSource,
  type ChartType,
  useAppContext,
} from "../app-context";
import { priorityValues, type Todo } from "../todo-types";

interface SeriesDatum {
  name: string;
  value: number;
  color: string;
}

/**
 * Colors chosen to read in both light and dark modes. We avoid saturated
 * primaries because they clash with the Linear/Arc aesthetic we're after.
 */
const STATUS_COLORS = {
  done: "var(--chart-green)",
  pending: "var(--chart-gray)",
} as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--chart-blue)",
  medium: "var(--chart-gray)",
  high: "var(--chart-amber)",
  urgent: "var(--chart-red)",
};

function buildSeries(
  todos: ReadonlyArray<Todo>,
  source: ChartSource,
): ReadonlyArray<SeriesDatum> {
  if (source === "status") {
    const done = todos.filter((t) => t.done).length;
    const pending = todos.length - done;
    return [
      { name: "Done", value: done, color: STATUS_COLORS.done },
      { name: "Pending", value: pending, color: STATUS_COLORS.pending },
    ];
  }

  // "priority" source — count each priority bucket (fall back to "medium"
  // when a todo predates the enriched schema).
  const counts: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };
  for (const t of todos) {
    const p = t.priority ?? "medium";
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return priorityValues.map((p) => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    value: counts[p] ?? 0,
    color: PRIORITY_COLORS[p] ?? "var(--chart-gray)",
  }));
}

export function StatsPanel() {
  const { todos, chart, setChart, flashChart } = useAppContext();
  const series = useMemo(
    () => buildSeries(todos, chart.source),
    [todos, chart.source],
  );

  // Apply a CSS class for the soft pulse when `flashChart` ticks upward.
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (flashChart === 0 || !cardRef.current) return;
    const node = cardRef.current;
    // Restart the animation reliably by removing and re-adding the class
    // across an rAF tick; otherwise a second flash in <300 ms wouldn't replay.
    node.classList.remove("is-flashing");
    // Force reflow so the class toggle actually restarts the animation.
    void node.offsetWidth;
    node.classList.add("is-flashing");
    const t = window.setTimeout(
      () => node.classList.remove("is-flashing"),
      320,
    );
    return () => window.clearTimeout(t);
  }, [flashChart]);

  const totalForSource = series.reduce((acc, s) => acc + s.value, 0);

  return (
    <section
      ref={cardRef}
      className="panel stats-panel"
      aria-label="Todo statistics"
    >
      <header className="panel-header">
        <div>
          <h2 className="panel-title">Stats</h2>
          <p className="panel-sub">
            {chart.source === "status"
              ? "Progress by completion state"
              : "Distribution by priority"}
          </p>
        </div>
        <div className="stats-controls">
          <div
            className="seg"
            role="radiogroup"
            aria-label="Chart data source"
          >
            {(["status", "priority"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={chart.source === s}
                className={`seg-btn${chart.source === s ? " is-active" : ""}`}
                onClick={() => setChart({ source: s })}
              >
                {s === "status" ? "Status" : "Priority"}
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Chart type">
            {(
              [
                { t: "bar" as const, label: "Bar" },
                { t: "pie" as const, label: "Pie" },
                { t: "line" as const, label: "Line" },
              ] satisfies ReadonlyArray<{ t: ChartType; label: string }>
            ).map(({ t, label }) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={chart.type === t}
                className={`seg-btn${chart.type === t ? " is-active" : ""}`}
                onClick={() => setChart({ type: t })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="stats-chart-wrap" aria-hidden={totalForSource === 0}>
        {totalForSource === 0 ? (
          <p className="stats-empty">No data to chart yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "bar" ? (
              <BarChart
                data={[...series]}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent-soft)" }}
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {series.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : chart.type === "pie" ? (
              <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Pie
                  data={[...series]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="var(--bg-elevated)"
                  strokeWidth={2}
                >
                  {series.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <LineChart
                data={[...series]}
                margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-blue)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--chart-blue)", strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <footer className="stats-legend">
        {series.map((d) => (
          <span key={d.name} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: d.color }}
              aria-hidden="true"
            />
            <span>{d.name}</span>
            <span className="legend-value">{d.value}</span>
          </span>
        ))}
      </footer>
    </section>
  );
}
