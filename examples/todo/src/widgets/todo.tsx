import { useMemo, useState } from "react";
import { usePilotAction, usePilotState } from "agentickit";
import { z } from "zod";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

const todoSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});

const INITIAL: ReadonlyArray<Todo> = [
  { id: "t1", text: "Read .pilot/AGENTS.md", done: true },
  { id: "t2", text: "Ask the copilot to add two items", done: false },
];

function newId() {
  return `t${Math.random().toString(36).slice(2, 8)}`;
}

export function TodoWidget() {
  const [todos, setTodos] = useState<ReadonlyArray<Todo>>(INITIAL);
  const [draft, setDraft] = useState("");

  // Expose the whole list read-only. With no setter, the model can read but
  // can't replace it wholesale — forcing it to use the granular actions below.
  usePilotState({
    name: "todos",
    description:
      "Current todo list. Each todo has id, text, and done. Use the add_todo / toggle_todo / " +
      "delete_todo / clear_completed tools to mutate it; do NOT call update_todos for single-item changes.",
    value: todos,
    schema: z.array(todoSchema),
  });

  usePilotAction({
    name: "add_todo",
    description: "Append a new todo. Returns the created todo's id.",
    parameters: z.object({ text: z.string().min(1).max(160) }),
    handler: ({ text }) => {
      const todo: Todo = { id: newId(), text, done: false };
      setTodos((prev) => [...prev, todo]);
      return { id: todo.id };
    },
  });

  usePilotAction({
    name: "toggle_todo",
    description: "Toggle the `done` flag on one todo by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      let found = false;
      setTodos((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            found = true;
            return { ...t, done: !t.done };
          }
          return t;
        }),
      );
      return { ok: found };
    },
  });

  usePilotAction({
    name: "delete_todo",
    description: "Delete one todo by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      let removed = false;
      setTodos((prev) => {
        const next = prev.filter((t) => t.id !== id);
        removed = next.length !== prev.length;
        return next;
      });
      return { ok: removed };
    },
    mutating: true,
  });

  usePilotAction({
    name: "clear_completed",
    description: "Remove all todos whose `done` is true. Returns the count removed.",
    parameters: z.object({}).strict(),
    handler: () => {
      let count = 0;
      setTodos((prev) => {
        const next = prev.filter((t) => !t.done);
        count = prev.length - next.length;
        return next;
      });
      return { removed: count };
    },
    mutating: true,
  });

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  return (
    <div className="panel">
      <h2>Todos</h2>
      <div className="row">
        <input
          type="text"
          placeholder="What needs doing?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim().length > 0) {
              setTodos((prev) => [...prev, { id: newId(), text: draft.trim(), done: false }]);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={draft.trim().length === 0}
          onClick={() => {
            setTodos((prev) => [...prev, { id: newId(), text: draft.trim(), done: false }]);
            setDraft("");
          }}
        >
          Add
        </button>
      </div>
      {todos.length === 0 ? (
        <p className="empty">No todos yet. Ask the copilot, or type above.</p>
      ) : (
        <ul className="todo-list">
          {todos.map((t) => (
            <li key={t.id} className={t.done ? "done" : ""}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  setTodos((prev) =>
                    prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  )
                }
                aria-label={`toggle ${t.text}`}
              />
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => setTodos((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label={`delete ${t.text}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row space-between">
        <span className="caption" style={{ margin: 0 }}>
          {remaining} remaining
        </span>
        <span className="badge">tools: add_todo · toggle_todo · delete_todo · clear_completed</span>
      </div>
    </div>
  );
}
