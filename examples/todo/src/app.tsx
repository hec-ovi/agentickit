import { useMemo, useState } from "react";
import {
  Pilot,
  PilotSidebar,
  PilotPopup,
  PilotModal,
  PilotAgentRegistry,
  agUiRuntime,
  useAgent,
  useRegisterAgent,
} from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";
import type { AbstractAgent } from "@ag-ui/client";
import { TodoWidget } from "./widgets/todo";
import { ContactWidget } from "./widgets/contact";
import { PreferencesWidget } from "./widgets/preferences";
import { TimelineWidget } from "./widgets/timeline";
import { LogPanel } from "./log-panel";

type Tab = "todo" | "contact" | "preferences" | "logs";
type Chrome = "sidebar" | "popup" | "modal";
type RuntimeChoice = "local" | "agui";
type AgentId = "research" | "code" | "writing";

const TABS: ReadonlyArray<{ id: Tab; label: string; caption: string }> = [
  { id: "todo", label: "Todo", caption: "usePilotState + usePilotAction" },
  { id: "contact", label: "Contact form", caption: "usePilotForm" },
  { id: "preferences", label: "Preferences", caption: "mutating: true confirm" },
  { id: "logs", label: "Live log", caption: "server /api/pilot-log SSE (localRuntime only)" },
];

const CHROMES: ReadonlyArray<{ id: Chrome; label: string }> = [
  { id: "sidebar", label: "Sidebar" },
  { id: "popup", label: "Popup" },
  { id: "modal", label: "Modal" },
];

const RUNTIMES: ReadonlyArray<{ id: RuntimeChoice; label: string; caption: string }> = [
  { id: "local", label: "localRuntime", caption: "AI SDK 6 over /api/pilot (real LLM)" },
  { id: "agui", label: "agUiRuntime", caption: "AG-UI HttpAgent + multi-agent registry (scripted)" },
];

const AGENTS: ReadonlyArray<{ id: AgentId; label: string; caption: string }> = [
  { id: "research", label: "research", caption: "Streams STATE_DELTA events for the timeline widget" },
  { id: "code", label: "code", caption: "Replies with code-flavored text" },
  { id: "writing", label: "writing", caption: "Replies with creative prose" },
];

/**
 * Phase 7 demo: register three AG-UI agents under stable ids so consumers
 * can switch between them at runtime via the active-agent state. The
 * registration components live INSIDE the <PilotAgentRegistry> tree so
 * useRegisterAgent's lifecycle is correct (factory called once on mount,
 * abortRun + deregister on unmount).
 */
function RegisterAgents(): null {
  useRegisterAgent("research", () =>
    new HttpAgent({ url: "/api/agui-research", agentId: "research" }),
  );
  useRegisterAgent("code", () =>
    new HttpAgent({ url: "/api/agui-code", agentId: "code" }),
  );
  useRegisterAgent("writing", () =>
    new HttpAgent({ url: "/api/agui-writing", agentId: "writing" }),
  );
  return null;
}

export function App() {
  return (
    <PilotAgentRegistry>
      <RegisterAgents />
      <AppShell />
    </PilotAgentRegistry>
  );
}

function AppShell() {
  const [tab, setTab] = useState<Tab>("todo");
  const [chrome, setChrome] = useState<Chrome>("sidebar");
  const [runtimeChoice, setRuntimeChoice] = useState<RuntimeChoice>("local");
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("research");
  const [modalOpen, setModalOpen] = useState(false);

  // Read the currently-active agent from the registry. `useAgent`
  // re-renders this component when the agent under that id changes.
  const activeAgent = useAgent(activeAgentId);

  // Build the runtime against the active agent. agUiRuntime caches per
  // agent reference, so flipping activeAgentId (which returns a different
  // agent reference) yields a different runtime instance, which triggers
  // PilotRuntimeBridge's identity-based remount cleanly.
  const aguiRuntimeInstance = useMemo(
    () => (activeAgent ? agUiRuntime({ agent: activeAgent }) : undefined),
    [activeAgent],
  );

  const chatLabels = {
    title: "agentickit",
    emptyState:
      runtimeChoice === "agui"
        ? `Scripted '${activeAgentId}' agent. Try: 'add a todo to call mom'.`
        : "Ask me to fill the form or add todos.",
  };
  const suggestions =
    runtimeChoice === "agui"
      ? agentSuggestions(activeAgentId)
      : [
          "Add three todos: buy milk, call mom, pay rent",
          "Fill the contact form with plausible sample data and submit it",
          "Mark the first todo as done",
        ];

  return (
    <Pilot
      apiUrl="/api/pilot"
      runtime={runtimeChoice === "agui" ? aguiRuntimeInstance : undefined}
    >
      <div className="shell">
        <header>
          <h1>agentickit · demo</h1>
          <p>Three widgets, three hooks, three chat surfaces, two runtimes, three agents.</p>
        </header>

        <div className="control-row" data-testid="chrome-picker">
          <fieldset>
            <legend>Chat surface</legend>
            {CHROMES.map((c) => (
              <label key={c.id} className={chrome === c.id ? "active" : ""}>
                <input
                  type="radio"
                  name="chrome"
                  value={c.id}
                  checked={chrome === c.id}
                  onChange={() => setChrome(c.id)}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Runtime</legend>
            {RUNTIMES.map((r) => (
              <label
                key={r.id}
                className={runtimeChoice === r.id ? "active" : ""}
                title={r.caption}
              >
                <input
                  type="radio"
                  name="runtime"
                  value={r.id}
                  checked={runtimeChoice === r.id}
                  onChange={() => setRuntimeChoice(r.id)}
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          {runtimeChoice === "agui" ? (
            <fieldset data-testid="agent-picker">
              <legend>Agent</legend>
              {AGENTS.map((a) => (
                <label
                  key={a.id}
                  className={activeAgentId === a.id ? "active" : ""}
                  title={a.caption}
                >
                  <input
                    type="radio"
                    name="agent"
                    value={a.id}
                    checked={activeAgentId === a.id}
                    onChange={() => setActiveAgentId(a.id)}
                  />
                  {a.label}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {TABS.map((t) => (
          <p key={t.id} className="caption" hidden={tab !== t.id}>
            {t.caption}
          </p>
        ))}
        <section hidden={tab !== "todo"}>
          <TodoWidget />
        </section>
        <section hidden={tab !== "contact"}>
          <ContactWidget />
        </section>
        <section hidden={tab !== "preferences"}>
          <PreferencesWidget />
        </section>
        <section hidden={tab !== "logs"}>
          <LogPanel />
        </section>

        {/* Generative-UI demo. Reads from whichever agent is currently
            active; the timeline only animates for agents that emit
            STATE_* events (research). The other agents will leave the
            widget in its empty state. */}
        {runtimeChoice === "agui" && activeAgent ? (
          <TimelineWidget agent={activeAgent as AbstractAgent} />
        ) : null}

        {chrome === "modal" ? (
          <button
            type="button"
            className="modal-launch"
            data-testid="open-modal"
            onClick={() => setModalOpen(true)}
          >
            Open chat modal
          </button>
        ) : null}
      </div>

      {chrome === "sidebar" ? (
        <PilotSidebar defaultOpen labels={chatLabels} suggestions={suggestions} />
      ) : null}
      {chrome === "popup" ? (
        <PilotPopup defaultOpen labels={chatLabels} suggestions={suggestions} />
      ) : null}
      {chrome === "modal" ? (
        <PilotModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          labels={chatLabels}
          suggestions={suggestions}
        />
      ) : null}
    </Pilot>
  );
}

function agentSuggestions(id: AgentId): ReadonlyArray<string> {
  switch (id) {
    case "research":
      return ["Hi", "Process my data", "Add a todo to buy groceries"];
    case "code":
      return ["Show me a TS function", "Explain hooks", "Add a todo to refactor auth"];
    case "writing":
      return ["Draft a paragraph", "Help me brainstorm", "Add a todo to outline chapter 3"];
  }
}
