import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "info" | "success" | "warning" | "danger";

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  ttl: number;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    (input) => {
      const id = `t-${++nextToastId}`;
      const ttl = input.ttl ?? 4500;
      const toast: Toast = {
        id,
        tone: input.tone,
        title: input.title,
        message: input.message,
        ttl,
      };
      setToasts((prev) => [...prev, toast]);
      const timer = setTimeout(() => dismiss(id), ttl);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="toast-stack"
          role="region"
          aria-label="Notifications"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast tone-${t.tone}`}
              role="status"
              onClick={() => dismiss(t.id)}
            >
              <div className="toast-title">{t.title}</div>
              {t.message ? <div className="toast-message">{t.message}</div> : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
