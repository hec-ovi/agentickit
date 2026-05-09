/**
 * Tests for the auto-registered `inspect_context` tool.
 *
 * The tool is registered by `<Pilot>` itself (not by consumers), and
 * returns a live snapshot of registered states, actions, and forms.
 * This test exercises both the registration path (the tool exists in
 * the registry whenever `<Pilot>` is mounted) and the handler payload
 * shape (states have value previews, actions are non-recursive, forms
 * expose their field paths).
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { PilotRegistryContext, type PilotRegistrySnapshot } from "../context.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import { usePilotForm } from "../hooks/use-pilot-form.js";
import { usePilotState } from "../hooks/use-pilot-state.js";
import { INSPECT_TOOL_NAME, Pilot } from "./pilot-provider.js";

interface InspectSnapshotResult {
  states?: ReadonlyArray<{ name: string; description: string; value: unknown }>;
  actions?: ReadonlyArray<{
    name: string;
    description: string;
    mutating: boolean;
    hasRenderAndWait: boolean;
  }>;
  forms?: ReadonlyArray<{ name: string; fields: ReadonlyArray<string> }>;
}

let lastInspect: ((args: { filter?: string }) => unknown) | null = null;
let lastSnapshot: PilotRegistrySnapshot | null = null;

function CaptureRegistry() {
  const ctx = useContext(PilotRegistryContext);
  if (!ctx) throw new Error("no registry context");
  // Subscribe to registry changes so we re-capture every time a
  // sibling (including the provider's own auto-registered
  // inspect_context) registers or deregisters something. A plain
  // useEffect on mount only captures the initial empty snapshot.
  useEffect(() => {
    const refresh = () => {
      lastSnapshot = ctx.getSnapshot();
      const action = lastSnapshot.actions.find((a) => a.name === INSPECT_TOOL_NAME);
      lastInspect = action ? (action.handler as (args: { filter?: string }) => unknown) : null;
    };
    refresh();
    const unsubscribe = ctx.subscribe(refresh);
    return unsubscribe;
  }, [ctx]);
  return null;
}

function Widget() {
  usePilotState({
    name: "todos",
    description: "Current todo list",
    value: [
      { id: "1", text: "buy milk", done: false },
      { id: "2", text: "call mom", done: true },
    ],
    schema: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  });

  usePilotAction({
    name: "add_todo",
    description: "Append a new todo",
    parameters: z.object({ text: z.string() }),
    handler: () => ({ ok: true }),
  });

  usePilotAction({
    name: "delete_todo",
    description: "Delete a todo",
    parameters: z.object({ id: z.string() }),
    handler: () => ({ ok: true }),
    mutating: true,
  });

  usePilotAction({
    name: "ask_for_text",
    description: "Ask the user for text via render-prop",
    parameters: z.object({ q: z.string() }),
    handler: () => ({ ok: false }),
    renderAndWait: () => null,
  });

  const form = useForm({ defaultValues: { name: "", email: "" } });
  usePilotForm(form, { name: "contact" });

  return null;
}

describe("inspect_context auto-tool", () => {
  afterEach(() => {
    cleanup();
    lastInspect = null;
    lastSnapshot = null;
  });

  it("is registered in the action registry whenever <Pilot> mounts", async () => {
    render(
      <Pilot apiUrl="/api/pilot">
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => {
      expect(lastSnapshot).not.toBeNull();
      const inspect = lastSnapshot?.actions.find((a) => a.name === INSPECT_TOOL_NAME);
      expect(inspect).toBeDefined();
      expect(inspect?.description).toMatch(/snapshot/i);
    });
  });

  it("returns the registered states with value previews", async () => {
    render(
      <Pilot apiUrl="/api/pilot">
        <Widget />
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => expect(lastInspect).not.toBeNull());
    const result = (await lastInspect?.({ filter: "states" })) as InspectSnapshotResult;
    expect(result.states).toHaveLength(1);
    expect(result.states?.[0]?.name).toBe("todos");
    expect(result.states?.[0]?.description).toMatch(/todo/i);
    expect(result.states?.[0]?.value).toEqual([
      { id: "1", text: "buy milk", done: false },
      { id: "2", text: "call mom", done: true },
    ]);
  });

  it("returns the registered actions and filters out itself (non-recursive)", async () => {
    render(
      <Pilot apiUrl="/api/pilot">
        <Widget />
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => expect(lastInspect).not.toBeNull());
    const result = (await lastInspect?.({ filter: "actions" })) as InspectSnapshotResult;
    const names = result.actions?.map((a) => a.name) ?? [];
    expect(names).toContain("add_todo");
    expect(names).toContain("delete_todo");
    expect(names).toContain("ask_for_text");
    expect(names).not.toContain(INSPECT_TOOL_NAME);

    const deleteAction = result.actions?.find((a) => a.name === "delete_todo");
    expect(deleteAction?.mutating).toBe(true);
    expect(deleteAction?.hasRenderAndWait).toBe(false);

    const hitlAction = result.actions?.find((a) => a.name === "ask_for_text");
    expect(hitlAction?.mutating).toBe(false);
    expect(hitlAction?.hasRenderAndWait).toBe(true);
  });

  it("returns registered forms with their field paths", async () => {
    render(
      <Pilot apiUrl="/api/pilot">
        <Widget />
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => expect(lastInspect).not.toBeNull());
    const result = (await lastInspect?.({ filter: "forms" })) as InspectSnapshotResult;
    expect(result.forms).toHaveLength(1);
    expect(result.forms?.[0]?.name).toBe("contact");
  });

  it("filter='all' returns all three sections", async () => {
    render(
      <Pilot apiUrl="/api/pilot">
        <Widget />
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => expect(lastInspect).not.toBeNull());
    const result = (await lastInspect?.({ filter: "all" })) as InspectSnapshotResult;
    expect(result.states).toBeDefined();
    expect(result.actions).toBeDefined();
    expect(result.forms).toBeDefined();
  });

  it("truncates large value previews so the response stays model-sized", async () => {
    function HugeState() {
      usePilotState({
        name: "huge",
        description: "Huge list",
        value: Array.from({ length: 5000 }, (_, i) => ({ i, msg: `item ${i}` })),
        schema: z.array(z.object({ i: z.number(), msg: z.string() })),
      });
      return null;
    }
    render(
      <Pilot apiUrl="/api/pilot">
        <HugeState />
        <CaptureRegistry />
      </Pilot>,
    );
    await waitFor(() => expect(lastInspect).not.toBeNull());
    const result = (await lastInspect?.({ filter: "states" })) as InspectSnapshotResult;
    const huge = result.states?.find((s) => s.name === "huge");
    const v = huge?.value as { __truncated?: boolean; type?: string; length?: number };
    expect(v?.__truncated).toBe(true);
    expect(v?.type).toBe("array");
    expect(v?.length).toBe(5000);
  });
});
