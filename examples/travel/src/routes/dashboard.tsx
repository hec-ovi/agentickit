import { useMemo, useState } from "react";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { TripCard } from "../components/trip-card";
import { EmptyState } from "../components/empty-state";
import { NewTripWizard } from "../widgets/new-trip-wizard";
import { AnimatedCounter } from "../components/animated-counter";
import { fmtCurrency } from "../lib/format";

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function DashboardRoute() {
  const { trips, deleteTrip, preferences } = useShell();
  const [wizardOpen, setWizardOpen] = useState(false);

  const sortedTrips = useMemo(
    () =>
      [...trips].sort((a, b) => {
        const aPast = new Date(a.endDate).getTime() < Date.now();
        const bPast = new Date(b.endDate).getTime() < Date.now();
        if (aPast !== bPast) return aPast ? 1 : -1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }),
    [trips],
  );

  const next = useMemo(() => {
    const upcoming = sortedTrips.filter((t) => new Date(t.endDate).getTime() >= Date.now());
    return upcoming[0];
  }, [sortedTrips]);

  const totalBudget = useMemo(
    () => trips.reduce((sum, t) => sum + t.budgetTotal, 0),
    [trips],
  );

  // Expose the full trip list to the model as read-only state (no setter).
  // The model can read this on every turn and reason about which trip the
  // user is referring to.
  usePilotState({
    name: "trips_summary",
    description:
      "Summary of all saved trips. Each entry includes id, title, destination, dates, status. Use trip ids when calling delete_trip; reference trips by title or destination when conversing with the user.",
    value: trips.map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
    })),
    schema: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        destination: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        status: z.enum(["draft", "planned", "booked"]),
      }),
    ),
  });

  usePilotAction({
    name: "open_new_trip_wizard",
    description: "Open the new-trip wizard modal so the user (or you) can fill it in.",
    parameters: z.object({}).strict(),
    handler: () => {
      setWizardOpen(true);
      return { ok: true };
    },
  });

  usePilotAction({
    name: "delete_trip",
    description: "Permanently delete a saved trip by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      const exists = trips.some((t) => t.id === id);
      if (!exists) return { ok: false, reason: "no such trip" };
      deleteTrip(id);
      return { ok: true };
    },
    mutating: true,
  });

  return (
    <>
      <header className="hero hero-dashboard">
        <div className="hero-band">
          <h1 className="page-title hero-title">
            Where are we going<span className="hero-cursor" aria-hidden="true">|</span>
          </h1>
          <p className="page-subtitle">
            Plan, refine, and book trips with the assistant. Pop the chat at the bottom-right and
            ask it anything: "find flights to Lisbon for next month", "what should I pack for
            Reykjavik in November", "convert my budget to JPY".
          </p>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button type="button" className="btn primary" onClick={() => setWizardOpen(true)}>
              New trip
            </button>
            <a className="btn ghost" href="#saved-trips">
              Browse saved trips
            </a>
          </div>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="label">Upcoming</span>
          <span className="value">
            <AnimatedCounter
              value={trips.filter((t) => new Date(t.endDate).getTime() >= Date.now()).length}
            />
          </span>
        </div>
        <div className="stat">
          <span className="label">Total budget</span>
          <span className="value">
            <AnimatedCounter
              value={totalBudget}
              format={(n) => fmtCurrency(n, preferences.currency)}
            />
          </span>
        </div>
        <div className="stat">
          <span className="label">{next ? "Days until next trip" : "Next trip"}</span>
          <span className="value">
            {next ? <AnimatedCounter value={daysUntil(next.startDate)} /> : "..."}
          </span>
        </div>
      </div>

      <div className="section-bar" id="saved-trips">
        <h2 className="section-title">
          Saved trips
          <span className="section-count"> ({trips.length})</span>
        </h2>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          glyph="✈"
          title="No trips yet"
          description="Start one yourself, or ask the assistant: 'plan a 5-day trip to Tokyo for two travelers'."
          action={
            <button type="button" className="btn primary" onClick={() => setWizardOpen(true)}>
              New trip
            </button>
          }
        />
      ) : (
        <div className="grid cols-2">
          {sortedTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}

      <NewTripWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </>
  );
}
