import type { ReactNode } from "react";
import type { PilotConfig } from "../types.js";

export interface PilotProps extends PilotConfig {
  children: ReactNode;
}

/**
 * Top-level provider. Configures the runtime connection, loads `.pilot/`
 * protocol if `pilotProtocolUrl` is set, and makes state/action/form
 * registries available to hooks deeper in the tree.
 *
 * Implementation pending. Stub renders children directly so apps can
 * integrate the import path without runtime errors.
 */
export function Pilot(props: PilotProps): ReactNode {
  return props.children;
}
