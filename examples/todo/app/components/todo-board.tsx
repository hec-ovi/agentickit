"use client";

/**
 * TodoBoard — the classic list. Preserved from the original example except
 * that:
 *  - state now lives in the shared AppContext (so the chart + form panels can
 *    read/write it too), and
 *  - newly-AI-added items get a small "AI" badge that fades out.
 *
 * The simple inline composer (plain `<input>`) keeps working — it just writes
 * to the shared todos list. That's the "backward-compat" contract from the
 * task spec: the minimal happy path never required filling out the detail
 * form.
 */

import { type FormEvent, useCallback, useMemo, useState } from "react";
import { useAppContext } from "../app-context";
import { makeId, type Todo } from "../todo-types";

export function TodoBoard() {
  const { todos, setTodos, aiTodoIds } = useAppContext();
  const [draft, setDraft] = useState("");

  const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);

  const handleAdd = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      const next: Todo = {
        id: makeId(),
        text,
        done: false,
        priority: "medium",
      };
      setTodos([...todos, next]);
      setDraft("");
    },
    [draft, setTodos, todos],
  );

  const toggleLocal = useCallback(
    (id: string) => {
      setTodos(
        todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
    },
    [setTodos, todos],
  );

  const removeLocal = useCallback(
    (id: string) => {
      setTodos(todos.filter((t) => t.id !== id));
    },
    [setTodos, todos],
  );

  return (
    <section className="panel board-panel" aria-label="Todo list">
      <header className="panel-header">
        <div>
          <h2 className="panel-title">Todos</h2>
          <p className="panel-sub">
            A tiny list. Ask the copilot to add, toggle, or summarize.
          </p>
        </div>
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
                className={`item${todo.done ? " done" : ""}${
                  aiTodoIds.has(todo.id) ? " is-ai-new" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="item-checkbox"
                  checked={todo.done}
                  onChange={() => toggleLocal(todo.id)}
                  aria-label={`Mark "${todo.text}" as ${
                    todo.done ? "not done" : "done"
                  }`}
                />
                <span className="item-text">{todo.text}</span>
                {todo.priority && (
                  <span
                    className={`pill pill-${todo.priority}`}
                    aria-label={`Priority: ${todo.priority}`}
                  >
                    {todo.priority}
                  </span>
                )}
                {aiTodoIds.has(todo.id) && (
                  <span className="ai-badge" aria-label="Added by copilot">
                    new
                  </span>
                )}
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
    </section>
  );
}

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
