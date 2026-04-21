// Public client-side API.
// Hooks and components ship here; server-only code lives under /server.

export type {
  PilotActionRegistration,
  PilotConfig,
  PilotFormRegistration,
  PilotMessage,
  PilotMessagePart,
  PilotStateRegistration,
} from "./types.js";

// Hooks and components are implemented in a subsequent pass; this file
// is the export surface that the public API contract locks in.
export { usePilotAction } from "./hooks/use-pilot-action.js";
export { usePilotState } from "./hooks/use-pilot-state.js";
export { usePilotForm } from "./hooks/use-pilot-form.js";
export { Pilot } from "./components/pilot-provider.js";
export { PilotSidebar } from "./components/pilot-sidebar.js";
