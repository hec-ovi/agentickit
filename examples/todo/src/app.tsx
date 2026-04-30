import { useMemo, useState } from "react";
import {
  Pilot,
  PilotSidebar,
  PilotPopup,
  PilotModal,
  agUiRuntime,
} from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";
import { TodoWidget } from "./widgets/todo";
import { ContactWidget } from "./widgets/contact";
import { PreferencesWidget } from "./widgets/preferences";
import { TimelineWidget } from "./widgets/timeline";
import { LogPanel } from "./log-panel";

type Tab = "todo" | "contact" | "preferences" | "logs";
type Chrome = "sidebar" | "popup" | "modal";
type RuntimeChoice = "local" | "agui";

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
  { id: "agui", label: "agUiRuntime", caption: "AG-UI HttpAgent against /api/agui (scripted)" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("todo");
  const [chrome, setChrome] = useState<Chrome>("sidebar");
  const [runtimeChoice, setRuntimeChoice] = useState<RuntimeChoice>("local");
  const [modalOpen, setModalOpen] = useState(false);

  // Construct one HttpAgent per app lifetime so its identity stays stable.
  // agUiRuntime caches the runtime per agent reference, so consumers do not
  // need to memoize the factory call themselves; the agent is still the
  // identity key, so we memoize that.
  const aguiAgent = useMemo(
    () => new HttpAgent({ url: "/api/agui", agentId: "demo-agent" }),
    [],
  );
  const aguiRuntimeInstance = useMemo(() => agUiRuntime({ agent: aguiAgent }), [aguiAgent]);

  // The chat-surface props change a bit per chrome: sidebar is uncontrolled
  // and stays open by default; popup defaults open from a prop; modal is
  // controlled-only and we expose a launch button.
  const chatLabels = {
    title: "agentickit",
    emptyState:
      runtimeChoice === "agui"
        ? "Scripted AG-UI agent. Try: 'add a todo to call mom'."
        : "Ask me to fill the form or add todos.",
  };
  const suggestions =
    runtimeChoice === "agui"
      ? [
          "Hi",
          "Process my data",
          "Add a todo to buy groceries",
        ]
      : [
          "Add three todos: buy milk, call mom, pay rent",
          "Fill the contact form with plausible sample data and submit it",
          "Mark the first todo as done",
        ];

  // The Pilot tree is identical across runtimes; only the `runtime` prop
  // changes. When runtimeChoice flips, the provider tears down its current
  // chat lifecycle and remounts against the new runtime.
  return (
    <Pilot
      apiUrl="/api/pilot"
      runtime={runtimeChoice === "agui" ? aguiRuntimeInstance : undefined}
    >
      <div className="shell">
        <header>
          <h1>agentickit · demo</h1>
          <p>Three widgets, three hooks, three chat surfaces, two runtimes.</p>
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

        {/* Generative-UI demo (Phase 5). Visible only when agUiRuntime is
            active so the widget actually has a state stream to subscribe to.
            With localRuntime, the agent reference exists but never receives
            STATE events, so the widget would render its empty state. */}
        {runtimeChoice === "agui" ? <TimelineWidget agent={aguiAgent} /> : null}

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
