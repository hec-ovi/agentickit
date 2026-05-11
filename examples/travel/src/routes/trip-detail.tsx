import { useMemo } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { BudgetBar } from "../components/budget-bar";
import { DestinationCover } from "../components/destination-cover";
import { WeatherStrip } from "../components/weather-strip";
import { CountdownChip } from "../components/countdown-chip";
import { tripSchema } from "../data/types";
import { findCity } from "../data/cities";
import { newItemId } from "../data/store";
import { useToast } from "../lib/toast";
import { fmtDateMedium, fmtDuration } from "../lib/format";

export function TripDetailRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const { getTrip, upsertTrip, preferences } = useShell();
  const trip = tripId ? getTrip(tripId) : undefined;
  const toast = useToast();
  const navigate = useNavigate();

  const spent = useMemo(() => {
    if (!trip) return 0;
    return (
      trip.flights.filter((f) => f.booked).reduce((s, f) => s + f.price, 0) +
      trip.hotels.filter((h) => h.booked).reduce((s, h) => s + h.pricePerNight * h.nights, 0)
    );
  }, [trip]);

  // Page-scoped state: the active trip. Description is the prompt-line
  // that gives the model context about what it's looking at. Only mounted
  // while the user is on a trip page, so off-page chats don't see this.
  usePilotState({
    name: "active_trip",
    description: trip
      ? `The user is viewing trip "${trip.title}" (${trip.destination}, ${trip.startDate} to ${trip.endDate}, ${trip.travelers} travelers, status: ${trip.status}). Use this trip's id when calling trip-scoped tools.`
      : "No active trip.",
    value: trip ?? null,
    schema: tripSchema.nullable(),
  });

  usePilotAction({
    name: "rename_trip",
    description: "Rename the active trip.",
    parameters: z.object({ title: z.string().min(1).max(120) }),
    handler: ({ title }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({ ...trip, title });
      toast.push({ tone: "info", title: "Trip renamed", message: title });
      return { ok: true };
    },
    mutating: true,
  });

  usePilotAction({
    name: "set_trip_status",
    description: "Mark the active trip as draft, planned, or booked.",
    parameters: z.object({ status: z.enum(["draft", "planned", "booked"]) }),
    handler: ({ status }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({ ...trip, status });
      toast.push({
        tone: status === "booked" ? "success" : "info",
        title: `Status: ${status}`,
      });
      return { ok: true };
    },
    mutating: true,
  });

  if (!trip) {
    return (
      <>
        <header className="hero">
          <h1 className="page-title">Trip not found</h1>
          <p className="page-subtitle">
            That trip id does not match anything in your saved list. It may have been deleted, or
            the URL is from a different browser session.
          </p>
        </header>
        <div className="row">
          <Link to="/" className="btn primary">
            Back to dashboard
          </Link>
        </div>
      </>
    );
  }

  const days =
    Math.round(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000,
    ) + 1;

  return (
    <>
      <header className="hero">
        <div className="row space-between">
          <h1 className="page-title">{trip.title}</h1>
          <div className="row" style={{ gap: 8 }}>
            <CountdownChip startDate={trip.startDate} endDate={trip.endDate} />
            <span
              className={`badge ${
                trip.status === "booked" ? "success" : trip.status === "planned" ? "accent" : ""
              }`}
            >
              {trip.status}
            </span>
          </div>
        </div>
        <p className="page-subtitle">
          {trip.destination} · {fmtDateMedium(trip.startDate)} to {fmtDateMedium(trip.endDate)} · {days} days ·{" "}
          {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
        </p>
      </header>

      <div className="sticky-tabs">
      <nav className="tabs" role="tablist" aria-label="Trip sections">
        <NavLink to={`/trips/${trip.id}`} end>
          {({ isActive }) => (
            <span className={isActive ? "active" : ""}>Overview</span>
          )}
        </NavLink>
        <NavLink to={`/trips/${trip.id}/itinerary`}>
          {({ isActive }) => (
            <span className={isActive ? "active" : ""}>Itinerary</span>
          )}
        </NavLink>
        <NavLink to={`/trips/${trip.id}/packing`}>
          {({ isActive }) => (
            <span className={isActive ? "active" : ""}>Packing</span>
          )}
        </NavLink>
        <NavLink to={`/trips/${trip.id}/book`}>
          {({ isActive }) => (
            <span className={isActive ? "active" : ""}>Booking</span>
          )}
        </NavLink>
      </nav>
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden", gap: 0 }}>
        <div style={{ height: 132 }}>
          <DestinationCover
            destination={trip.destination}
            ariaLabel={`${trip.destination} hero`}
            showLabel
          />
        </div>
        <div style={{ padding: 16 }}>
          <h2 className="card-title">Forecast for {trip.destination.split(",")[0]?.trim()}</h2>
          <p className="muted" style={{ margin: "4px 0 12px" }}>
            7-day outlook from <code>/api/weather</code> via the <code>get_weather</code>{" "}
            plugin. Source switches to live OpenWeather data when the env key is set.
          </p>
          <WeatherStrip
            city={trip.destination.split(",")[0]?.trim() ?? trip.destination}
            startDate={trip.startDate}
            days={7}
          />
        </div>
      </section>

      <div className="grid cols-2">
        <div className="card">
          <h2 className="card-title">Budget</h2>
          <BudgetBar total={trip.budgetTotal} spent={spent} currency={preferences.currency} />
          <p className="subtle">
            {spent === 0
              ? "Nothing booked yet. Open the Booking tab to lock things in."
              : `${Math.round((spent / trip.budgetTotal) * 100)}% of your budget is committed.`}
          </p>
        </div>

        <div className="card">
          <h2 className="card-title">Quick actions</h2>
          <p className="muted">
            Ask the assistant to search flights, propose hotels, or fill out the day plan. The
            sidebar opens from the bottom-right.
          </p>
          <div className="row wrap">
            <Link className="btn compact" to={`/trips/${trip.id}/itinerary`}>
              Open itinerary
            </Link>
            <Link className="btn compact" to={`/trips/${trip.id}/packing`}>
              Open packing
            </Link>
            <Link className="btn compact primary" to={`/trips/${trip.id}/book`}>
              Review booking
            </Link>
          </div>
        </div>
      </div>

      <TopPicks
        tripId={trip.id}
        destination={trip.destination}
        startDate={trip.startDate}
        onAdd={(activity) => {
          upsertTrip({
            ...trip,
            itinerary: [
              {
                date: trip.startDate,
                items: [
                  ...(trip.itinerary[0]?.items ?? []),
                  {
                    id: newItemId("i"),
                    time: "10:00",
                    title: activity.name,
                    kind: "activity",
                  },
                ],
              },
              ...trip.itinerary.slice(1),
            ],
          });
          toast.push({
            tone: "success",
            title: "Added to itinerary",
            message: `${activity.name} on ${trip.startDate}`,
          });
        }}
        onOpenItinerary={() => navigate(`/trips/${trip.id}/itinerary`)}
      />
    </>
  );
}

interface TopPicksProps {
  tripId: string;
  destination: string;
  startDate: string;
  onAdd: (activity: { name: string; durationMin: number; cost: number; category: string }) => void;
  onOpenItinerary: () => void;
}

function TopPicks({ destination, onAdd, onOpenItinerary }: TopPicksProps) {
  const cityName = destination.split(",")[0]?.trim() ?? destination;
  const city = findCity(cityName);

  if (!city) {
    return (
      <div className="card">
        <h2 className="card-title">Top picks</h2>
        <p className="muted" style={{ margin: 0 }}>
          No catalog entry for {destination}. Ask the assistant: "suggest 5 activities in{" "}
          {cityName}".
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row space-between">
        <h2 className="card-title">Top picks in {cityName}</h2>
        <button type="button" className="btn ghost compact" onClick={onOpenItinerary}>
          Plan day by day
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Pulled from the local destination catalog. Click "+ Add" to drop one onto day one of the
        itinerary, or ask the assistant to "fill day 2 with food and culture activities".
      </p>
      <div className="picks-grid">
        {city.activities.slice(0, 6).map((activity) => (
          <article key={activity.name} className="pick-card">
            <div className="row space-between">
              <strong>{activity.name}</strong>
              <span className={`badge category-${activity.category}`}>{activity.category}</span>
            </div>
            <div className="card-meta">
              <span>{fmtDuration(activity.durationMin)}</span>
              <span>·</span>
              <span>{activity.cost === 0 ? "free" : `$${activity.cost}`}</span>
            </div>
            <button
              type="button"
              className="btn compact"
              onClick={() => onAdd(activity)}
              aria-label={`Add ${activity.name} to itinerary`}
            >
              + Add
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
