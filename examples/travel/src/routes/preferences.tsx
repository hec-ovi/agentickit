import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { preferencesSchema, type Preferences } from "../data/types";
import { useToast } from "../lib/toast";

const CURRENCIES: Preferences["currency"][] = ["USD", "EUR", "GBP", "JPY"];
const DIETARIES = ["none", "vegetarian", "vegan", "gluten-free", "halal", "kosher"] as const;
const MOBILITY: Preferences["mobility"][] = ["high", "medium", "low"];

export function PreferencesRoute() {
  const { preferences, setPreferences, clearAll, restoreSeeds } = useShell();
  const toast = useToast();

  // Expose preferences to the model with a setter. Because setValue is
  // present, the provider auto-registers a mutating `update_preferences`
  // tool wired to setValue, gated by the confirm modal.
  usePilotState({
    name: "preferences",
    description:
      "Long-term traveler preferences (home airport, currency, dietary, mobility, language). " +
      "Persisted across trips. Use update_preferences to change them; the user must confirm.",
    value: preferences,
    schema: preferencesSchema,
    setValue: (next) => {
      setPreferences(next);
      toast.push({ tone: "info", title: "Preferences updated" });
    },
  });

  // The form is for the human user only; we deliberately do NOT register it
  // with usePilotForm here. usePilotForm's auto-registered `set_<name>_field`
  // is non-mutating and would let the model bypass the confirm modal that
  // gates `update_preferences`. On a sensitive page like preferences a
  // declined update must stick.
  const form = useForm<Preferences>({ defaultValues: preferences });

  useEffect(() => {
    form.reset(preferences);
  }, [preferences, form]);

  const onSubmit = (vals: Preferences) => {
    setPreferences(vals);
    toast.push({ tone: "success", title: "Saved" });
  };

  const watched = form.watch();

  return (
    <>
      <header className="hero">
        <h1 className="page-title">Preferences</h1>
        <p className="page-subtitle">
          Long-term traveler context. The assistant can change these via{" "}
          <code>update_preferences</code> (mutating, gated by the confirm modal). The form below
          is for direct user editing.
        </p>
      </header>

      <form className="card stack" onSubmit={form.handleSubmit(onSubmit)}>
        <section className="stack tight">
          <h2 className="card-title">Travel basics</h2>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="pf-airport">Home airport</label>
              <input
                id="pf-airport"
                type="text"
                placeholder="e.g. JFK, SFO, LHR"
                {...form.register("homeAirport", { required: true })}
              />
            </div>
            <div className="field">
              <label htmlFor="pf-language">Preferred language</label>
              <input
                id="pf-language"
                type="text"
                {...form.register("language", { required: true })}
              />
            </div>
          </div>
        </section>

        <section className="stack tight">
          <h2 className="card-title">Currency</h2>
          <div className="row wrap">
            {CURRENCIES.map((c) => (
              <label key={c} className={`pill-choice ${watched.currency === c ? "active" : ""}`}>
                <input
                  type="radio"
                  value={c}
                  {...form.register("currency", { required: true })}
                />
                {c}
              </label>
            ))}
          </div>
        </section>

        <section className="stack tight">
          <h2 className="card-title">Mobility</h2>
          <div className="row wrap">
            {MOBILITY.map((m) => (
              <label key={m} className={`pill-choice ${watched.mobility === m ? "active" : ""}`}>
                <input
                  type="radio"
                  value={m}
                  {...form.register("mobility", { required: true })}
                />
                {m === "high" ? "High (lots of walking)" : m === "medium" ? "Medium" : "Low (less walking)"}
              </label>
            ))}
          </div>
        </section>

        <section className="stack tight">
          <h2 className="card-title">Dietary requirements</h2>
          <div className="row wrap">
            {DIETARIES.map((opt) => (
              <label
                key={opt}
                className={`pill-choice ${
                  watched.dietary?.includes(opt) ? "active" : ""
                }`}
              >
                <input type="checkbox" value={opt} {...form.register("dietary")} />
                {opt}
              </label>
            ))}
          </div>
        </section>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn primary">
            Save preferences
          </button>
        </div>
      </form>

      <section className="card" aria-labelledby="reset-heading">
        <h2 className="card-title" id="reset-heading">Demo state</h2>
        <p className="muted" style={{ margin: 0 }}>
          Two ways to reset this browser's data. "Clear all" empties every trip
          and resets preferences to defaults. "Restore demo seeds" reloads the
          five sample trips so you can demo from a fresh state. Both actions
          are immediate; no undo.
        </p>
        <div className="row wrap" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              restoreSeeds();
              toast.push({
                tone: "info",
                title: "Demo seeds restored",
                message: "Five sample trips are back.",
              });
            }}
          >
            Restore demo seeds
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              const ok = window.confirm(
                "Empty all trips and reset preferences to defaults? This cannot be undone.",
              );
              if (!ok) return;
              clearAll();
              toast.push({
                tone: "success",
                title: "Cleared",
                message: "All trips removed; preferences back to defaults.",
              });
            }}
          >
            Clear all data
          </button>
        </div>
      </section>
    </>
  );
}
