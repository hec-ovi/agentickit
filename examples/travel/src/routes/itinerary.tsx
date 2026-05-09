import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { tripSchema } from "../data/types";
import { searchFlights, searchHotels } from "../data/mock-search";
import { newItemId } from "../data/store";
import { FlightOptionCard, HotelOptionCard } from "../components/option-cards";
import { EmptyState } from "../components/empty-state";

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function nightsBetween(a: string, b: string): number {
  return Math.max(
    1,
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000),
  );
}

export function ItineraryRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const { getTrip, upsertTrip, preferences } = useShell();
  const trip = tripId ? getTrip(tripId) : undefined;

  // Re-publish active trip so the model has context.
  usePilotState({
    name: "active_trip",
    description: trip
      ? `Active trip: "${trip.title}" (${trip.destination}, ${trip.startDate} to ${trip.endDate}). Use propose_flight/propose_hotel to surface options through the picker UI.`
      : "No active trip.",
    value: trip ?? null,
    schema: tripSchema.nullable(),
  });

  // propose_flight: renderAndWait shows 3 options; respond commits to trip.
  // The `handler` is required by the hook's TypeScript signature even though
  // renderAndWait replaces it at dispatch time. Provide a no-op fallback.
  usePilotAction({
    name: "propose_flight",
    description:
      "Search and surface 3 flight options through a picker UI. The user clicks one to commit it to the trip; cancel skips.",
    parameters: z.object({
      from: z.string().describe("origin airport code, e.g. SFO").default("SFO").optional(),
      to: z.string().describe("destination airport code, e.g. HND"),
      date: z.string().describe("YYYY-MM-DD"),
    }),
    handler: (): { ok: boolean; reason?: string; picked?: string } => ({
      ok: false,
      reason: "renderAndWait should have intercepted this call",
    }),
    renderAndWait: ({ input, respond, cancel }) => {
      const options = searchFlights({
        from: input.from || preferences.homeAirport,
        to: input.to,
        date: input.date,
      });
      return (
        <div className="picker">
          <p className="picker-title">Pick a flight</p>
          {options.map((flight) => (
            <FlightOptionCard
              key={flight.id}
              flight={flight}
              onPick={() => {
                if (!trip) {
                  respond({ ok: false, reason: "no active trip" });
                  return;
                }
                upsertTrip({
                  ...trip,
                  flights: [...trip.flights, { ...flight, booked: false }],
                });
                respond({ ok: true, picked: flight.id });
              }}
            />
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => cancel("user dismissed picker")}>
              Skip
            </button>
          </div>
        </div>
      );
    },
  });

  // propose_hotel: renderAndWait surface for hotel options.
  usePilotAction({
    name: "propose_hotel",
    description:
      "Search and surface 3 hotel options for a city through a picker UI. Same picker pattern as propose_flight.",
    parameters: z.object({
      city: z.string(),
    }),
    handler: (): { ok: boolean; reason?: string; picked?: string } => ({
      ok: false,
      reason: "renderAndWait should have intercepted this call",
    }),
    renderAndWait: ({ input, respond, cancel }) => {
      if (!trip) {
        respond({ ok: false, reason: "no active trip" });
        return null;
      }
      const nights = nightsBetween(trip.startDate, trip.endDate);
      const options = searchHotels({ city: input.city, nights });
      return (
        <div className="picker">
          <p className="picker-title">Pick a hotel</p>
          {options.map((hotel) => (
            <HotelOptionCard
              key={hotel.id}
              hotel={hotel}
              nights={nights}
              onPick={() => {
                upsertTrip({
                  ...trip,
                  hotels: [...trip.hotels, { ...hotel, booked: false, nights }],
                });
                respond({ ok: true, picked: hotel.id });
              }}
            />
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => cancel("user dismissed picker")}>
              Skip
            </button>
          </div>
        </div>
      );
    },
  });

  usePilotAction({
    name: "add_day_item",
    description:
      "Append an activity to one day of the itinerary. Use a 24h time string like '09:00'. Kind 'free' for unstructured time.",
    parameters: z.object({
      date: z.string(),
      time: z.string(),
      title: z.string(),
      kind: z.enum(["flight", "hotel", "activity", "free"]).default("activity").optional(),
    }),
    handler: ({ date, time, title, kind }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const idx = trip.itinerary.findIndex((d) => d.date === date);
      const item = { id: newItemId("i"), time, title, kind: kind ?? "activity" };
      const itinerary =
        idx === -1
          ? [...trip.itinerary, { date, items: [item] }].sort((a, b) =>
              a.date.localeCompare(b.date),
            )
          : trip.itinerary.map((d, i) =>
              i === idx ? { ...d, items: [...d.items, item].sort((a, b) => a.time.localeCompare(b.time)) } : d,
            );
      upsertTrip({ ...trip, itinerary });
      return { ok: true, id: item.id };
    },
  });

  usePilotAction({
    name: "remove_day_item",
    description: "Remove one itinerary item by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const itinerary = trip.itinerary.map((d) => ({
        ...d,
        items: d.items.filter((it) => it.id !== id),
      }));
      upsertTrip({ ...trip, itinerary });
      return { ok: true };
    },
    mutating: true,
  });

  const sortedDays = useMemo(() => {
    if (!trip) return [];
    return [...trip.itinerary].sort((a, b) => a.date.localeCompare(b.date));
  }, [trip]);

  if (!trip) {
    return (
      <>
        <header className="hero">
          <h1 className="page-title">Trip not found</h1>
        </header>
        <Link to="/" className="btn">
          Back to trips
        </Link>
      </>
    );
  }

  return (
    <>
      <header className="hero">
        <h1 className="page-title">Itinerary</h1>
        <p className="page-subtitle">
          Day by day for {trip.title}. Ask the assistant to "propose a flight from SFO to HND on{" "}
          {trip.startDate}" or "fill day 2 with food and culture activities".
        </p>
      </header>

      {sortedDays.length === 0 ? (
        <EmptyState
          glyph="🗓"
          title="No days yet"
          description="Try: 'fill day 2026-05-15 with three activities, mostly food and culture'."
        />
      ) : (
        <div className="stack">
          {sortedDays.map((day, index) => (
            <article
              key={day.date}
              className="day-card appearing"
              style={{ ["--delay" as string]: `${Math.min(index, 6) * 40}ms` }}
            >
              <div className="day-label">
                <span className="num">{new Date(day.date).getDate()}</span>
                <span className="month">
                  {new Date(day.date).toLocaleDateString(undefined, { month: "short" })}
                </span>
                <span className="subtle">{fmtDateLong(day.date).split(",")[0]}</span>
              </div>
              <ul>
                {day.items.length === 0 ? (
                  <li className="muted">No items yet. Ask the assistant to plan this day.</li>
                ) : (
                  day.items.map((item) => (
                    <li key={item.id} data-kind={item.kind}>
                      <span className="time">{item.time}</span>
                      <span>{item.title}</span>
                      <span className={`badge ${item.kind === "free" ? "" : "accent"}`}>
                        {item.kind}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          ))}
        </div>
      )}

      <div className="row">
        <Link className="btn" to={`/trips/${trip.id}`}>
          Back to overview
        </Link>
        <Link className="btn primary" to={`/trips/${trip.id}/book`}>
          Review booking
        </Link>
      </div>
    </>
  );
}
