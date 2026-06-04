import { CHECKINS_KEY } from "./localStore";
import type { WeeklyCheckInEntry } from "@/app/coach/localCoachTypes";

// TEMPORARY local store for weekly check-ins (an array, so it can't use the
// object-merge readLocal). SSR-safe; never throws into the UI. When we move to
// Supabase, only these readers/writers change.

export function getCheckIns(): WeeklyCheckInEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHECKINS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as WeeklyCheckInEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveCheckIns(entries: WeeklyCheckInEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHECKINS_KEY, JSON.stringify(entries));
  } catch {
    // storage full/blocked — ignore so the page never breaks
  }
}

// Add (or replace same-date) a check-in, kept sorted oldest→newest.
export function addCheckIn(entry: WeeklyCheckInEntry): WeeklyCheckInEntry[] {
  const next = [...getCheckIns().filter((e) => e.date !== entry.date), entry].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  saveCheckIns(next);
  return next;
}

export function lastCheckIn(entries: WeeklyCheckInEntry[]): WeeklyCheckInEntry | null {
  return entries.length ? entries[entries.length - 1] : null;
}

// Whole days since an ISO/date string; Infinity if none/invalid.
export function daysSince(date: string | null | undefined): number {
  if (!date) return Infinity;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}
