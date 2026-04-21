"use client";

import {
  Pilot,
  PilotSidebar,
  usePilotAction,
  usePilotState,
} from "agentickit";
import { z } from "zod";
import {
  AppProvider,
  type ChartSource,
  type ChartType,
  useAppContext,
} from "./app-context";
import { DetailForm } from "./components/detail-form";
import { StatsPanel } from "./components/stats-panel";
import { TodoBoard } from "./components/todo-board";
import {
  makeId,
  priorityValues,
  type Todo,
  todoListSchema,
} from "./todo-types";

// ---------------------------------------------------------------------------
// PilotBindings — registers usePilotState + usePilotAction for the whole page.
//
// Kept separate from the UI components so the AI's "world model" is defined
// in one place. Reading this file tells you everything the AI can do to the
// app without hunting through three components.
// ---------------------------------------------------------------------------

function PilotBindings() {
  const { todos, setTodos, appendTodo, chart, setChart, signalChartFlash } =
    useAppContext();

  // --- todos state: read + whole-list update -------------------------------
  usePilotState({
    name: "todos",
    description:
      "The user's current todo list. Each item has an id, text, done flag, " +
      "and optional priority / dueDate / assignee / notes. Read this to " +
      "answer questions about what's pending. Use update_todos only for bulk " +
      "rewrites; prefer add_todo / toggle_todo / remove_todo for single ops.",
    value: todos,
    schema: todoListSchema,
    setValue: (next) => setTodos(next),
  });

  // --- chart state: read + update_chart auto-tool --------------------------
  usePilotState({
    name: "chart",
    description:
      "The current chart configuration displayed above the todo list. " +
      "`type` picks the renderer; `source` picks the data series.",
    value: chart,
    schema: z.object({
      type: z.enum(["bar", "pie", "line"]),
      source: z.enum(["status", "priority"]),
    }),
    // No setValue here — we prefer the narrower partial-update tool below so
    // the AI can change just `type` without resending `source`.
  });

  // A narrower, partial-update tool for the chart. Either field can be
  // omitted; missing fields keep their current value. Also fires the flash
  // affordance so the chart card pulses when the AI mutates it.
  usePilotAction({
    name: "update_chart",
    description:
      "Update the chart displayed above the todo list. Either field may be " +
      "omitted to leave that aspect unchanged. `type` picks Bar / Pie / Line; " +
      "`source` picks the data series (status = done vs pending, priority = " +
      "count per priority level).",
    parameters: z.object({
      type: z
        .enum(["bar", "pie", "line"])
        .optional()
        .describe("Chart renderer. Omit to keep the current type."),
      source: z
        .enum(["status", "priority"])
        .optional()
        .describe("Data series. Omit to keep the current source."),
    }),
    mutating: true,
    handler: ({ type, source }) => {
      const patch: { type?: ChartType; source?: ChartSource } = {};
      if (type) patch.type = type;
      if (source) patch.source = source;
      if (Object.keys(patch).length === 0) {
        return { ok: false, reason: "Nothing to update." };
      }
      setChart(patch);
      signalChartFlash();
      return { ok: true, applied: patch };
    },
  });

  // --- todo actions: same surface as before, now enriched ------------------
  usePilotAction({
    name: "add_todo",
    description:
      "Add a new todo to the end of the list. Use optional priority / " +
      "dueDate (YYYY-MM-DD) / assignee / notes when the user mentions them.",
    parameters: z.object({
      text: z.string().min(1).describe("The visible text of the todo."),
      priority: z.enum(priorityValues).optional(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("ISO date (YYYY-MM-DD)."),
      assignee: z.string().optional(),
      notes: z.string().optional(),
    }),
    handler: ({ text, priority, dueDate, assignee, notes }) => {
      const todo: Todo = {
        id: makeId(),
        text,
        done: false,
        ...(priority ? { priority } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(assignee ? { assignee } : {}),
        ...(notes ? { notes } : {}),
      };
      appendTodo(todo, { fromAi: true });
      return { ok: true, id: todo.id };
    },
  });

  usePilotAction({
    name: "toggle_todo",
    description:
      "Toggle a todo's done flag. Match by id when possible; otherwise by a " +
      "substring of the text.",
    parameters: z.object({
      id: z
        .string()
        .optional()
        .describe("The exact id of the todo to toggle."),
      match: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring match against the todo text. Use when id is unknown.",
        ),
    }),
    handler: ({ id, match }) => {
      const byId = id ? todos.find((t) => t.id === id) : undefined;
      const byMatch =
        !byId && match
          ? todos.find((t) =>
              t.text.toLowerCase().includes(match.toLowerCase()),
            )
          : undefined;
      const target = byId ?? byMatch;
      if (!target) {
        return { ok: false, reason: "No matching todo." };
      }
      setTodos(
        todos.map((t) =>
          t.id === target.id ? { ...t, done: !t.done } : t,
        ),
      );
      return { ok: true, id: target.id };
    },
  });

  usePilotAction({
    name: "remove_todo",
    description:
      "Permanently remove a todo. Match by id when possible; otherwise by " +
      "substring of its text.",
    parameters: z.object({
      id: z.string().optional().describe("The exact id of the todo."),
      match: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring match against the todo text.",
        ),
    }),
    mutating: true,
    handler: ({ id, match }) => {
      const target =
        (id ? todos.find((t) => t.id === id) : undefined) ??
        (match
          ? todos.find((t) =>
              t.text.toLowerCase().includes(match.toLowerCase()),
            )
          : undefined);
      if (!target) {
        return { ok: false, reason: "No matching todo." };
      }
      setTodos(todos.filter((t) => t.id !== target.id));
      return { ok: true, id: target.id };
    },
  });

  return null;
}

// ---------------------------------------------------------------------------
// Layout — three sections stacked vertically: stats, detail form, todo board.
// ---------------------------------------------------------------------------

function PageShell() {
  return (
    <main className="page">
      <div className="shell">
        <header className="header">
          <h1>Todos</h1>
          <p>
            A single page with three panels. Ask the copilot to rewire the
            chart, fill the form, or mutate the list.
          </p>
          <span className="hint" aria-hidden="true">
            Try asking the copilot <kbd>→</kbd>
          </span>
        </header>
        <StatsPanel />
        <DetailForm />
        <TodoBoard />
        <PilotBindings />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page — wraps the shell in <Pilot> + AppProvider and drops in the sidebar.
// ---------------------------------------------------------------------------

export default function Page() {
  return (
    <Pilot apiUrl="/api/pilot">
      <AppProvider>
        <PageShell />
        <PilotSidebar
          defaultOpen={false}
          labels={{
            title: "Todo copilot",
            inputPlaceholder: "Ask me to change the chart, fill the form, or edit todos…",
          }}
          suggestions={[
            "What's still pending?",
            "Add 'buy milk'",
            "Mark the gym one as done",
            "Show completed vs pending as a bar chart",
            "Switch to a pie of todos by priority",
            "Create 'Ship migration', urgent priority, due Friday, assigned to me",
          ]}
        />
      </AppProvider>
    </Pilot>
  );
}
