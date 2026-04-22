/**
 * Collapsible "what can this copilot do" panel for `<PilotSidebar>`.
 *
 * Surfaces everything registered in `PilotRegistryContext` — actions, state
 * entries, and forms — as a dense row list inspired by Raycast's command
 * palette. Closed by default so it doesn't compete with the empty state or
 * the message stream for attention.
 *
 * Why `useSyncExternalStore` rather than reading the registry through a
 * context re-render path: the registry mutates on every `usePilotState`
 * value update (every keystroke in a form). Rendering the panel on each of
 * those would tax the sidebar. `useSyncExternalStore` lets React batch
 * re-reads and skips renders when the relevant slice hasn't changed.
 *
 * The panel renders only what's currently registered via `usePilotAction`,
 * `usePilotState`, and `usePilotForm`. What the user sees here is exactly
 * what the model can invoke — no drift with the `.pilot/` source of truth.
 */

import { type ReactElement, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { PilotRegistryContext, type PilotRegistrySnapshot } from "../context.js";

export interface PilotSkillsPanelProps {
  /**
   * Invoked when the user clicks a skill row. The sidebar passes this to
   * prefill the composer with a starter prompt; the panel itself doesn't
   * touch chat state.
   */
  onPickPrompt: (prompt: string) => void;
  /**
   * Label shown on the collapsed trigger. Overridable because "skills" is a
   * loaded term in some consumer domains.
   */
  triggerLabel?: string;
}

const EMPTY_SNAPSHOT: PilotRegistrySnapshot = Object.freeze({
  actions: [],
  states: [],
  forms: [],
});

/**
 * Render the skills strip. Returns `null` when there's nothing registered
 * (prevents an empty button from appearing in hook-only mode).
 */
export function PilotSkillsPanel(props: PilotSkillsPanelProps): ReactElement | null {
  const { onPickPrompt, triggerLabel = "What can this copilot do?" } = props;
  const registry = useContext(PilotRegistryContext);
  const [open, setOpen] = useState(false);

  // Subscribe to registry changes. When the registry is absent (sidebar
  // rendered outside `<Pilot>`) we hand back a frozen empty snapshot so the
  // hook still has stable references.
  const snapshot = useSyncExternalStore(
    registry?.subscribe ?? noopSubscribe,
    registry?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );

  const hasAnything =
    snapshot.actions.length > 0 || snapshot.states.length > 0 || snapshot.forms.length > 0;

  // Pre-compute prompts so clicking a row has a stable text prefill. We do
  // this lazily here (not in the provider) because prompts are UI-concern.
  const onClickAction = useCallback(
    (name: string) => {
      onPickPrompt(starterPromptForAction(name));
    },
    [onPickPrompt],
  );
  const onClickState = useCallback(
    (name: string) => {
      onPickPrompt(`What's the current ${name.replace(/_/g, " ")}?`);
    },
    [onPickPrompt],
  );
  const onClickForm = useCallback(
    (name: string) => {
      onPickPrompt(`Fill out the ${name.replace(/_/g, " ")} form with `);
    },
    [onPickPrompt],
  );

  if (!hasAnything) return null;

  return (
    <div className="pilot-skills" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="pilot-skills-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="pilot-skills-body"
      >
        <span>{triggerLabel}</span>
        <span className="pilot-skills-caret" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <ul
          id="pilot-skills-body"
          className="pilot-skills-list"
          aria-label="Available capabilities"
        >
          {snapshot.actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className="pilot-skills-row"
                onClick={() => onClickAction(action.name)}
              >
                <span className="pilot-skills-name">{action.name}</span>
                <span className="pilot-skills-desc">{firstLine(action.description)}</span>
              </button>
            </li>
          ))}
          {snapshot.states.map((state) => (
            <li key={state.id}>
              <button
                type="button"
                className="pilot-skills-row"
                onClick={() => onClickState(state.name)}
              >
                <span className="pilot-skills-name">{state.name}</span>
                <span className="pilot-skills-desc">reads {firstLine(state.description)}</span>
              </button>
            </li>
          ))}
          {snapshot.forms.map((form) => (
            <li key={form.id}>
              <button
                type="button"
                className="pilot-skills-row"
                onClick={() => onClickForm(form.name)}
              >
                <span className="pilot-skills-name">{form.name}</span>
                <span className="pilot-skills-desc">
                  can fill {form.name.replace(/_/g, " ")} form
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Produce a sensible starter prompt from an action name. Handles the common
 * verb-prefix shapes (`add_foo`, `remove_foo`, `show_foo`, `set_foo_field`,
 * `toggle_foo`) and falls back to a generic "Use the X action" otherwise.
 *
 * The goal isn't to author a perfect prompt — it's to land the user in the
 * composer with a head start so they only need to finish the sentence.
 */
function starterPromptForAction(name: string): string {
  const words = name.split(/[_-]/);
  const verb = words[0] ?? name;
  const rest = words.slice(1).join(" ");
  switch (verb) {
    case "add":
    case "create":
    case "make":
      return `Add a new ${rest} `;
    case "remove":
    case "delete":
    case "clear":
      return `Remove ${rest} `;
    case "show":
    case "open":
    case "display":
      return `Show me ${rest} `;
    case "hide":
    case "close":
      return `Close the ${rest} `;
    case "toggle":
      return `Toggle ${rest} `;
    case "update":
    case "change":
    case "set":
      return `Update ${rest} `;
    case "submit":
      return `Submit ${rest} `;
    default:
      return `Use the "${name}" action to `;
  }
}

/** First line of a description, collapsed to a single line and trimmed. */
function firstLine(desc: string): string {
  const firstNl = desc.indexOf("\n");
  const line = firstNl === -1 ? desc : desc.slice(0, firstNl);
  return line.trim();
}

function noopSubscribe(): () => void {
  return () => undefined;
}
