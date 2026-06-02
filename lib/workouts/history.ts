import type { WorkoutLog } from "@/lib/database.types";

// Per-exercise history: what was logged today, and the previous session's sets.
export interface ExerciseHistory {
  today: WorkoutLog[];
  lastSessionDate: string | null;
  lastSessionSets: WorkoutLog[];
}

/**
 * Pure: split rows (which must be ordered performed_on DESC) per exercise into
 * "today" and "the most recent earlier session" (for the progression hint).
 * Shared by the server page (initial render) and any server action.
 */
export function groupExerciseHistory(
  rows: WorkoutLog[],
  exerciseNames: string[],
  date: string
): Record<string, ExerciseHistory> {
  const result: Record<string, ExerciseHistory> = {};

  for (const name of exerciseNames) {
    const forExercise = rows.filter((r) => r.exercise_name === name);
    const today = forExercise
      .filter((r) => r.performed_on === date)
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));

    const lastDate = forExercise.find((r) => r.performed_on !== date)?.performed_on ?? null;
    const lastSets = lastDate
      ? forExercise
          .filter((r) => r.performed_on === lastDate)
          .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
      : [];

    result[name] = { today, lastSessionDate: lastDate, lastSessionSets: lastSets };
  }

  return result;
}
