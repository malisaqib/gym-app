import type { BodyweightLog } from "@/lib/database.types";

/**
 * Phase 6 — Pure helpers for turning raw weight logs into a clean chart series.
 * No I/O, so the dedupe/sort/trend logic is testable.
 */

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  weight: number;
}

type WeightRow = Pick<BodyweightLog, "weight_kg" | "logged_on" | "created_at">;

/**
 * Collapse logs to one point per day (keeping the latest entry that day) and
 * sort ascending by date — ready to plot.
 */
export function toSeries(logs: WeightRow[]): WeightPoint[] {
  const byDay = new Map<string, { weight: number; created: string }>();
  for (const log of logs) {
    const prev = byDay.get(log.logged_on);
    if (!prev || log.created_at > prev.created) {
      byDay.set(log.logged_on, { weight: log.weight_kg, created: log.created_at });
    }
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, weight: v.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Net change from first to last point (kg), or null if fewer than 2 points. */
export function weightChange(series: WeightPoint[]): number | null {
  if (series.length < 2) return null;
  const diff = series[series.length - 1].weight - series[0].weight;
  return Math.round(diff * 10) / 10;
}

/** Most recent weight, or null if no data. */
export function latestWeight(series: WeightPoint[]): number | null {
  return series.length ? series[series.length - 1].weight : null;
}
