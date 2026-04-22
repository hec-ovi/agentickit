import { useEffect, useState } from "react";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { z } from "zod";

const DENSITY_VALUES = ["compact", "comfortable", "roomy"] as const;
type Density = (typeof DENSITY_VALUES)[number];

const ACCENT_PRESETS = [
  { id: "slate", label: "Slate", color: "#3f3f46" },
  { id: "indigo", label: "Indigo", color: "#4338ca" },
  { id: "emerald", label: "Emerald", color: "#047857" },
  { id: "rose", label: "Rose", color: "#be123c" },
] as const;

type Accent = (typeof ACCENT_PRESETS)[number]["id"];

interface Preferences {
  accent: Accent;
  density: Density;
}

const DEFAULTS: Preferences = { accent: "slate", density: "comfortable" };

const preferencesSchema = z.object({
  accent: z.enum(ACCENT_PRESETS.map((p) => p.id) as [string, ...string[]]),
  density: z.enum(DENSITY_VALUES),
});

export function PreferencesWidget() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  // Push the accent into the CSS variable that the package reads.
  useEffect(() => {
    const color = ACCENT_PRESETS.find((p) => p.id === prefs.accent)?.color ?? DEFAULTS.accent;
    document.documentElement.style.setProperty("--pilot-accent", color);
    document.documentElement.style.setProperty("--accent", color);
  }, [prefs.accent]);

  usePilotState({
    name: "preferences",
    description:
      "User UI preferences. `accent` is one of slate, indigo, emerald, rose; " +
      "`density` is one of compact, comfortable, roomy.",
    value: prefs,
    schema: preferencesSchema as unknown as z.ZodType<Preferences>,
    setValue: (next) => setPrefs(next),
  });

  usePilotAction({
    name: "reset_preferences",
    description: "Reset all UI preferences to their defaults.",
    parameters: z.object({}).strict(),
    handler: () => {
      setPrefs(DEFAULTS);
      return { ok: true };
    },
    mutating: true,
  });

  return (
    <div className="panel">
      <h2>Preferences</h2>
      <div className="preferences">
        <div className="row">
          <label htmlFor="accent-row">Accent</label>
          <div id="accent-row" className="row" style={{ gap: 8 }}>
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.label}
                aria-pressed={prefs.accent === p.id}
                className={`swatch ${prefs.accent === p.id ? "active" : ""}`}
                style={{ background: p.color }}
                onClick={() => setPrefs((prev) => ({ ...prev, accent: p.id }))}
              />
            ))}
          </div>
        </div>
        <div className="row">
          <label htmlFor="density-row">Density</label>
          <div id="density-row" className="row" style={{ gap: 8 }}>
            {DENSITY_VALUES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={prefs.density === d}
                className={prefs.density === d ? "primary" : "secondary"}
                onClick={() => setPrefs((prev) => ({ ...prev, density: d }))}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="row space-between">
        <span className="caption" style={{ margin: 0 }}>
          `update_preferences` is auto-registered; `reset_preferences` is
          `mutating: true`, so the copilot will ask before it fires.
        </span>
        <span className="badge">tools: update_preferences · reset_preferences</span>
      </div>
    </div>
  );
}
