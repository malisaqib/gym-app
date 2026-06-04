// TEMPORARY local store (Phase 2+).
//
// We keep coach preferences (emotional goal, budget, check-ins) in localStorage
// for now so we can ship features without DB migrations. Everything here is
// SSR-safe (guards `window`) and merges onto a fallback so old/partial saved
// shapes don't crash after we evolve a type. When we move to Supabase, only the
// readers/writers below need to change — call sites stay the same.

export const EMOTIONAL_GOAL_KEY = "gymCoach.emotionalGoal";
export const BUDGET_KEY = "gymCoach.budget";
export const CHECKINS_KEY = "gymCoach.checkins";

// Read a JSON value from localStorage, merged over `fallback`. Returns the
// fallback untouched on the server, when nothing is stored, or on parse errors.
export function readLocal<T extends object>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

// Write a JSON value to localStorage. No-ops on the server or if storage is
// unavailable (e.g. private mode quota), so it never throws into the UI.
export function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: storage being full/blocked shouldn't break the page.
  }
}
