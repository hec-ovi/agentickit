import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Light wrapper that re-keys on route change so children re-mount and
 * pick up the `route-enter` CSS animation (a quick fade + slide). Cheap,
 * no library, respects prefers-reduced-motion via the global CSS rule.
 */
export function RouteFrame({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div className="route-enter" key={location.pathname}>
      {children}
    </div>
  );
}
