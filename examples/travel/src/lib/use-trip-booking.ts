/**
 * Booking-mutation actions for a trip, shared between the AI tool handlers
 * (`book_flight`, `book_hotel`, `book_all_pending`) and the human button
 * onClicks on the booking page.
 *
 * Before this hook existed the route implemented every booking flow twice
 * (once inside `usePilotAction.handler`, once inline as the button's
 * `onClick`). The two copies drifted: the trip-detail "spent" reducer
 * counted activity costs while the booking-page reducer didn't, the AI
 * handler returned a `{ ok }` envelope but the button didn't, etc. This
 * hook makes both sides call the same functions so the only difference
 * between them is "AI invocation goes through the confirm modal".
 *
 * Returned actions are stable across renders for the same `trip`/options
 * identity, so they're safe to drop into `useEffect` deps without churn.
 */

import { useCallback } from "react";
import type { Trip } from "../data/types";
import { useShell } from "../shell-context";
import { useToast } from "./toast";

export interface BookingActionResult {
  ok: boolean;
  reason?: string;
}

export interface BookAllPendingResult extends BookingActionResult {
  flights?: number;
  hotels?: number;
}

export interface TripBookingActions {
  /** Book one already-proposed flight by id. */
  bookFlight: (id: string) => BookingActionResult;
  /** Book one already-proposed hotel by id. */
  bookHotel: (id: string) => BookingActionResult;
  /**
   * Mark every pending flight + hotel booked, and flip the trip's status
   * to `"booked"`. Calls `options.onAllBooked` if everything was booked
   * successfully (used to fire confetti on the booking page).
   */
  bookAllPending: () => BookAllPendingResult;
}

export interface UseTripBookingOptions {
  /** Side effect to fire after a successful `bookAllPending` (confetti, etc.). */
  onAllBooked?: () => void;
}

export function useTripBookingActions(
  trip: Trip | undefined,
  options: UseTripBookingOptions = {},
): TripBookingActions {
  const { upsertTrip } = useShell();
  const toast = useToast();
  const { onAllBooked } = options;

  const bookFlight = useCallback(
    (id: string): BookingActionResult => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const target = trip.flights.find((f) => f.id === id);
      if (!target) return { ok: false, reason: "no such flight" };
      upsertTrip({
        ...trip,
        flights: trip.flights.map((f) => (f.id === id ? { ...f, booked: true } : f)),
      });
      toast.push({
        tone: "success",
        title: "Flight booked",
        message: `${target.airline} ${target.from} → ${target.to}`,
      });
      return { ok: true };
    },
    [trip, upsertTrip, toast],
  );

  const bookHotel = useCallback(
    (id: string): BookingActionResult => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const target = trip.hotels.find((h) => h.id === id);
      if (!target) return { ok: false, reason: "no such hotel" };
      upsertTrip({
        ...trip,
        hotels: trip.hotels.map((h) => (h.id === id ? { ...h, booked: true } : h)),
      });
      toast.push({
        tone: "success",
        title: "Hotel booked",
        message: `${target.name}, ${target.nights} nights`,
      });
      return { ok: true };
    },
    [trip, upsertTrip, toast],
  );

  const bookAllPending = useCallback((): BookAllPendingResult => {
    if (!trip) return { ok: false, reason: "no active trip" };
    const flightCount = trip.flights.filter((f) => !f.booked).length;
    const hotelCount = trip.hotels.filter((h) => !h.booked).length;
    upsertTrip({
      ...trip,
      flights: trip.flights.map((f) => ({ ...f, booked: true })),
      hotels: trip.hotels.map((h) => ({ ...h, booked: true })),
      status: "booked",
    });
    onAllBooked?.();
    toast.push({
      tone: "success",
      title: "Trip booked",
      message: `${flightCount} flights, ${hotelCount} hotels locked in.`,
    });
    return { ok: true, flights: flightCount, hotels: hotelCount };
  }, [trip, upsertTrip, toast, onAllBooked]);

  return { bookFlight, bookHotel, bookAllPending };
}
