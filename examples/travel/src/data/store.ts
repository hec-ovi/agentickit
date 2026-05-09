import { useCallback, useEffect, useState } from "react";
import type { Trip, Preferences } from "./types";
import { SEED_PREFERENCES, SEED_TRIPS } from "./seeds";

const TRIPS_KEY = "ak-travel-trips";
const PREFS_KEY = "ak-travel-prefs";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* persistence failure is non-fatal */
  }
}

export function useTripsStore() {
  const [trips, setTrips] = useState<Trip[]>(() => readJSON(TRIPS_KEY, [...SEED_TRIPS]));

  useEffect(() => {
    writeJSON(TRIPS_KEY, trips);
  }, [trips]);

  const upsertTrip = useCallback((trip: Trip) => {
    setTrips((prev) => {
      const idx = prev.findIndex((t) => t.id === trip.id);
      if (idx === -1) return [trip, ...prev];
      const next = [...prev];
      next[idx] = trip;
      return next;
    });
  }, []);

  const deleteTrip = useCallback((id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getTrip = useCallback(
    (id: string): Trip | undefined => trips.find((t) => t.id === id),
    [trips],
  );

  const clearTrips = useCallback(() => {
    setTrips([]);
  }, []);

  const restoreSeedTrips = useCallback(() => {
    setTrips([...SEED_TRIPS]);
  }, []);

  return { trips, upsertTrip, deleteTrip, getTrip, clearTrips, restoreSeedTrips };
}

export function usePreferencesStore() {
  const [preferences, setPreferences] = useState<Preferences>(() =>
    readJSON(PREFS_KEY, SEED_PREFERENCES),
  );

  useEffect(() => {
    writeJSON(PREFS_KEY, preferences);
  }, [preferences]);

  const resetPreferences = useCallback(() => {
    setPreferences({ ...SEED_PREFERENCES });
  }, []);

  return { preferences, setPreferences, resetPreferences };
}

export function newTripId(): string {
  return `trip-${Math.random().toString(36).slice(2, 8)}`;
}

export function newItemId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wipe the first-visit flag in localStorage so the welcome toast fires
 * again after a reset. Trips and preferences are reset via the React
 * stores' own `resetTrips` / `resetPreferences` methods (no reload needed).
 */
export function clearVisitedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("ak-travel-seen-hint");
  } catch {
    /* non-fatal */
  }
}
