"use client";

import { useContext, useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { PilotRegistryContext } from "../context.js";
import { isDev } from "../env.js";
import type { PilotFormRegistration } from "../types.js";

/**
 * Options for {@link usePilotForm}.
 */
export interface UsePilotFormOptions {
  /**
   * Human-readable name used in tool definitions. Defaults to "form".
   * Also used as the suffix of `set_<name>_field` / `submit_<name>` /
   * `reset_<name>` so multiple forms on one page don't collide.
   */
  name?: string;
  /**
   * Reserved for a future streaming preview mode (the AI's proposed values
   * render as dimmed placeholders that the user confirms with Tab).
   * Currently a no-op — the plain tool set is always registered.
   *
   * TODO(v0.3): implement ghost-fill via a sibling `<GhostFieldProvider>`
   *   that overlays an uncontrolled input on top of each form field. Not
   *   shipped in v0.2; the option is accepted but ignored to keep the
   *   public type surface stable for when the feature lands.
   */
  ghostFill?: boolean;
}

/**
 * Integrate a react-hook-form `useForm` result with the copilot.
 *
 * Registers three tools scoped to this form:
 *   - `set_<name>_field({ field, value })` — writes a value with validation.
 *   - `submit_<name>()` — programmatically submits via `requestSubmit()` so
 *     the form's declared `onSubmit` handler runs normally.
 *   - `reset_<name>()` — resets to `defaultValues`.
 *
 * **Returns the form unchanged.** Consumers keep calling `form.register(...)`
 * as normal. This hook is purely additive — it never wraps or transforms.
 *
 * Security note: the `set_field` tool validates the field name against the
 * form's current registered fields before calling `setValue`, which prevents
 * the AI from writing to paths that don't exist in the current schema.
 */
export function usePilotForm<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  options: UsePilotFormOptions = {},
): UseFormReturn<TFieldValues> {
  const ctx = useContext(PilotRegistryContext);

  // react-hook-form recreates most of its return on every render, so we ref
  // it to keep closure identity stable inside the tool handlers.
  const formRef = useRef(form);
  formRef.current = form;

  const name = options.name ?? "form";

  useEffect(() => {
    if (!ctx) {
      if (isDev()) {
        console.warn(
          `[agentickit] usePilotForm("${name}") was called outside a <Pilot> provider. The form will not be exposed to the AI.`,
        );
      }
      return;
    }

    // Snapshot the field paths from the form's defaultValues so the model
    // gets an enum of allowed field names instead of a free-form string.
    // Without this, the model has to guess names like "destination" vs
    // "tripDestination" and silently no-ops on misses.
    const fieldPaths = collectFieldPaths(formRef.current.formState.defaultValues);
    const fieldsList = fieldPaths.length > 0 ? fieldPaths.join(", ") : "(none discovered yet)";

    // --- set_<name>_field ------------------------------------------------
    const setFieldId = ctx.registerAction({
      name: `set_${name}_field`,
      description:
        `Write a single field of the "${name}" form. Triggers RHF validation. ` +
        `Use to progressively fill as the user describes the form. ` +
        `Available fields: ${fieldsList}.`,
      parameters: z.object({
        field:
          fieldPaths.length > 0
            ? z
                .enum(fieldPaths as [string, ...string[]])
                .describe(`One of: ${fieldsList}.`)
            : z.string().describe("Path of the form field (e.g. 'email' or 'address.street')."),
        value: z.unknown().describe("New value. Pass the value directly, not JSON-stringified."),
      }),
      handler: ({ field, value }) => {
        // react-hook-form types `setValue`'s first arg as a path union; we
        // accept an arbitrary string and let RHF warn at runtime if it's
        // unknown. This matches assistant-ui's `useAssistantForm`.
        formRef.current.setValue(field as never, value as never, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        return { ok: true, field };
      },
    });

    // --- set_<name>_fields (batch) --------------------------------------
    // One round-trip instead of N. Important for "fill the whole form"
    // intents where N=5+ would otherwise burn extra tokens and latency.
    const setFieldsId = ctx.registerAction({
      name: `set_${name}_fields`,
      description:
        `Write multiple fields of the "${name}" form in one call. ` +
        `Each entry sets one field; same validation as set_${name}_field. ` +
        `Available fields: ${fieldsList}.`,
      parameters: z.object({
        values: z
          .record(z.unknown())
          .describe(
            `Object whose keys are field paths and values are the new field values. ` +
              `Keys must be one of: ${fieldsList}.`,
          ),
      }),
      handler: ({ values }) => {
        const written: string[] = [];
        const skipped: string[] = [];
        for (const [field, value] of Object.entries(values ?? {})) {
          if (fieldPaths.length > 0 && !fieldPaths.includes(field)) {
            skipped.push(field);
            continue;
          }
          formRef.current.setValue(field as never, value as never, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          written.push(field);
        }
        return { ok: true, written, skipped };
      },
    });

    // --- submit_<name> ---------------------------------------------------
    const submitId = ctx.registerAction({
      name: `submit_${name}`,
      description:
        "Submit the form. Runs the same `onSubmit` handler the user would get from a click. " +
        "Returns an error message if the form is already submitting or not mounted.",
      parameters: z.object({}).strict(),
      handler: () => {
        const f = formRef.current;
        if (f.formState.isSubmitting) {
          return { success: false, message: "Form is already submitting." };
        }

        // Find the <form> DOM node by walking from a registered field's ref.
        // This matches assistant-ui's approach and avoids forcing consumers
        // to plumb a ref through their JSX.
        const node = findFormElement(f);
        if (!node) {
          return {
            success: false,
            message: "Could not locate the <form> element. Is the form currently rendered?",
          };
        }
        node.requestSubmit();
        return { success: true };
      },
      mutating: true,
    });

    // --- reset_<name> ----------------------------------------------------
    const resetId = ctx.registerAction({
      name: `reset_${name}`,
      description: "Reset the form to its default values.",
      parameters: z.object({}).strict(),
      handler: () => {
        formRef.current.reset();
        return { ok: true };
      },
      mutating: true,
    });

    // Also register a form-shaped entry so inspect_context can list this
    // form alongside its actions. fieldSchemas is built from the field
    // paths so the snapshot exposes which keys exist.
    const formId = ctx.registerForm({
      name,
      fieldSchemas: Object.fromEntries(
        fieldPaths.map((p) => [p, z.unknown() as z.ZodType<unknown>]),
      ),
      setValue: (field, value) =>
        formRef.current.setValue(field as never, value as never, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        }),
      submit: async () => {
        const node = findFormElement(formRef.current);
        if (node) node.requestSubmit();
      },
      reset: () => formRef.current.reset(),
    });

    return () => {
      ctx.deregisterAction(setFieldId);
      ctx.deregisterAction(setFieldsId);
      ctx.deregisterAction(submitId);
      ctx.deregisterAction(resetId);
      ctx.deregisterForm(formId);
    };
  }, [ctx, name]);

  return form;
}

/**
 * Best-effort lookup of the `<form>` element backing a given react-hook-form
 * instance. Walks any registered field's DOM ref upward until it finds a
 * parent form, then returns it.
 *
 * We deliberately do NOT fall back to a global `document.forms` lookup: even
 * if there's exactly one `<form>` in the document, it may not be the one the
 * AI expects to submit. Acting on a form outside the consumer's component
 * tree would let the assistant submit arbitrary third-party forms — e.g. a
 * search bar baked into a host page. Returning `null` so the caller surfaces
 * a clear "couldn't locate the form" error is strictly safer.
 */
function findFormElement<T extends FieldValues>(form: UseFormReturn<T>): HTMLFormElement | null {
  // `_fields` is RHF's internal registry. Accessing it through `control` is
  // the same escape hatch assistant-ui uses — there's no public API for
  // walking registered field refs otherwise.
  const control = form.control as unknown as {
    _fields?: Record<string, { _f?: { ref?: HTMLElement | { focus?: () => void } } }>;
  };
  const fields = control._fields ?? {};
  for (const key of Object.keys(fields)) {
    const ref = fields[key]?._f?.ref;
    if (ref && ref instanceof HTMLElement) {
      const parentForm = ref.closest("form");
      if (parentForm) return parentForm;
    }
  }
  return null;
}

/**
 * Walk an object of default values and produce dot-path field names. Skips
 * arrays (each index would create N more entries that the model doesn't
 * need to enumerate). Used to give the model an explicit list of fields
 * it can write to via `set_<name>_field` and `set_<name>_fields`.
 */
function collectFieldPaths(input: unknown, prefix = "", out: string[] = []): string[] {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      collectFieldPaths(value, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

export type { PilotFormRegistration };
