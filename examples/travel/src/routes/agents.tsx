import {
  PilotAgentStateView,
  useAgent,
  useAgents,
  usePilotAgentActivity,
  usePilotAgentState,
} from "@hec-ovi/agentickit";
import type { AbstractAgent } from "@ag-ui/client";

type AgentId = "concierge" | "flights" | "hotels" | "activities" | "weather";

interface AgentMeta {
  id: AgentId;
  name: string;
  description: string;
  badge: string;
  glyph: string;
}

// Concierge is the implicit default runtime (`<Pilot apiUrl="...">`),
// not registered through `<PilotAgentRegistry>`, so we keep one
// hand-written entry for it. Every other agent is read live from the
// registry via `useAgents()` below; if you `useRegisterAgent("trains", ...)`
// from anywhere, it shows up here automatically.
const CONCIERGE_META: AgentMeta = {
  id: "concierge",
  name: "Concierge",
  description:
    "Default agent. Real LLM via the Concierge endpoint, with the full tool registry attached. Use this for anything end-to-end.",
  badge: "default · LLM",
  glyph: "✦",
};

const SPECIALIST_META: Record<Exclude<AgentId, "concierge">, AgentMeta> = {
  flights: {
    id: "flights",
    name: "Flights specialist",
    description:
      "Real LLM at /api/agui-flights with a flights-only system prompt and a curated tool subset (propose_flight, get_weather, currency, dates). Cannot edit the trip directly or step outside flights.",
    badge: "AG-UI · LLM",
    glyph: "✈",
  },
  hotels: {
    id: "hotels",
    name: "Hotels specialist",
    description:
      "Real LLM at /api/agui-hotels scoped to accommodations only. Tool subset: propose_hotel + weather + dates + currency. Hands off to the Concierge for anything outside hotels.",
    badge: "AG-UI · LLM",
    glyph: "⌂",
  },
  activities: {
    id: "activities",
    name: "Activities specialist",
    description:
      "Real LLM at /api/agui-activities scoped to things to do. Tool subset: add_day_item + weather + destinations. Cannot book or edit trip metadata.",
    badge: "AG-UI · LLM",
    glyph: "◎",
  },
  weather: {
    id: "weather",
    name: "Weather specialist",
    description:
      "Real LLM at /api/agui-weather scoped to forecasts and weather-driven advice. Tool subset: get_weather + date helpers + destinations catalog.",
    badge: "AG-UI · LLM",
    glyph: "☀",
  },
};

interface AgentsRouteProps {
  active: AgentId;
  onSwitch: (id: AgentId) => void;
}

export function AgentsRoute({ active, onSwitch }: AgentsRouteProps) {
  // `useAgents()` returns every agent currently in `<PilotAgentRegistry>`
  // as a `ReadonlyArray<{ id, agent }>` in registration order. We render
  // the picker by walking that list instead of a hardcoded array, so the
  // page reflects the live registry. Adding or removing a
  // `useRegisterAgent("...", ...)` call elsewhere shows up here without
  // any change to this route.
  const registryAgents = useAgents();
  const registeredCards = registryAgents
    .map(({ id, agent }) => {
      const meta = SPECIALIST_META[id as Exclude<AgentId, "concierge">];
      return meta ? { meta, agent } : null;
    })
    .filter((entry): entry is { meta: AgentMeta; agent: AbstractAgent } => entry !== null);

  const cards: ReadonlyArray<{ meta: AgentMeta; agent: AbstractAgent | null }> = [
    { meta: CONCIERGE_META, agent: null },
    ...registeredCards,
  ];

  // Look up the active agent by id. Returns undefined for the concierge id
  // (which isn't registered). Specialist routes pass the AbstractAgent into
  // `<PilotAgentStateView>` and the live-status panel below.
  const activeSpecialist = useAgent(active === "concierge" ? "" : active);
  const activeMeta =
    active === "concierge"
      ? CONCIERGE_META
      : SPECIALIST_META[active as Exclude<AgentId, "concierge">];

  return (
    <>
      <header className="hero">
        <h1 className="page-title">Agents</h1>
        <p className="page-subtitle">
          Switch the active agent. The chat sidebar (and every page hook) routes through whichever
          one is selected. Each specialist is a real LLM call (server-side <code>streamText</code>)
          with its own system prompt and a curated tool subset, reached through the AG-UI
          <code>HttpAgent</code> registry pattern. The picker below reads from the live registry via
          <code>useAgents()</code> — adding a new <code>useRegisterAgent</code> call anywhere makes
          it show up here automatically.
        </p>
      </header>

      <div className="agent-grid">
        {cards.map(({ meta }) => (
          <button
            key={meta.id}
            type="button"
            className={`agent-card ${active === meta.id ? "active" : ""}`}
            onClick={() => onSwitch(meta.id)}
            aria-pressed={active === meta.id}
            aria-label={`Switch to ${meta.name}`}
          >
            <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
              <span className="agent-glyph" aria-hidden="true">
                {meta.glyph}
              </span>
              <div style={{ flex: 1 }}>
                <div className="row space-between">
                  <h3>{meta.name}</h3>
                  <span className="badge">{meta.badge}</span>
                </div>
                <p>{meta.description}</p>
                {active === meta.id ? (
                  <span className="badge accent" style={{ marginTop: 10 }}>
                    Active
                  </span>
                ) : (
                  <span className="subtle" style={{ marginTop: 10, display: "inline-block" }}>
                    Tap to activate
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {active !== "concierge" && activeSpecialist ? (
        <>
          <section className="card agent-state-section">
            <div className="row space-between">
              <h2 className="card-title">Live state: {activeMeta?.name}</h2>
              <span className="badge accent">streaming</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              <code>PilotAgentStateView</code> renders whatever JSON the agent streams via
              STATE_SNAPSHOT and STATE_DELTA events. Open the chat sidebar at the bottom-right and
              send a message; the step timeline will animate as the agent runs.
            </p>
            <div className="agent-state-frame">
              <PilotAgentStateView
                agent={activeSpecialist}
                render={(state) =>
                  state ? (
                    <pre className="agent-state-json">{JSON.stringify(state, null, 2)}</pre>
                  ) : (
                    <span className="muted">
                      Empty so far. Send a message and this updates in place.
                    </span>
                  )
                }
              />
            </div>
          </section>

          <AgentLiveHud agent={activeSpecialist} />
        </>
      ) : null}
    </>
  );
}

/**
 * Demo of the two raw hooks behind `<PilotAgentStateView>`:
 *
 * - `usePilotAgentState<T>(agent)` returns the most recent
 *   `STATE_SNAPSHOT`/`STATE_DELTA`-applied state object. We use it to
 *   surface a one-line summary instead of pretty-printing the full JSON.
 * - `usePilotAgentActivity(agent)` returns the activity + reasoning
 *   streams (`ACTIVITY_*`, `REASONING_*` events). We render counts so a
 *   user can watch them tick up live during a turn.
 *
 * `<PilotAgentStateView>` is sugar over the state hook; the activity hook
 * has no JSX wrapper because consumers usually want custom UI for it.
 */
function AgentLiveHud({ agent }: { agent: AbstractAgent }): JSX.Element {
  const state = usePilotAgentState<Record<string, unknown>>(agent);
  const { activities, reasoning } = usePilotAgentActivity(agent);
  const stateKeys = state ? Object.keys(state) : [];
  return (
    <section className="card">
      <div className="row space-between">
        <h2 className="card-title">Live HUD</h2>
        <span className="badge">usePilotAgentState · usePilotAgentActivity</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Same agent, the two raw hooks. Watch these counters tick during a turn.
      </p>
      <div className="row" style={{ gap: 24, marginTop: 12 }}>
        <div>
          <div className="subtle">State keys</div>
          <div className="value">{stateKeys.length}</div>
          {stateKeys.length > 0 ? (
            <code className="muted">{stateKeys.slice(0, 4).join(", ")}</code>
          ) : null}
        </div>
        <div>
          <div className="subtle">Activity entries</div>
          <div className="value">{activities.length}</div>
        </div>
        <div>
          <div className="subtle">Reasoning blocks</div>
          <div className="value">{reasoning.length}</div>
        </div>
      </div>
    </section>
  );
}
