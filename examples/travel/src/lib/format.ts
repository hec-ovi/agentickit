/**
 * Shared formatting helpers. Centralized so the same date / currency
 * presentation flows through every page without per-component drift.
 */

import type { Preferences } from "../data/types";

export function fmtCurrency(amount: number, currency: Preferences["currency"]): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function daysBetween(startISO: string, endISO: string): number {
  return Math.max(
    1,
    Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 86400000) + 1,
  );
}

export function nightsBetween(startISO: string, endISO: string): number {
  return Math.max(
    1,
    Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 86400000),
  );
}
