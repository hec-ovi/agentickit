// Server-only entry point. Import from "agentickit/server".
// Provides the Next.js route handler factory plus lower-level streaming helpers.

export { autoDetectModel, createPilotHandler } from "./handler.js";
export type {
  CreatePilotHandlerOptions,
  ModelSpec,
  PilotErrorBody,
} from "./handler.js";
