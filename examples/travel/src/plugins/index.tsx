import type { ReactNode } from "react";

/**
 * A pilot plugin is just a React component that calls one or more
 * `usePilotAction` / `usePilotState` registrations and renders nothing.
 * Mounting the component registers the tools; unmounting cleans them up.
 *
 * Pattern is intentionally minimal so plugins are first-class React (with
 * hooks, context, props, etc.) without needing a framework abstraction.
 */
export interface PilotPlugin {
  id: string;
  /** Optional one-line description for the agents page or debug overlays. */
  description?: string;
  /** The component itself. Renders null. */
  component: () => ReactNode;
}

interface PilotPluginsProps {
  plugins: ReadonlyArray<PilotPlugin>;
}

/**
 * Mount a list of plugins. Each one is rendered (and so registers its tools)
 * for as long as `<PilotPlugins>` is mounted.
 */
export function PilotPlugins({ plugins }: PilotPluginsProps): ReactNode {
  return (
    <>
      {plugins.map((p) => {
        const Component = p.component;
        return <Component key={p.id} />;
      })}
    </>
  );
}
