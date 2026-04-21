"use client";

/**
 * DetailForm — a richer "new todo" form that the AI can fill and submit.
 *
 * Wired through `usePilotForm({ name: "detail" })`, which auto-registers
 * `set_detail_field`, `submit_detail`, and `reset_detail`. The submit handler
 * calls `appendTodo` with `fromAi: true` when the current submission was
 * triggered by the AI so the new-item badge reads as "AI".
 *
 * Validation uses Zod via `@hookform/resolvers/zod` so the error shapes match
 * the schema exactly.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { usePilotForm } from "agentickit";
import { z } from "zod";
import { useAppContext } from "../app-context";
import { makeId, priorityValues } from "../todo-types";

// Zod schema for the form. Colocated with the component on purpose.
const detailSchema = z.object({
  title: z.string().min(3, "Title needs at least 3 characters."),
  priority: z.enum(priorityValues),
  dueDate: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
      "Use YYYY-MM-DD format.",
    ),
  assignee: z.string().optional(),
  notes: z.string().optional(),
});

type DetailFormValues = z.infer<typeof detailSchema>;

const DEFAULTS: DetailFormValues = {
  title: "",
  priority: "medium",
  dueDate: "",
  assignee: "",
  notes: "",
};

export function DetailForm() {
  const { appendTodo, flashFormField, flashedFields } = useAppContext();

  const form = useForm<DetailFormValues>({
    defaultValues: DEFAULTS,
    resolver: zodResolver(detailSchema),
    mode: "onBlur",
  });

  // Track whether the next submit was triggered by the AI (via submit_detail)
  // so we can tag the resulting todo for the "AI" badge. Anything else (manual
  // click, Enter key in an input) clears the flag.
  const aiSubmitRef = useRef(false);

  // Wrap usePilotForm so we can observe set_field calls for the highlight
  // affordance. usePilotForm returns the form unchanged; we augment by also
  // patching setValue on the form to fire a flash, but only for calls that
  // originate from the AI (identifiable because set_detail_field uses
  // shouldValidate/shouldDirty/shouldTouch).
  //
  // Cast note: the agentickit package carries its own pinned react-hook-form
  // version (react@18-typed in its devDeps) while the example app uses
  // react@19. The runtime types match but pnpm resolves two distinct copies
  // of the d.ts, which TS treats as nominally different generic instances.
  // `Parameters<typeof usePilotForm>[0]` pulls the package's expected type
  // verbatim — bridging them safely since the underlying object is the same
  // react-hook-form return. See report for the recommended upstream fix.
  usePilotForm(
    form as unknown as Parameters<typeof usePilotForm>[0],
    { name: "detail" },
  );

  // Flag AI-driven submits. We register a tiny wrapper via context so the
  // submit button from the AI side can set the flag before triggering submit.
  // Simpler approach: rely on the package's own `submit_detail` handler — we
  // detect AI submits by observing that setValue came via set_detail_field.
  // To avoid over-engineering: patch setValue to mark any touched field as
  // AI-touched until the next render tick after submit.
  useEffect(() => {
    const originalSetValue = form.setValue;
    // We consider any AI-driven setValue as "AI touched this field"; manual
    // typing does not call setValue, so this cleanly discriminates.
    form.setValue = ((
      name: Parameters<typeof originalSetValue>[0],
      value: Parameters<typeof originalSetValue>[1],
      options?: Parameters<typeof originalSetValue>[2],
    ) => {
      const result = originalSetValue(name, value, options);
      // Only flash when all three options flags are set — that's the exact
      // signature set_detail_field uses. Manual programmatic setValue calls
      // we make in user code don't pass those flags.
      if (
        options?.shouldValidate &&
        options?.shouldDirty &&
        options?.shouldTouch &&
        typeof name === "string"
      ) {
        flashFormField(name);
        aiSubmitRef.current = true;
      }
      return result;
    }) as typeof originalSetValue;
    return () => {
      form.setValue = originalSetValue;
    };
  }, [form, flashFormField]);

  const onSubmit = useCallback(
    (values: DetailFormValues) => {
      const fromAi = aiSubmitRef.current;
      aiSubmitRef.current = false;
      appendTodo(
        {
          id: makeId(),
          text: values.title,
          done: false,
          priority: values.priority,
          ...(values.dueDate ? { dueDate: values.dueDate } : {}),
          ...(values.assignee ? { assignee: values.assignee } : {}),
          ...(values.notes ? { notes: values.notes } : {}),
        },
        { fromAi },
      );
      form.reset(DEFAULTS);
    },
    [appendTodo, form],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  // Tiny helper that computes the class for a field wrapper based on its
  // flash state. Rendering a class is simpler than imperative DOM poking.
  const fieldClass = (name: string, hasError: boolean) => {
    const parts = ["field"];
    if (hasError) parts.push("has-error");
    if (flashedFields.has(name)) parts.push("is-ai-flashing");
    return parts.join(" ");
  };

  return (
    <section className="panel detail-panel" aria-label="Add detailed todo">
      <header className="panel-header">
        <div>
          <h2 className="panel-title">New todo</h2>
          <p className="panel-sub">
            Fill the fields, or ask the copilot to do it for you.
          </p>
        </div>
      </header>

      <form
        className="detail-form"
        onSubmit={handleSubmit(onSubmit, () => {
          // Failed validation clears the AI-submit flag so a retry from the
          // UI doesn't accidentally mark the next manual submit as AI.
          aiSubmitRef.current = false;
        })}
        noValidate
      >
        <div className={fieldClass("title", Boolean(errors.title))}>
          <label htmlFor="detail-title" className="field-label">
            Title
          </label>
          <input
            id="detail-title"
            type="text"
            className="field-input"
            placeholder="Ship migration"
            autoComplete="off"
            {...register("title")}
          />
          {errors.title && (
            <span className="field-error" role="alert">
              {errors.title.message}
            </span>
          )}
        </div>

        <div className={fieldClass("priority", false)}>
          <label htmlFor="detail-priority" className="field-label">
            Priority
          </label>
          <select
            id="detail-priority"
            className="field-input"
            {...register("priority")}
          >
            {priorityValues.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className={fieldClass("dueDate", Boolean(errors.dueDate))}>
          <label htmlFor="detail-due" className="field-label">
            Due date
          </label>
          <input
            id="detail-due"
            type="date"
            className="field-input"
            {...register("dueDate")}
          />
          {errors.dueDate && (
            <span className="field-error" role="alert">
              {errors.dueDate.message}
            </span>
          )}
        </div>

        <div className={fieldClass("assignee", false)}>
          <label htmlFor="detail-assignee" className="field-label">
            Assignee
          </label>
          <input
            id="detail-assignee"
            type="text"
            className="field-input"
            placeholder="me, or someone's name"
            autoComplete="off"
            {...register("assignee")}
          />
        </div>

        <div
          className={`${fieldClass("notes", false)} field-wide`}
        >
          <label htmlFor="detail-notes" className="field-label">
            Notes
          </label>
          <textarea
            id="detail-notes"
            className="field-input field-textarea"
            rows={3}
            placeholder="Anything extra"
            {...register("notes")}
          />
        </div>

        <div className="field-wide detail-actions">
          <button
            type="button"
            className="btn btn-subtle"
            onClick={() => form.reset(DEFAULTS)}
          >
            Reset
          </button>
          <button type="submit" className="btn">
            Add todo
          </button>
        </div>
      </form>
    </section>
  );
}

