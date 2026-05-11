/**
 * Packing-mutation actions for a trip, shared between the AI tool handlers
 * (`add_packing_item`, `toggle_packing_item`, `remove_packing_item`) and
 * the inline button onClicks on the packing page. See `use-trip-booking.ts`
 * for the same pattern applied to bookings; both exist so the two call
 * paths can't drift independently.
 */

import { useCallback } from "react";
import { newItemId } from "../data/store";
import type { Trip } from "../data/types";
import { useShell } from "../shell-context";

export interface PackingActionResult {
  ok: boolean;
  reason?: string;
}

export interface TripPackingActions {
  /** Append a new packing item; returns `ok: false` when no active trip. */
  addItem: (text: string) => PackingActionResult;
  /** Flip the `packed` flag on one item by id. */
  toggleItem: (id: string) => PackingActionResult;
  /** Remove one item by id. Confirmed via the modal at the AI side. */
  removeItem: (id: string) => PackingActionResult;
}

export function useTripPackingActions(trip: Trip | undefined): TripPackingActions {
  const { upsertTrip } = useShell();

  const addItem = useCallback(
    (text: string): PackingActionResult => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({
        ...trip,
        packing: [...trip.packing, { id: newItemId("p"), text, packed: false }],
      });
      return { ok: true };
    },
    [trip, upsertTrip],
  );

  const toggleItem = useCallback(
    (id: string): PackingActionResult => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const found = trip.packing.some((p) => p.id === id);
      if (!found) return { ok: false, reason: "no such item" };
      upsertTrip({
        ...trip,
        packing: trip.packing.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p)),
      });
      return { ok: true };
    },
    [trip, upsertTrip],
  );

  const removeItem = useCallback(
    (id: string): PackingActionResult => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({ ...trip, packing: trip.packing.filter((p) => p.id !== id) });
      return { ok: true };
    },
    [trip, upsertTrip],
  );

  return { addItem, toggleItem, removeItem };
}
