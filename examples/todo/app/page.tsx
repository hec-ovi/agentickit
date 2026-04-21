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
  type ChartConfig,
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

  // --- chart state: visible-on-demand, updated via show_chart --------------
  //
  // The chart is a generative-UI element: nothing renders until the agent
  // (or the user via a future manual trigger) explicitly summons it with
  // `show_chart`. `hide_chart` dismisses it. This is the pattern we're
  // demoing — the agent doesn't just fill pre-placed widgets, it decides
  // when a widget is worth materializing at all.
  usePilotState({
    name: "chart",
    description:
      "Chart panel shown above the todo list. `visible` controls whether it " +
      "is currently mounted; when hidden it occupies no space. `type` picks " +
      "the renderer and `source` picks the data series. The chart is hidden " +
      "by default.",
    value: chart,
    schema: z.object({
      visible: z.boolean(),
      type: z.enum(["bar", "pie", "line"]),
      source: z.enum(["status", "priority"]),
    }),
    // No setValue — we expose narrower show/hide tools instead so the agent's
    // intent is legible in the stream.
  });

  usePilotAction({
    name: "show_chart",
    description:
      "Render a chart of todo statistics above the list. Use this when the " +
      "user asks to *see* stats, a breakdown, a summary as a chart, or a " +
      "visualization. If the chart is already visible, this updates its " +
      "type/source. `type` picks Bar / Pie / Line; `source` picks the data " +
      "series (status = done vs pending, priority = count per priority level).",
    parameters: z.object({
      type: z
        .enum(["bar", "pie", "line"])
        .optional()
        .describe("Chart renderer. Defaults to bar on first show."),
      source: z
        .enum(["status", "priority"])
        .optional()
        .describe("Data series. Defaults to status on first show."),
    }),
    handler: ({ type, source }) => {
      const patch: Partial<ChartConfig> = { visible: true };
      if (type) patch.type = type;
      if (source) patch.source = source;
      setChart(patch);
      signalChartFlash();
      return { ok: true, applied: patch };
    },
  });

  usePilotAction({
    name: "hide_chart",
    description:
      "Dismiss the chart panel. Use when the user asks to close, hide, or " +
      "dismiss the chart, or when they're done looking at it.",
    parameters: z.object({}).strict(),
    handler: () => {
      if (!chart.visible) return { ok: true, alreadyHidden: true };
      setChart({ visible: false });
      return { ok: true };
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
            "Show me a chart of completed vs pending",
            "Now switch it to a pie of todos by priority",
            "Create 'Ship migration', urgent priority, due Friday, assigned to me",
          ]}
        />
      </AppProvider>
    </Pilot>
  );
}
