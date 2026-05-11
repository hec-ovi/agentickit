import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Preferences, Trip } from "./data/types";
import { clearVisitedFlag, usePreferencesStore, useTripsStore } from "./data/store";

interface ShellContextValue {
  trips: ReadonlyArray<Trip>;
  upsertTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  getTrip: (id: string) => Trip | undefined;
  preferences: Preferences;
  setPreferences: (p: Preferences) => void;
  clearAll: () => void;
  restoreSeeds: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function TripsContextProvider({ children }: { children: ReactNode }) {
  const tripsStore = useTripsStore();
  const prefsStore = usePreferencesStore();

  const clearAll = useCallback(() => {
    tripsStore.clearTrips();
    prefsStore.resetPreferences();
    clearVisitedFlag();
  }, [tripsStore.clearTrips, prefsStore.resetPreferences]);

  const restoreSeeds = useCallback(() => {
    tripsStore.restoreSeedTrips();
    prefsStore.resetPreferences();
  }, [tripsStore.restoreSeedTrips, prefsStore.resetPreferences]);

  const value = useMemo<ShellContextValue>(
    () => ({
      trips: tripsStore.trips,
      upsertTrip: tripsStore.upsertTrip,
      deleteTrip: tripsStore.deleteTrip,
      getTrip: tripsStore.getTrip,
      preferences: prefsStore.preferences,
      setPreferences: prefsStore.setPreferences,
      clearAll,
      restoreSeeds,
    }),
    [
      tripsStore.trips,
      tripsStore.upsertTrip,
      tripsStore.deleteTrip,
      tripsStore.getTrip,
      prefsStore.preferences,
      prefsStore.setPreferences,
      clearAll,
      restoreSeeds,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <TripsContextProvider>");
  return ctx;
}
