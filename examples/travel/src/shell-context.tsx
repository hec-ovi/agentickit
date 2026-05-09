import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Preferences, Trip } from "./data/types";
import { clearVisitedFlag, usePreferencesStore, useTripsStore } from "./data/store";

type AgentId = "concierge" | "flights" | "hotels" | "activities" | "weather";

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

interface ModeBinding {
  active: AgentId;
  setActive: (id: AgentId) => void;
}
const ModeContext = createContext<{ get: () => ModeBinding | null; bind: (a: AgentId, s: (id: AgentId) => void) => void } | null>(null);

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

  const bindingRef = useRef<ModeBinding | null>(null);
  const modeApi = useMemo(
    () => ({
      get: () => bindingRef.current,
      bind: (active: AgentId, setActive: (id: AgentId) => void) => {
        bindingRef.current = { active, setActive };
      },
    }),
    [],
  );

  return (
    <ShellContext.Provider value={value}>
      <ModeContext.Provider value={modeApi}>{children}</ModeContext.Provider>
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <TripsContextProvider>");
  return ctx;
}

export function usePilotMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("usePilotMode must be used inside <TripsContextProvider>");
  return ctx;
}
