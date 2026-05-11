import { useMemo, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import {
  Pilot,
  PilotAgentRegistry,
  PilotSidebar,
  agUiRuntime,
  useAgent,
  useRegisterAgent,
} from "@hec-ovi/agentickit";
import { HttpAgent } from "@ag-ui/client";
import { ThemeProvider } from "./theme/theme-provider";
import { ToastProvider } from "./lib/toast";
import { Nav } from "./components/nav";
import { RouteFrame } from "./components/route-frame";
import { FirstVisitHint } from "./components/first-visit-hint";
import { appConfirmRender } from "./components/app-confirm";
import { PilotPlugins } from "./plugins";
import { weatherPlugin } from "./plugins/weather";
import { currencyPlugin } from "./plugins/currency";
import { destinationsPlugin } from "./plugins/destinations";
import { datePlugin } from "./plugins/date";
import {
  duckDuckGoPlugin,
  tavilyPlugin,
  firecrawlPlugin,
  serperPlugin,
} from "./plugins/web-search";
import { DashboardRoute } from "./routes/dashboard";
import { TripDetailRoute } from "./routes/trip-detail";
import { ItineraryRoute } from "./routes/itinerary";
import { PackingRoute } from "./routes/packing";
import { BookingRoute } from "./routes/booking";
import { PreferencesRoute } from "./routes/preferences";
import { AgentsRoute } from "./routes/agents";
import { LabRoute } from "./routes/lab";
import { ThreadsRoute } from "./routes/threads";
import { TripsContextProvider } from "./shell-context";

type AgentId = "concierge" | "flights" | "hotels" | "activities" | "weather";

function RegisterSpecialists(): null {
  useRegisterAgent("flights", () =>
    new HttpAgent({ url: "/api/agui-flights", agentId: "flights" }),
  );
  useRegisterAgent("hotels", () =>
    new HttpAgent({ url: "/api/agui-hotels", agentId: "hotels" }),
  );
  useRegisterAgent("activities", () =>
    new HttpAgent({ url: "/api/agui-activities", agentId: "activities" }),
  );
  useRegisterAgent("weather", () =>
    new HttpAgent({ url: "/api/agui-weather", agentId: "weather" }),
  );
  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PilotAgentRegistry>
          <RegisterSpecialists />
          <TripsContextProvider>
            <Shell />
          </TripsContextProvider>
        </PilotAgentRegistry>
      </ToastProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const [activeAgent, setActiveAgent] = useState<AgentId>("concierge");
  const aguiAgent = useAgent(activeAgent === "concierge" ? "" : activeAgent);

  const runtime = useMemo(
    () => (aguiAgent ? agUiRuntime({ agent: aguiAgent }) : undefined),
    [aguiAgent],
  );

  // Suggestion chips swap per route so each page nudges toward its
  // primary primitive demo. Sidebar refreshes when route changes.
  const location = useLocation();
  const suggestions = useMemo(() => {
    const path = location.pathname;
    if (path === "/") {
      return [
        "Plan a 5-day trip to Lisbon for two travelers in June",
        "What is the weather like in Tokyo next week?",
        "Convert my $2000 budget to JPY",
        "List the destinations you know about",
      ];
    }
    if (/^\/trips\/[^/]+\/itinerary/.test(path)) {
      return [
        "Propose a flight from JFK on the trip start date",
        "Pick a hotel for me",
        "Add a sunset food walk on the second day at 18:00",
      ];
    }
    if (/^\/trips\/[^/]+\/packing/.test(path)) {
      return [
        "Suggest 5 things I'm forgetting for cold weather",
        "Add: travel umbrella, neck pillow, eye mask",
        "Toggle 'walking shoes' as packed",
      ];
    }
    if (/^\/trips\/[^/]+\/book/.test(path)) {
      return [
        "Book the cheapest flight",
        "Book all pending and mark the trip as booked",
        "What is my current spend vs budget?",
      ];
    }
    if (/^\/trips\/[^/]+/.test(path)) {
      return [
        "What is the weather forecast for this trip?",
        "Rename this trip to something snappier",
        "Mark this trip as planned",
      ];
    }
    if (path === "/preferences") {
      return [
        "Set my home airport to LAX",
        "Switch my currency to EUR",
        "Make me vegetarian and gluten-free",
      ];
    }
    if (path === "/agents") {
      return [
        "Hi, who are you?",
        "What can you do?",
        "Show me your thinking process",
      ];
    }
    return [
      "What can you help me with?",
      "Give me a summary of my trips",
    ];
  }, [location.pathname]);

  return (
    <Pilot
      apiUrl="/api/pilot"
      runtime={runtime}
      renderConfirm={appConfirmRender}
    >
      <PilotPlugins
        plugins={[
          datePlugin,
          weatherPlugin,
          currencyPlugin,
          destinationsPlugin,
          // Web-search plugins. Mount only the ones whose env vars are set
          // (the proxy still returns a structured 503 with a clear reason
          // for unset keys, so leaving all mounted is also safe — the
          // model just sees a `{ ok: false, reason: ... }` and reports it).
          duckDuckGoPlugin,
          tavilyPlugin,
          firecrawlPlugin,
          serperPlugin,
        ]}
      />
      <FirstVisitHint />
      <div className="app-shell">
        <Nav />
        <main className="main">
          <RouteFrame>
            <Routes>
              <Route path="/" element={<DashboardRoute />} />
              <Route path="/trips/:tripId" element={<TripDetailRoute />} />
              <Route path="/trips/:tripId/itinerary" element={<ItineraryRoute />} />
              <Route path="/trips/:tripId/packing" element={<PackingRoute />} />
              <Route path="/trips/:tripId/book" element={<BookingRoute />} />
              <Route path="/preferences" element={<PreferencesRoute />} />
              <Route
                path="/agents"
                element={
                  <AgentsRoute active={activeAgent} onSwitch={setActiveAgent} />
                }
              />
              <Route path="/threads" element={<ThreadsRoute />} />
              <Route path="/lab" element={<LabRoute />} />
            </Routes>
          </RouteFrame>
        </main>
      </div>
      <PilotSidebar
        defaultOpen={false}
        labels={{
          title: "agentickit travel",
          emptyState:
            activeAgent === "concierge"
              ? "Ask me anything about your trip."
              : `Talking to the ${activeAgent} specialist (scoped LLM with a curated tool subset).`,
        }}
        suggestions={suggestions}
      />
    </Pilot>
  );
}

