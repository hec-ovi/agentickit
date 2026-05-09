import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ConfettiProps {
  /** When this number changes, fire a fresh burst. */
  trigger: number;
}

/**
 * One-shot confetti burst. Listens to `trigger` (any number; bumping it
 * fires a new burst) and unmounts itself after the animation finishes.
 * Pure CSS, no library, respects prefers-reduced-motion via the global rule.
 */
export function Confetti({ trigger }: ConfettiProps) {
  const [pieces, setPieces] = useState<number>(0);

  useEffect(() => {
    if (trigger === 0) return;
    setPieces(trigger);
    const t = setTimeout(() => setPieces(0), 2000);
    return () => clearTimeout(t);
  }, [trigger]);

  if (pieces === 0) return null;

  const COLORS = ["#1e3a5f", "#f0b04a", "#15803d", "#b45309", "#6d28d9", "#be185d"];
  const COUNT = 50;

  return createPortal(
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: COUNT }, (_, i) => {
        const left = (i / COUNT) * 100;
        const delay = (i % 6) * 60;
        const drift = (i % 5 - 2) * 30;
        const color = COLORS[i % COLORS.length];
        return (
          <span
            key={`${pieces}-${i}`}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              background: color,
              animationDelay: `${delay}ms`,
              transform: `translateX(${drift}px)`,
            }}
          />
        );
      })}
    </div>,
    document.body,
  );
}
