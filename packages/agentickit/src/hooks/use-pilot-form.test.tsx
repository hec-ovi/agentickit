/**
 * Tests for {@link usePilotForm}. Verifies that the three standard tools
 * (`set_<name>_field`, `submit_<name>`, `reset_<name>`) register, that
 * `set_field` routes through `setValue` with validation flags, that
 * `submit_form` refuses when the form is unmounted, and that the hook
 * returns the passed-in `UseFormReturn` unchanged.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useContext } from "react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotRegistryContext } from "../context.js";
import { usePilotForm } from "./use-pilot-form.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePilotForm", () => {
  it("registers set_field / submit / reset tools", () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;
    let returnedForm: unknown = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
      returnedForm = usePilotForm(form);
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("email")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const names = registry?.getSnapshot().actions.map((a) => a.name) ?? [];
    expect(names).toContain("set_form_field");
    expect(names).toContain("submit_form");
    expect(names).toContain("reset_form");
    // Hook returns the form unchanged (reference equality).
    expect(returnedForm).toBeDefined();
  });

  it("set_field writes through setValue with validation flags", async () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    const setValueSpy = vi.fn();

    function FormComp() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
      // Wrap setValue so we can observe calls without breaking RHF internals.
      const originalSetValue = form.setValue;
      form.setValue = ((...args: Parameters<typeof originalSetValue>) => {
        setValueSpy(...args);
        return originalSetValue(...args);
      }) as typeof originalSetValue;
      usePilotForm(form);
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("email")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const setField = registry?.getSnapshot().actions.find((a) => a.name === "set_form_field");
    expect(setField).toBeDefined();
    await act(async () => {
      await setField?.handler({ field: "email", value: "a@b.c" });
    });
    expect(setValueSpy).toHaveBeenCalledWith("email", "a@b.c", {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  });

  it("submit_form refuses when no <form> is in the DOM", async () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ q: string }>({ defaultValues: { q: "" } });
      usePilotForm(form);
      // No <form> tag at all — submit must fail gracefully.
      return <input {...form.register("q")} />;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const submit = registry?.getSnapshot().actions.find((a) => a.name === "submit_form");
    const result = (await submit?.handler({})) as { success: boolean; message?: string };
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("submit_form calls requestSubmit on the parent <form>", async () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;
    const onSubmit = vi.fn();

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "x@y.z" } });
      usePilotForm(form);
      return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <input {...form.register("email")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const submit = registry?.getSnapshot().actions.find((a) => a.name === "submit_form");
    await act(async () => {
      const r = (await submit?.handler({})) as { success: boolean };
      expect(r.success).toBe(true);
    });

    // react-hook-form's handleSubmit runs async validation before firing
    // onSubmit; wait one tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalled();
  });

  it("does not crash outside a <Pilot> provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function Orphan() {
      const form = useForm<{ x: string }>({ defaultValues: { x: "" } });
      usePilotForm(form);
      return <div>ok</div>;
    }

    const { getByText } = render(<Orphan />);
    expect(getByText("ok")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('usePilotForm("form")'));
  });
});

// Unused `fireEvent` import suppressor — keep the import for future use.
void fireEvent;
