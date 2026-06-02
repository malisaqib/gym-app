"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutLog } from "@/lib/database.types";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Per-exercise history: what was logged today, and the previous session's sets.
export interface ExerciseHistory {
  today: WorkoutLog[];
  lastSessionDate: string | null;
  lastSessionSets: WorkoutLog[];
}

/**
 * Fetch recent logs for the given exercises and split them, per exercise, into
 * "today" and "the most recent earlier session" (used for progression hints).
 */
export async function getExerciseHistory(
  exerciseNames: string[],
  date: string
): Promise<Record<string, ExerciseHistory>> {
  const empty: Record<string, ExerciseHistory> = {};
  for (const name of exerciseNames) {
    empty[name] = { today: [], lastSessionDate: null, lastSessionSets: [] };
  }
  if (!isDate(date) || exerciseNames.length === 0) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("user_id", user.id)
    .in("exercise_name", exerciseNames)
    .order("performed_on", { ascending: false })
    .order("set_number", { ascending: true })
    .limit(300)
    .returns<WorkoutLog[]>();

  const rows = data ?? [];
  const result = { ...empty };

  for (const name of exerciseNames) {
    const forExercise = rows.filter((r) => r.exercise_name === name);
    const today = forExercise
      .filter((r) => r.performed_on === date)
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));

    // The newest date that isn't today = the "last session" for progression.
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

type LogResult = { ok: true; item: WorkoutLog } | { ok: false; error: string };

/** Log one set of an exercise. Bodyweight, so we store reps (weight stays null). */
export async function logSet(input: {
  exerciseName: string;
  reps: number;
  setNumber: number;
  date: string;
}): Promise<LogResult> {
  const reps = Math.round(Number(input.reps));
  if (!Number.isFinite(reps) || reps <= 0) return { ok: false, error: "Enter a valid rep count." };
  if (!isDate(input.date)) return { ok: false, error: "Invalid date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("workout_logs")
    .insert({
      user_id: user.id,
      exercise_name: input.exerciseName,
      performed_on: input.date,
      set_number: input.setNumber,
      reps,
    })
    .select()
    .single<WorkoutLog>();

  if (error) return { ok: false, error: error.message };
  return { ok: true, item: data };
}

/** Delete one logged set. */
export async function deleteSet(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("workout_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
