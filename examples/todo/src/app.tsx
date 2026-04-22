import { useState } from "react";
import { Pilot, PilotSidebar } from "@hec-ovi/agentickit";
import { TodoWidget } from "./widgets/todo";
import { ContactWidget } from "./widgets/contact";
import { PreferencesWidget } from "./widgets/preferences";
import { LogPanel } from "./log-panel";

type Tab = "todo" | "contact" | "preferences" | "logs";

const TABS: ReadonlyArray<{ id: Tab; label: string; caption: string }> = [
  { id: "todo", label: "Todo", caption: "usePilotState + usePilotAction" },
  { id: "contact", label: "Contact form", caption: "usePilotForm" },
  { id: "preferences", label: "Preferences", caption: "mutating: true confirm" },
  { id: "logs", label: "Live log", caption: "server /api/pilot-log SSE" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("todo");
  return (
    <Pilot apiUrl="/api/pilot">
      <div className="shell">
        <header>
          <h1>agentickit · demo</h1>
          <p>Three widgets, three hooks, one sidebar. Live log on the fourth tab.</p>
        </header>
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
      </div>
      <PilotSidebar
        defaultOpen
        labels={{ title: "agentickit", emptyState: "Ask me to fill the form or add todos." }}
        suggestions={[
          "Add three todos: buy milk, call mom, pay rent",
          "Fill the contact form with plausible sample data and submit it",
          "Mark the first todo as done",
        ]}
      />
    </Pilot>
  );
}
