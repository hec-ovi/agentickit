/**
 * Shared todo types for the example app.
 *
 * The `Todo` shape started out as `{ id, text, done }`. We kept those fields
 * required (so the simple inline composer keeps working) and added the richer
 * fields (`priority`, `dueDate`, `assignee`, `notes`) as optional so the
 * detail-form panel has somewhere to write to without breaking the minimal
 * path. Every consumer can opt into only the fields it renders.
 */

import { z } from "zod";

export const priorityValues = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof priorityValues)[number];

export const todoSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  done: z.boolean(),
  priority: z.enum(priorityValues).optional(),
  dueDate: z.string().optional(),
  assignee: z.string().optional(),
  notes: z.string().optional(),
});

export const todoListSchema = z.array(todoSchema);

export type Todo = z.infer<typeof todoSchema>;

// Seed data so the UI isn't a blank canvas on first load.
export const SEED_TODOS: ReadonlyArray<Todo> = [
  {
    id: "seed-1",
    text: "Read the agentickit README",
    done: true,
    priority: "low",
  },
  {
    id: "seed-2",
    text: "Try asking the copilot to add a todo",
    done: false,
    priority: "medium",
  },
  {
    id: "seed-3",
    text: "Mark the gym todo as done",
    done: false,
    priority: "medium",
  },
  {
    id: "seed-4",
    text: "Go to the gym",
    done: false,
    priority: "high",
  },
  {
    id: "seed-5",
    text: "Ship the portfolio page",
    done: false,
    priority: "urgent",
  },
];

// Tiny id helper — avoids pulling in a whole uuid lib for a demo.
export function makeId(): string {
  return `todo-${Math.random().toString(36).slice(2, 10)}`;
}
