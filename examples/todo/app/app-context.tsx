"use client";

/**
 * Lightweight React context that stitches the three panels together.
 *
 * - The todos list is shared so the chart can derive from it, the form can
 *   append to it, and the board can render it.
 * - The chart config is shared because the AI manipulates it from outside the
 *   chart component (usePilotAction "update_chart" is registered at the page
 *   scope).
 * - A small "flash" bus lets any component announce that the AI just touched
 *   something. The UI subscribes and renders the affordance. We deliberately
 *   keep this tiny — no reducers, no libraries — so the demo stays readable.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Todo, SEED_TODOS } from "./todo-types";

export type ChartType = "bar" | "pie" | "line";
export type ChartSource = "status" | "priority";

export interface ChartConfig {
  type: ChartType;
  source: ChartSource;
}

/**
 * Discriminated union of "something was just AI-touched" events. Keyed so the
 * reducer below can coalesce repeated events on the same target without
 * growing an unbounded timeline.
 */
export type FlashEvent =
  | { kind: "chart" }
  | { kind: "todo"; id: string }
  | { kind: "field"; field: string };

interface AppContextValue {
  todos: ReadonlyArray<Todo>;
  setTodos: (next: ReadonlyArray<Todo>) => void;
  appendTodo: (todo: Todo, meta?: { fromAi?: boolean }) => void;
  chart: ChartConfig;
  setChart: (next: Partial<ChartConfig>) => void;
  // Flash signals — the component reads `flash<Kind>` and renders the
  // affordance. Each returns a monotonically-increasing timestamp, so the
  // consumer can use it as an effect dependency to re-trigger the animation.
  flashChart: number;
  flashTodoAt: (id: string) => void;
  flashFormField: (field: string) => void;
  aiTodoIds: ReadonlySet<string>;
  flashedFields: ReadonlyMap<string, number>;
  signalChartFlash: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Ambient duration for the "newly added by AI" badge, in milliseconds.
 * 3 seconds is long enough to read mid-demo but short enough to not stack up.
 */
const AI_TODO_BADGE_MS = 3000;

/**
 * Ambient duration for the "field just filled" highlight.
 */
const FIELD_FLASH_MS = 900;

export function AppProvider({ children }: { children: ReactNode }) {
  const [todos, setTodosState] = useState<ReadonlyArray<Todo>>(SEED_TODOS);
  const [chart, setChartState] = useState<ChartConfig>({
    type: "bar",
    source: "status",
  });
  const [flashChart, setFlashChart] = useState(0);
  const [aiTodoIds, setAiTodoIds] = useState<ReadonlySet<string>>(new Set());
  const [flashedFields, setFlashedFields] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );

  // Refs for stable handler identity — these closures are passed into pilot
  // tool handlers that we don't want to re-register on every render.
  const todosRef = useRef(todos);
  todosRef.current = todos;

  const setTodos = useCallback((next: ReadonlyArray<Todo>) => {
    setTodosState(next);
  }, []);

  const appendTodo = useCallback(
    (todo: Todo, meta?: { fromAi?: boolean }) => {
      setTodosState((prev) => [...prev, todo]);
      if (meta?.fromAi) {
        setAiTodoIds((prev) => {
          const next = new Set(prev);
          next.add(todo.id);
          return next;
        });
        // Auto-clear the badge after the configured window.
        window.setTimeout(() => {
          setAiTodoIds((prev) => {
            if (!prev.has(todo.id)) return prev;
            const next = new Set(prev);
            next.delete(todo.id);
            return next;
          });
        }, AI_TODO_BADGE_MS);
      }
    },
    [],
  );

  const setChart = useCallback((next: Partial<ChartConfig>) => {
    setChartState((prev) => ({ ...prev, ...next }));
  }, []);

  const signalChartFlash = useCallback(() => {
    setFlashChart(Date.now());
  }, []);

  const flashTodoAt = useCallback((id: string) => {
    setAiTodoIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setAiTodoIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, AI_TODO_BADGE_MS);
  }, []);

  const flashFormField = useCallback((field: string) => {
    const at = Date.now();
    setFlashedFields((prev) => {
      const next = new Map(prev);
      next.set(field, at);
      return next;
    });
    window.setTimeout(() => {
      setFlashedFields((prev) => {
        if (prev.get(field) !== at) return prev;
        const next = new Map(prev);
        next.delete(field);
        return next;
      });
    }, FIELD_FLASH_MS);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      todos,
      setTodos,
      appendTodo,
      chart,
      setChart,
      flashChart,
      flashTodoAt,
      flashFormField,
      aiTodoIds,
      flashedFields,
      signalChartFlash,
    }),
    [
      todos,
      setTodos,
      appendTodo,
      chart,
      setChart,
      flashChart,
      flashTodoAt,
      flashFormField,
      aiTodoIds,
      flashedFields,
      signalChartFlash,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>.");
  }
  return ctx;
}

/**
 * Helper hook for components that want to run an effect when a flash event
 * timestamp changes. Keeps the firing-an-animation pattern small.
 */
export function useFlashEffect(timestamp: number, cb: () => void): void {
  useEffect(() => {
    if (timestamp === 0) return;
    cb();
    // We only want to re-run on timestamp changes — cb intentionally omitted
    // since callers capture via closure and we don't want stale-dep warnings
    // to cause extra fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timestamp]);
}
