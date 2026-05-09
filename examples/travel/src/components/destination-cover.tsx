import { memo } from "react";
import { findCity } from "../data/cities";

interface DestinationCoverProps {
  destination: string;
  className?: string;
  ariaLabel?: string;
  showLabel?: boolean;
}

/**
 * Sophisticated solid color band keyed off the city palette. No SVG art.
 * Two-stop gradient with a darker bottom vignette for depth, and an
 * optional caption overlay for the trip-detail hero.
 */
function DestinationCoverImpl({
  destination,
  className,
  ariaLabel,
  showLabel = false,
}: DestinationCoverProps) {
  const city = findCity(destination);
  const [from, to] = city?.palette ?? ["#94a3b8", "#475569"];
  const ink = pickInk(from);
  const label = city ? `${city.name}, ${city.country}` : destination;

  return (
    <div
      className={`dest-cover ${className ?? ""}`}
      role="img"
      aria-label={ariaLabel ?? label}
      style={{
        // Keys the CSS gradient to the city palette without inlining the
        // gradient itself: keeps the recipe in components.css and lets us
        // reuse it for any future variants (e.g. wider hero).
        ["--dest-from" as string]: from,
        ["--dest-to" as string]: to,
        ["--dest-ink" as string]: ink,
      }}
    >
      {showLabel ? <span className="dest-label">{label}</span> : null}
    </div>
  );
}

export const DestinationCover = memo(DestinationCoverImpl);

/**
 * Choose a contrast ink for the bottom vignette so dark palettes stay
 * legible. Returns a near-black for pale colors, near-white for already-dark
 * ones. Cheap luminance via R+2G+B weighting; correctness is not the point.
 */
function pickInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0b1220";
  const n = parseInt(m[1] as string, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = (r + g * 2 + b) / 4;
  return lum > 160 ? "#0b1220" : "#fbfaf6";
}
