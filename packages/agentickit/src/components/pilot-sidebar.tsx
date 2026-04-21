import type { ReactNode } from "react";

export interface PilotSidebarProps {
  /**
   * Open by default. Defaults to false.
   */
  defaultOpen?: boolean;
  /**
   * Rendered above the first message. Useful for product-level greeting.
   */
  greeting?: ReactNode;
  /**
   * className applied to the sidebar root.
   */
  className?: string;
}

/**
 * Default chat sidebar UI. Thin wrapper around headless primitives
 * (to be forked from assistant-ui). Intentionally opinionated so
 * consumers get a working UI with zero styling work.
 *
 * Implementation pending.
 */
export function PilotSidebar(_props: PilotSidebarProps = {}): ReactNode {
  return null;
}
