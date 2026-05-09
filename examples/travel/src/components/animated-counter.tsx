import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}

/**
 * Tween a numeric value into view over `duration` ms. Used for dashboard
 * stats so the counts animate up on first paint instead of appearing fully
 * resolved. Honors prefers-reduced-motion.
 */
export function AnimatedCounter({ value, duration = 700, format }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const startedAt = useRef<number | null>(null);
  const fromValue = useRef(0);

  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    fromValue.current = display;
    startedAt.current = null;
    let frame = 0;
    const step = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const t = Math.min(1, (now - startedAt.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromValue.current + (value - fromValue.current) * eased;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // We deliberately exclude `display` so the tween targets the new value
    // without re-running on every intermediate frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const rounded = Math.round(display);
  return <>{format ? format(rounded) : rounded}</>;
}
