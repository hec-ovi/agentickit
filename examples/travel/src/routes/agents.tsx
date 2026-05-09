import { PilotAgentStateView, useAgent } from "@hec-ovi/agentickit";

type AgentId = "concierge" | "flights" | "hotels" | "activities" | "weather";

interface AgentMeta {
  id: AgentId;
  name: string;
  description: string;
  badge: string;
  glyph: string;
}

const AGENTS: ReadonlyArray<AgentMeta> = [
  {
    id: "concierge",
    name: "Concierge",
    description:
      "Default agent. Real LLM via localRuntime, with the full tool registry attached. Use this for anything end-to-end.",
    badge: "local · LLM",
    glyph: "✦",
  },
  {
    id: "flights",
    name: "Flights specialist",
    description:
      "Real LLM at /api/agui-flights with a flights-only system prompt and a curated tool subset (propose_flight, get_weather, currency, dates). Cannot edit the trip directly or step outside flights.",
    badge: "AG-UI · LLM",
    glyph: "✈",
  },
  {
    id: "hotels",
    name: "Hotels specialist",
    description:
      "Real LLM at /api/agui-hotels scoped to accommodations only. Tool subset: propose_hotel + weather + dates + currency. Hands off to the Concierge for anything outside hotels.",
    badge: "AG-UI · LLM",
    glyph: "⌂",
  },
  {
    id: "activities",
    name: "Activities specialist",
    description:
      "Real LLM at /api/agui-activities scoped to things to do. Tool subset: add_day_item + weather + destinations. Cannot book or edit trip metadata.",
    badge: "AG-UI · LLM",
    glyph: "◎",
  },
  {
    id: "weather",
    name: "Weather specialist",
    description:
      "Real LLM at /api/agui-weather scoped to forecasts and weather-driven advice. Tool subset: get_weather + date helpers + destinations catalog.",
    badge: "AG-UI · LLM",
    glyph: "☀",
  },
];

interface AgentsRouteProps {
  active: AgentId;
  onSwitch: (id: AgentId) => void;
}

export function AgentsRoute({ active, onSwitch }: AgentsRouteProps) {
  const activeSpecialist = useAgent(active === "concierge" ? "" : active);
  const activeMeta = AGENTS.find((a) => a.id === active);
  return (
    <>
      <header className="hero">
        <h1 className="page-title">Agents</h1>
        <p className="page-subtitle">
          Switch the active agent. The chat sidebar (and every page hook) routes through whichever
          one is selected. Each specialist is a real LLM call (server-side <code>streamText</code>)
          with its own system prompt and a curated tool subset, reached through the AG-UI
          <code>HttpAgent</code> registry pattern.
        </p>
      </header>

      <div className="agent-grid">
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`agent-card ${active === agent.id ? "active" : ""}`}
            onClick={() => onSwitch(agent.id)}
            aria-pressed={active === agent.id}
            aria-label={`Switch to ${agent.name}`}
          >
            <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
              <span className="agent-glyph" aria-hidden="true">
                {agent.glyph}
              </span>
              <div style={{ flex: 1 }}>
                <div className="row space-between">
                  <h3>{agent.name}</h3>
                  <span className="badge">{agent.badge}</span>
                </div>
                <p>{agent.description}</p>
                {active === agent.id ? (
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
      ) : null}
    </>
  );
}
