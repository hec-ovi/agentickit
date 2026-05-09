import { useEffect } from "react";
import { useToast } from "../lib/toast";

const STORAGE_KEY = "ak-travel-seen-hint";

/**
 * Fires a single welcome toast on the user's first visit. Stores a flag in
 * localStorage so subsequent visits stay quiet. Mounts as a no-render
 * sibling of the rest of the shell.
 */
export function FirstVisitHint() {
  const toast = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      return;
    }
    const t = setTimeout(() => {
      toast.push({
        tone: "info",
        title: "Hi! Try the assistant",
        message:
          "Open the chat pill at the bottom-right and ask: 'plan a 5-day trip to Lisbon for two travelers'.",
        ttl: 8000,
      });
    }, 900);
    return () => clearTimeout(t);
  }, [toast]);

  return null;
}
