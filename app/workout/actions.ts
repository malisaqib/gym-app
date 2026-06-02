"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutLog } from "@/lib/database.types";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Initial workout history is now fetched on the server (see app/workout/page.tsx)
// and grouped with lib/workouts/history.ts, so there's no client mount-fetch.

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
