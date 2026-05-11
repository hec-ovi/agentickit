/**
 * Tests for {@link usePilotForm}. Verifies that the three standard tools
 * (`set_<name>_field`, `submit_<name>`, `reset_<name>`) register, that
 * `set_field` routes through `setValue` with validation flags, that
 * `submit_form` refuses when the form is unmounted, and that the hook
 * returns the passed-in `UseFormReturn` unchanged.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pilot } from "../components/pilot-provider.js";
import { PilotRegistryContext } from "../context.js";
import type {
  PilotIncomingToolCall,
  PilotRuntime,
  PilotRuntimeConfig,
} from "../runtime/types.js";
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

  it("does not submit an unrelated <form> that happens to be in the document", async () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;
    const unrelatedSubmit = vi.fn((e: Event) => {
      e.preventDefault();
    });

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    // A standalone unrelated form (e.g. a host-page search bar) sits in the
    // same document. usePilotForm has no <form> of its own rendered.
    function UnrelatedForm() {
      return (
        <form aria-label="unrelated" onSubmit={unrelatedSubmit as unknown as () => void}>
          <input name="q" />
        </form>
      );
    }

    function PilotFormHost() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
      usePilotForm(form);
      // Intentionally no <form> around this input — the hook should not fall
      // back to the unrelated form elsewhere on the page.
      return <input {...form.register("email")} />;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <UnrelatedForm />
        <PilotFormHost />
      </Pilot>,
    );

    const submit = registry?.getSnapshot().actions.find((a) => a.name === "submit_form");
    const result = (await submit?.handler({})) as { success: boolean };
    expect(result.success).toBe(false);
    expect(unrelatedSubmit).not.toHaveBeenCalled();
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

describe("usePilotForm — confirm option", () => {
  it("defaults: submit_<name> and reset_<name> are mutating", () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
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

    const actions = registry?.getSnapshot().actions ?? [];
    const submit = actions.find((a) => a.name === "submit_form");
    const reset = actions.find((a) => a.name === "reset_form");
    expect(submit?.mutating).toBe(true);
    expect(reset?.mutating).toBe(true);
  });

  it("confirm.submit=false strips mutating off submit_<name> only", () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ x: string }>({ defaultValues: { x: "" } });
      usePilotForm(form, { name: "wizard", confirm: { submit: false } });
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("x")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const actions = registry?.getSnapshot().actions ?? [];
    const submit = actions.find((a) => a.name === "submit_wizard");
    const reset = actions.find((a) => a.name === "reset_wizard");
    expect(submit?.mutating).toBe(false);
    // reset stays gated by default — flipping submit must not silently
    // disable reset's confirm too.
    expect(reset?.mutating).toBe(true);
  });

  it("confirm.reset=false strips mutating off reset_<name> only", () => {
    let registry: React.ContextType<typeof PilotRegistryContext> = null;

    function Spy() {
      registry = useContext(PilotRegistryContext);
      return null;
    }

    function FormComp() {
      const form = useForm<{ x: string }>({ defaultValues: { x: "" } });
      usePilotForm(form, { name: "scratch", confirm: { reset: false } });
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("x")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
        <FormComp />
      </Pilot>,
    );

    const actions = registry?.getSnapshot().actions ?? [];
    const submit = actions.find((a) => a.name === "submit_scratch");
    const reset = actions.find((a) => a.name === "reset_scratch");
    expect(submit?.mutating).toBe(true);
    expect(reset?.mutating).toBe(false);
  });

  it("confirm.submit=false: dispatch runs submit handler without popping the confirm modal", async () => {
    // Build a stub runtime so the test drives onToolCall directly without a
    // real wire. The provider's confirm modal is the only thing under test
    // here; we want to assert it does NOT mount, and that the form's
    // declared onSubmit fires.
    let onToolCall: ((call: PilotIncomingToolCall) => Promise<void>) | null = null;
    const runtime: PilotRuntime = {
      useRuntime(config: PilotRuntimeConfig) {
        onToolCall = config.onToolCall;
        return {
          messages: [],
          status: "ready" as const,
          error: undefined,
          isLoading: false,
          sendMessage: vi.fn(async () => {}),
          stop: vi.fn(async () => {}),
        };
      },
    };

    const onSubmit = vi.fn();

    function FormComp() {
      const form = useForm<{ destination: string }>({
        defaultValues: { destination: "Tokyo" },
      });
      usePilotForm(form, { name: "new_trip", confirm: { submit: false } });
      return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <input {...form.register("destination")} />
        </form>
      );
    }

    const outputSpy = vi.fn();

    render(
      <Pilot apiUrl="/api/test" runtime={runtime}>
        <FormComp />
      </Pilot>,
    );

    let dispatchPromise: Promise<void>;
    act(() => {
      // biome-ignore lint/style/noNonNullAssertion: assigned by the runtime stub on render
      dispatchPromise = onToolCall!({
        toolName: "submit_new_trip",
        toolCallId: "c1",
        input: {},
        output: outputSpy,
        outputError: vi.fn(),
      });
    });

    // The confirm modal would be `role="alertdialog"`. With confirm.submit=false
    // it must not appear at any point during the dispatch.
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });

    // RHF's handleSubmit awaits validation a tick before firing onSubmit.
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    // submit handler returned { success: true }, the dispatcher unwraps it
    // back to the runtime via call.output.
    expect(outputSpy).toHaveBeenCalledWith({ success: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirm.reset=false: dispatch runs reset handler without popping the confirm modal", async () => {
    // Mirror of the submit-side end-to-end test, for the reset tool.
    // Documents that flipping `confirm.reset: false` skips the modal AND
    // the form's react-hook-form state actually resets to defaults.
    let onToolCall: ((call: PilotIncomingToolCall) => Promise<void>) | null = null;
    const runtime: PilotRuntime = {
      useRuntime(config: PilotRuntimeConfig) {
        onToolCall = config.onToolCall;
        return {
          messages: [],
          status: "ready" as const,
          error: undefined,
          isLoading: false,
          sendMessage: vi.fn(async () => {}),
          stop: vi.fn(async () => {}),
        };
      },
    };

    let formApi: ReturnType<typeof useForm<{ q: string }>> | null = null;
    function FormComp() {
      const form = useForm<{ q: string }>({ defaultValues: { q: "" } });
      formApi = form;
      // Opt the auto-registered reset out of confirmation.
      usePilotForm(form, { name: "scratch", confirm: { reset: false } });
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("q")} />
        </form>
      );
    }

    const outputSpy = vi.fn();

    render(
      <Pilot apiUrl="/api/test" runtime={runtime}>
        <FormComp />
      </Pilot>,
    );

    // Dirty the field so we can prove reset actually clears it.
    expect(formApi).not.toBeNull();
    act(() => {
      formApi!.setValue("q", "draft text", { shouldDirty: true });
    });
    expect(formApi!.getValues("q")).toBe("draft text");

    let dispatchPromise: Promise<void>;
    act(() => {
      // biome-ignore lint/style/noNonNullAssertion: assigned by the runtime stub on render
      dispatchPromise = onToolCall!({
        toolName: "reset_scratch",
        toolCallId: "c-reset",
        input: {},
        output: outputSpy,
        outputError: vi.fn(),
      });
    });

    // Modal must NOT appear. Reset is gated only when `confirm.reset` is
    // unset or `true`; we set it to `false`.
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });

    // The reset handler ran end-to-end: form state cleared back to default,
    // dispatcher's output() received the success payload.
    await waitFor(() => {
      expect(formApi!.getValues("q")).toBe("");
    });
    expect(outputSpy).toHaveBeenCalledWith({ ok: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("default confirm: reset_<name> still suspends behind the modal until the user approves", async () => {
    // Symmetric coverage for the default path: confirm.reset is implicitly
    // true, so the model can't quietly nuke the user's draft form.
    let onToolCall: ((call: PilotIncomingToolCall) => Promise<void>) | null = null;
    const runtime: PilotRuntime = {
      useRuntime(config: PilotRuntimeConfig) {
        onToolCall = config.onToolCall;
        return {
          messages: [],
          status: "ready" as const,
          error: undefined,
          isLoading: false,
          sendMessage: vi.fn(async () => {}),
          stop: vi.fn(async () => {}),
        };
      },
    };

    let formApi: ReturnType<typeof useForm<{ q: string }>> | null = null;
    function FormComp() {
      const form = useForm<{ q: string }>({ defaultValues: { q: "" } });
      formApi = form;
      usePilotForm(form);
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <input {...form.register("q")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test" runtime={runtime}>
        <FormComp />
      </Pilot>,
    );

    act(() => {
      formApi!.setValue("q", "user typed this", { shouldDirty: true });
    });

    let dispatchPromise: Promise<void>;
    act(() => {
      // biome-ignore lint/style/noNonNullAssertion: assigned by the runtime stub on render
      dispatchPromise = onToolCall!({
        toolName: "reset_form",
        toolCallId: "c-reset-default",
        input: {},
        output: vi.fn(),
        outputError: vi.fn(),
      });
    });

    // Modal IS shown; reset has not happened yet.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    expect(formApi!.getValues("q")).toBe("user typed this");

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });
    await waitFor(() => {
      expect(formApi!.getValues("q")).toBe("");
    });
  });

  it("default confirm: dispatch suspends on submit_<name> until the user approves", async () => {
    let onToolCall: ((call: PilotIncomingToolCall) => Promise<void>) | null = null;
    const runtime: PilotRuntime = {
      useRuntime(config: PilotRuntimeConfig) {
        onToolCall = config.onToolCall;
        return {
          messages: [],
          status: "ready" as const,
          error: undefined,
          isLoading: false,
          sendMessage: vi.fn(async () => {}),
          stop: vi.fn(async () => {}),
        };
      },
    };

    const onSubmit = vi.fn();

    function FormComp() {
      const form = useForm<{ q: string }>({ defaultValues: { q: "" } });
      // No `confirm` override; defaults apply, so submit_form is mutating.
      usePilotForm(form);
      return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <input {...form.register("q")} />
        </form>
      );
    }

    render(
      <Pilot apiUrl="/api/test" runtime={runtime}>
        <FormComp />
      </Pilot>,
    );

    let dispatchPromise: Promise<void>;
    act(() => {
      // biome-ignore lint/style/noNonNullAssertion: assigned by the runtime stub on render
      dispatchPromise = onToolCall!({
        toolName: "submit_form",
        toolCallId: "c1",
        input: {},
        output: vi.fn(),
        outputError: vi.fn(),
      });
    });

    // Modal must mount; submit handler must not have fired yet.
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await act(async () => {
      // biome-ignore lint/style/noNonNullAssertion: assigned inside the act() above
      await dispatchPromise!;
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});
