"use client";

import {
  Pilot,
  PilotSidebar,
  usePilotAction,
  usePilotState,
} from "agentickit";
import { type FormEvent, useCallback, useMemo, useState } from "react";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema + types
// ---------------------------------------------------------------------------

const todoSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  done: z.boolean(),
});

const todoListSchema = z.array(todoSchema);

type Todo = z.infer<typeof todoSchema>;

// Seed data so the UI isn't a blank canvas on first load.
const SEED_TODOS: ReadonlyArray<Todo> = [
  { id: "seed-1", text: "Read the agentickit README", done: true },
  { id: "seed-2", text: "Try asking the copilot to add a todo", done: false },
  { id: "seed-3", text: "Mark the gym todo as done", done: false },
  { id: "seed-4", text: "Go to the gym", done: false },
  { id: "seed-5", text: "Ship the portfolio page", done: false },
];

// Tiny id helper — avoids pulling in a whole uuid lib for a demo.
function makeId(): string {
  return `todo-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// TodoBoard — the component that wires the three hooks.
// ---------------------------------------------------------------------------

function TodoBoard() {
  const [todos, setTodos] = useState<ReadonlyArray<Todo>>(SEED_TODOS);
  const [draft, setDraft] = useState("");

  const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);

  // -------------------------------------------------------------------------
  // usePilotState — expose the full list to the model (read + whole-value
  // update). Passing `setValue` auto-registers an `update_todos` tool.
  // -------------------------------------------------------------------------
  usePilotState({
    name: "todos",
    description:
      "The user's current todo list. Each item has an id, text, and done flag.",
    value: todos,
    schema: todoListSchema,
    setValue: (next) => setTodos(next),
  });

  // -------------------------------------------------------------------------
  // usePilotAction — explicit tools for nicer UX than a whole-list overwrite.
  // -------------------------------------------------------------------------
  usePilotAction({
    name: "add_todo",
    description: "Add a new todo item to the end of the list.",
    parameters: z.object({
      text: z.string().min(1).describe("The visible text of the todo."),
    }),
    handler: ({ text }) => {
      const todo: Todo = { id: makeId(), text, done: false };
      setTodos((prev) => [...prev, todo]);
      return { ok: true, id: todo.id };
    },
  });

  usePilotAction({
    name: "toggle_todo",
    description:
      "Toggle a todo's done flag. Match by id when possible; otherwise by a substring of the text.",
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
      let targetId: string | null = null;
      setTodos((prev) => {
        const byId = id ? prev.find((t) => t.id === id) : undefined;
        const byMatch =
          !byId && match
            ? prev.find((t) => t.text.toLowerCase().includes(match.toLowerCase()))
            : undefined;
        const target = byId ?? byMatch;
        if (!target) return prev;
        targetId = target.id;
        return prev.map((t) =>
          t.id === target.id ? { ...t, done: !t.done } : t,
        );
      });
      if (!targetId) {
        return { ok: false, reason: "No matching todo." };
      }
      return { ok: true, id: targetId };
    },
  });

  usePilotAction({
    name: "remove_todo",
    description:
      "Permanently remove a todo. Match by id when possible; otherwise by substring of its text.",
    parameters: z.object({
      id: z.string().optional().describe("The exact id of the todo."),
      match: z
        .string()
        .optional()
        .describe("Case-insensitive substring match against the todo text."),
    }),
    mutating: true,
    handler: ({ id, match }) => {
      let removedId: string | null = null;
      setTodos((prev) => {
        const target =
          (id ? prev.find((t) => t.id === id) : undefined) ??
          (match
            ? prev.find((t) => t.text.toLowerCase().includes(match.toLowerCase()))
            : undefined);
        if (!target) return prev;
        removedId = target.id;
        return prev.filter((t) => t.id !== target.id);
      });
      if (!removedId) {
        return { ok: false, reason: "No matching todo." };
      }
      return { ok: true, id: removedId };
    },
  });

  // -------------------------------------------------------------------------
  // Local UI handlers
  // -------------------------------------------------------------------------
  const handleAdd = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setTodos((prev) => [...prev, { id: makeId(), text, done: false }]);
      setDraft("");
    },
    [draft],
  );

  const toggleLocal = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  const removeLocal = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <main className="page">
      <div className="shell">
        <header className="header">
          <h1>Todos</h1>
          <p>A tiny list. Ask the copilot to add, toggle, or summarize.</p>
          <span className="hint" aria-hidden="true">
            Try asking the copilot <kbd>→</kbd>
          </span>
        </header>

        <form className="composer" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Add a todo and press Enter"
            aria-label="New todo"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!draft.trim()}>
            Add
          </button>
        </form>

        {todos.length > 0 ? (
          <>
            <div className="meta">
              <span className="meta-count">
                {doneCount} of {todos.length} done
              </span>
              <span>{todos.length - doneCount} pending</span>
            </div>
            <ul className="list">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className={`item${todo.done ? " done" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="item-checkbox"
                    checked={todo.done}
                    onChange={() => toggleLocal(todo.id)}
                    aria-label={`Mark "${todo.text}" as ${todo.done ? "not done" : "done"}`}
                  />
                  <span className="item-text">{todo.text}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeLocal(todo.id)}
                    aria-label={`Delete "${todo.text}"`}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="empty" role="status">
            <span className="empty-title">No todos yet</span>
            <span className="empty-sub">
              Add one above, or ask the copilot to do it for you.
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page — wraps the board in <Pilot> and drops in the sidebar.
// ---------------------------------------------------------------------------

export default function Page() {
  return (
    <Pilot apiUrl="/api/pilot" model="openai/gpt-4o-mini">
      <TodoBoard />
      <PilotSidebar
        defaultOpen={false}
        labels={{
          title: "Todo copilot",
          inputPlaceholder: "Add, toggle, or ask what's pending…",
        }}
        suggestions={[
          "What's still pending?",
          "Add 'buy milk' to my list",
          "Mark the gym todo as done",
          "Remove the milk one",
        ]}
      />
    </Pilot>
  );
}

// ---------------------------------------------------------------------------
// Inline icon — avoids an icon-library dependency.
// ---------------------------------------------------------------------------

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
