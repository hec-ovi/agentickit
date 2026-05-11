/**
 * Chat-surfaces lab.
 *
 * Every chat-surface variation the package ships is demoed here in
 * isolation. The page is intentionally plain: each section toggles ONE
 * thing so the user (or a screenshot) can see exactly what changes.
 *
 * What's demonstrated:
 *
 *   - `<PilotPopup>` in each of its four corners.
 *   - `<PilotModal>` opened on demand, controlled state owned by this
 *     route.
 *   - `<PilotSidebar mode="push">` toggle (the global sidebar at the root
 *     of the app is overlay-mode by default; flip the toggle here to
 *     watch the body shift to make room).
 *   - `<PilotSidebar position="left">` toggle (default is right).
 *   - `<PilotChatView composer>` mode toggles: `"full"` (default), the
 *     chips-only `"suggestions"`, and the read-only `"off"`.
 *
 * Each demo uses a NESTED `<Pilot>` provider so its chat state is
 * independent from the global app sidebar. This keeps each section
 * self-contained: a message sent in one demo doesn't show up in another.
 */

import { useState } from "react";
import {
  Pilot,
  PilotChatView,
  PilotModal,
  PilotPopup,
  PilotSidebar,
} from "@hec-ovi/agentickit";

type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type Mode = "overlay" | "push";
type Position = "left" | "right";
type ComposerMode = "full" | "suggestions" | "off";

export function LabRoute() {
  return (
    <>
      <header className="hero">
        <h1 className="page-title">Chat-surfaces lab</h1>
        <p className="page-subtitle">
          One section per surface variation, isolated. Each demo nests its own{" "}
          <code>Pilot</code> provider so state doesn't bleed across sections.
        </p>
      </header>

      <PilotPopupSection />
      <PilotModalSection />
      <PilotSidebarSection />
      <ComposerModeSection />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PilotPopup: floating bubble in a corner                            */
/* ------------------------------------------------------------------ */

function PilotPopupSection() {
  const [corner, setCorner] = useState<Corner>("bottom-right");
  return (
    <section className="card">
      <h2 className="card-title">PilotPopup</h2>
      <p className="muted" style={{ margin: 0 }}>
        Floating bubble docked to a corner. Click the chat bubble to open;
        click the X (or outside the card) to close. Toggle the corner to
        watch it relocate.
      </p>
      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        {(["bottom-right", "bottom-left", "top-right", "top-left"] as Corner[]).map((c) => (
          <button
            key={c}
            type="button"
            className={`btn compact ${corner === c ? "primary" : ""}`}
            onClick={() => setCorner(c)}
            aria-pressed={corner === c}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Showing in <code>{corner}</code>. The popup mounts inside this nested
        <code>Pilot</code> provider so it doesn't share history with the global
        sidebar.
      </p>
      <Pilot apiUrl="/api/pilot">
        <PilotPopup
          position={corner}
          labels={{
            title: "Lab popup",
            openButton: "Open lab popup",
            inputPlaceholder: "Try: hello",
          }}
        />
      </Pilot>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PilotModal: centered backdrop, controlled                          */
/* ------------------------------------------------------------------ */

function PilotModalSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <h2 className="card-title">PilotModal</h2>
      <p className="muted" style={{ margin: 0 }}>
        Centered backdrop dialog. Controlled-only: this section owns the
        open state, the modal calls back when it wants to close
        (Escape / backdrop / X). Hosts the chat surface inside.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Open chat as modal
        </button>
      </div>
      <Pilot apiUrl="/api/pilot">
        <PilotModal
          open={open}
          onOpenChange={setOpen}
          labels={{
            title: "Lab modal",
            inputPlaceholder: "Type something",
          }}
        />
      </Pilot>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PilotSidebar: position + mode toggles                              */
/* ------------------------------------------------------------------ */

function PilotSidebarSection() {
  const [position, setPosition] = useState<Position>("right");
  const [mode, setMode] = useState<Mode>("overlay");
  return (
    <section className="card">
      <h2 className="card-title">PilotSidebar variations</h2>
      <p className="muted" style={{ margin: 0 }}>
        The global app sidebar (bottom-right of the page) is overlay-mode at
        position right. This section mounts a SECOND sidebar in its own
        nested <code>Pilot</code> with toggleable position and mode. Use the
        toggles below to flip its behavior.
      </p>
      <div className="row wrap" style={{ marginTop: 12, gap: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="subtle">Position:</span>
          {(["right", "left"] as Position[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`btn compact ${position === p ? "primary" : ""}`}
              onClick={() => setPosition(p)}
              aria-pressed={position === p}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="subtle">Mode:</span>
          {(["overlay", "push"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`btn compact ${mode === m ? "primary" : ""}`}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Position <code>{position}</code>, mode <code>{mode}</code>.
        {mode === "push"
          ? " Push mode shifts the page body to make room while open."
          : " Overlay mode floats above the page; nothing else moves."}
      </p>
      <Pilot apiUrl="/api/pilot">
        <PilotSidebar
          position={position}
          mode={mode}
          labels={{
            title: `Lab sidebar (${position}, ${mode})`,
            openButton: `Open lab sidebar (${position}, ${mode})`,
          }}
        />
      </Pilot>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PilotChatView: composer="full" / "suggestions" / "off"             */
/* ------------------------------------------------------------------ */

function ComposerModeSection() {
  const [mode, setMode] = useState<ComposerMode>("full");
  const description =
    mode === "full"
      ? "Default. Textarea + send button + suggestion chips."
      : mode === "suggestions"
        ? "Chips-only. The user can drive the chat via canned prompts but cannot type free text."
        : "Read-only. Composer AND chips hidden; useful when a runtime is purely observational.";
  return (
    <section className="card">
      <h2 className="card-title">PilotChatView composer modes</h2>
      <p className="muted" style={{ margin: 0 }}>{description}</p>
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        {(["full", "suggestions", "off"] as ComposerMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`btn compact ${mode === m ? "primary" : ""}`}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
          >
            composer="{m}"
          </button>
        ))}
      </div>
      <div className="headless-chat" style={{ marginTop: 16 }}>
        <Pilot apiUrl="/api/pilot">
          <PilotChatView
            composer={mode}
            suggestions={[
              "What can you help me with?",
              "Show me an example",
              "Explain this app in one line",
            ]}
            labels={{
              emptyState:
                mode === "off"
                  ? "Composer is off. Pretend an upstream runtime is feeding messages here."
                  : "Try a suggestion or type below.",
            }}
          />
        </Pilot>
      </div>
    </section>
  );
}
