/**
 * Tests for `<PilotSkillsPanel>` — the collapsible capabilities list
 * sourced from `PilotRegistryContext`.
 *
 *   1. Collapsed by default — shows the trigger only.
 *   2. When opened, lists every registered action / state / form by name.
 *   3. Clicking an action row fires `onPickPrompt` with a text prefill.
 *   4. Returns null when nothing is registered (no empty panel artifact).
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  PilotRegistryContext,
  type PilotRegistryContextValue,
  type PilotRegistrySnapshot,
} from "../context.js";
import { PilotSkillsPanel } from "./pilot-skills-panel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Build a stub registry context that returns a fixed snapshot. The real
 * registry lives in `<Pilot>`; wiring it up here would be heavyweight and
 * distract from testing the panel itself.
 */
function makeRegistry(snapshot: PilotRegistrySnapshot): PilotRegistryContextValue {
  const subscribers = new Set<() => void>();
  return {
    registerAction: vi.fn(() => "id"),
    deregisterAction: vi.fn(),
    registerState: vi.fn(() => "id"),
    updateStateValue: vi.fn(),
    deregisterState: vi.fn(),
    registerForm: vi.fn(() => "id"),
    deregisterForm: vi.fn(),
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

function Provider(props: {
  children: ReactNode;
  registry: PilotRegistryContextValue;
}): ReactNode {
  return (
    <PilotRegistryContext.Provider value={props.registry}>
      {props.children}
    </PilotRegistryContext.Provider>
  );
}

describe("<PilotSkillsPanel>", () => {
  it("renders null when nothing is registered", () => {
    const registry = makeRegistry({ actions: [], states: [], forms: [] });
    const { container } = render(
      <Provider registry={registry}>
        <PilotSkillsPanel onPickPrompt={vi.fn()} />
      </Provider>,
    );
    expect(container.querySelector(".pilot-skills")).toBeNull();
  });

  it("renders a trigger when actions are registered, collapsed by default", () => {
    const registry = makeRegistry({
      actions: [
        {
          id: "a1",
          name: "add_todo",
          description: "Add a new todo to the list",
          parameters: z.object({ text: z.string() }),
          handler: async () => undefined,
        },
      ],
      states: [],
      forms: [],
    });
    const { getByRole, queryByText } = render(
      <Provider registry={registry}>
        <PilotSkillsPanel onPickPrompt={vi.fn()} />
      </Provider>,
    );
    // The trigger button is present.
    const trigger = getByRole("button", { name: /what can this copilot do/i });
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // The action row is NOT rendered yet (collapsed).
    expect(queryByText("add_todo")).toBeNull();
  });

  it("expands to show registered actions, states, and forms", () => {
    const registry = makeRegistry({
      actions: [
        {
          id: "a1",
          name: "add_todo",
          description: "Add a new todo",
          parameters: z.object({ text: z.string() }),
          handler: async () => undefined,
        },
      ],
      states: [
        {
          id: "s1",
          name: "todos",
          description: "current todo list",
          value: [],
          schema: z.array(z.unknown()),
        },
      ],
      forms: [
        {
          id: "f1",
          name: "detail",
          fieldSchemas: {},
          setValue: vi.fn(),
          submit: vi.fn(async () => {}),
          reset: vi.fn(),
        },
      ],
    });
    const { getByRole, getByText } = render(
      <Provider registry={registry}>
        <PilotSkillsPanel onPickPrompt={vi.fn()} />
      </Provider>,
    );
    fireEvent.click(getByRole("button", { name: /what can this copilot do/i }));
    expect(getByText("add_todo")).toBeDefined();
    expect(getByText("todos")).toBeDefined();
    expect(getByText("detail")).toBeDefined();
    // Descriptions are visible too.
    expect(getByText("Add a new todo")).toBeDefined();
    expect(getByText(/reads current todo list/i)).toBeDefined();
  });

  it("clicking an action row calls onPickPrompt with a starter text", () => {
    const onPickPrompt = vi.fn();
    const registry = makeRegistry({
      actions: [
        {
          id: "a1",
          name: "add_todo",
          description: "Add a new todo",
          parameters: z.object({ text: z.string() }),
          handler: async () => undefined,
        },
      ],
      states: [],
      forms: [],
    });
    const { getByRole, getByText } = render(
      <Provider registry={registry}>
        <PilotSkillsPanel onPickPrompt={onPickPrompt} />
      </Provider>,
    );
    fireEvent.click(getByRole("button", { name: /what can this copilot do/i }));
    // Find the action row's button and click it. The name shows up as a
    // span inside the button, so clicking the span's parent button works.
    const row = getByText("add_todo").closest("button");
    expect(row).toBeTruthy();
    fireEvent.click(row as HTMLButtonElement);
    expect(onPickPrompt).toHaveBeenCalledTimes(1);
    // Starter prompt must begin with the `add` verb template.
    expect(onPickPrompt.mock.calls[0][0]).toMatch(/^Add a new todo /);
  });
});
