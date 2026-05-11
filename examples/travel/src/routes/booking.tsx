import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { tripSchema } from "../data/types";
import { BudgetBar } from "../components/budget-bar";
import { EmptyState } from "../components/empty-state";
import { Confetti } from "../components/confetti";
import { fmtCurrency } from "../lib/format";
import { useTripBookingActions } from "../lib/use-trip-booking";

export function BookingRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const { getTrip, preferences } = useShell();
  const trip = tripId ? getTrip(tripId) : undefined;
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const fireConfetti = () => setConfettiTrigger((n) => n + 1);

  // Single source of truth for the three booking mutations. Both the AI
  // tool handlers below and the inline buttons further down call into
  // these helpers, so the two paths can never drift.
  const { bookFlight, bookHotel, bookAllPending } = useTripBookingActions(trip, {
    onAllBooked: fireConfetti,
  });

  // Snapshot for the model: what's bookable and what's already booked.
  // Description nudges the model toward the per-item book tools (mutating).
  usePilotState({
    name: "booking_review",
    description: trip
      ? `Booking review for trip "${trip.title}". Use book_flight / book_hotel for individual bookings (each is mutating and pops the confirm modal), or book_all_pending to confirm every pending item at once.`
      : "No active trip.",
    value: trip ?? null,
    schema: tripSchema.nullable(),
  });

  usePilotAction({
    name: "book_flight",
    description: "Lock in one previously proposed flight by id. The user must confirm.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => bookFlight(id),
    mutating: true,
  });

  usePilotAction({
    name: "book_hotel",
    description: "Lock in one previously proposed hotel by id. The user must confirm.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => bookHotel(id),
    mutating: true,
  });

  usePilotAction({
    name: "book_all_pending",
    description: "Book every pending flight and hotel in one go. The user must confirm.",
    parameters: z.object({}).strict(),
    handler: () => bookAllPending(),
    mutating: true,
  });

  const spent = useMemo(() => {
    if (!trip) return 0;
    return (
      trip.flights.filter((f) => f.booked).reduce((s, f) => s + f.price, 0) +
      trip.hotels.filter((h) => h.booked).reduce((s, h) => s + h.pricePerNight * h.nights, 0)
    );
  }, [trip]);

  if (!trip) {
    return (
      <>
        <header className="hero">
          <h1 className="page-title">Booking</h1>
        </header>
        <Link to="/" className="btn">
          Back to trips
        </Link>
      </>
    );
  }

  const allBooked =
    trip.flights.length > 0 &&
    trip.hotels.length > 0 &&
    trip.flights.every((f) => f.booked) &&
    trip.hotels.every((h) => h.booked);

  return (
    <>
      <header className="hero">
        <h1 className="page-title">Booking</h1>
        <p className="page-subtitle">
          {trip.title} · {trip.destination}. Each book action is mutating, so the assistant has to
          confirm with you before locking anything in.
        </p>
      </header>

      <section className="card">
        <h2 className="card-title">Budget so far</h2>
        <BudgetBar total={trip.budgetTotal} spent={spent} currency={preferences.currency} />
      </section>

      <section className="stack">
        <div className="row space-between">
          <h2 className="section-title">Flights</h2>
          <span className="badge">{trip.flights.length} proposed</span>
        </div>
        {trip.flights.length === 0 ? (
          <EmptyState
            glyph="✈"
            title="No flights yet"
            description="Open the itinerary and ask the assistant to propose a flight."
            action={
              <Link className="btn primary" to={`/trips/${trip.id}/itinerary`}>
                Open itinerary
              </Link>
            }
          />
        ) : (
          trip.flights.map((flight) => (
            <div key={flight.id} className={`booking-row ${flight.booked ? "booked" : ""}`}>
              <div className="desc">
                <span className="primary">
                  {flight.airline} {flight.from} → {flight.to}
                </span>
                <span className="secondary">
                  {flight.date} · depart {flight.departTime} ·{" "}
                  {flight.stops === 0 ? "nonstop" : `${flight.stops} stop`}
                </span>
              </div>
              <span className="badge">{fmtCurrency(flight.price, preferences.currency)}</span>
              <button
                type="button"
                className={`btn ${flight.booked ? "" : "primary"} compact`}
                disabled={flight.booked}
                onClick={() => bookFlight(flight.id)}
              >
                {flight.booked ? "Booked" : "Book"}
              </button>
            </div>
          ))
        )}
      </section>

      <section className="stack">
        <div className="row space-between">
          <h2 className="section-title">Hotels</h2>
          <span className="badge">{trip.hotels.length} proposed</span>
        </div>
        {trip.hotels.length === 0 ? (
          <EmptyState glyph="⌂" title="No hotels yet" />
        ) : (
          trip.hotels.map((hotel) => (
            <div key={hotel.id} className={`booking-row ${hotel.booked ? "booked" : ""}`}>
              <div className="desc">
                <span className="primary">{hotel.name}</span>
                <span className="secondary">
                  {hotel.nights} nights · ★ {hotel.rating.toFixed(1)} · {hotel.amenities.join(", ")}
                </span>
              </div>
              <span className="badge">
                {fmtCurrency(hotel.pricePerNight * hotel.nights, preferences.currency)}
              </span>
              <button
                type="button"
                className={`btn ${hotel.booked ? "" : "primary"} compact`}
                disabled={hotel.booked}
                onClick={() => bookHotel(hotel.id)}
              >
                {hotel.booked ? "Booked" : "Book"}
              </button>
            </div>
          ))
        )}
      </section>

      <div className="row" style={{ marginTop: 8 }}>
        <Link className="btn" to={`/trips/${trip.id}`}>
          Back to overview
        </Link>
        {allBooked ? (
          <span className="badge success">All booked</span>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => bookAllPending()}
            disabled={trip.flights.length === 0 || trip.hotels.length === 0}
          >
            Book all pending
          </button>
        )}
      </div>
      <Confetti trigger={confettiTrigger} />
    </>
  );
}
