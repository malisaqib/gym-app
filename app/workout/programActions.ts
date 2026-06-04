"use server";

import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { WorkoutLog } from "@/lib/database.types";
import { ALL_EXERCISES } from "@/lib/workouts/exerciseCatalog";
import { generateProgram, type WeeklyProgram } from "@/lib/workouts/generator";
import { groupExerciseHistory, type ExerciseHistory } from "@/lib/workouts/history";
import { goalToEmphasis, normalizeTrainingSetup, type TrainingSetup } from "@/lib/workouts/trainingSetup";

/**
 * Workout rebuild — Phase 4/5: build the deterministic program on the server.
 *
 * Why a server action? The exercise dataset (~1MB) lives in exerciseCatalog and
 * must NOT ship to the client. The client sends its (localStorage) setup; we
 * generate here against the full catalog and return only the small program.
 * The emphasis is REUSED from the user's onboarding goal — we never ask again.
 * This is still 100% deterministic: no AI is involved.
 *
 * Phase 5: we also seed each plan exercise's logging history (today's sets +
 * last session) so the plan is immediately loggable without a separate fetch.
 */
export type BuildProgramResult =
  | { ok: true; program: WeeklyProgram; history: Record<string, ExerciseHistory>; today: string }
  | { ok: false; error: string };

export async function buildProgram(raw: TrainingSetup): Promise<BuildProgramResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const setup = normalizeTrainingSetup(raw);

  // Pull the practical goal -> training emphasis (sets/reps/rest tuning).
  const { data: profile } = await supabase.from("profiles").select("goal").eq("id", user.id).single();
  const emphasis = goalToEmphasis(profile?.goal ?? null);

  const program = generateProgram(setup, emphasis, ALL_EXERCISES);

  // Seed logging history for every distinct exercise in the plan.
  const names = [...new Set(program.days.flatMap((d) => d.exercises.map((e) => e.name)))];
  const today = await getLocalToday();

  let history: Record<string, ExerciseHistory> = {};
  if (names.length > 0) {
    const { data: rows } = await supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", user.id)
      .in("exercise_name", names)
      .order("performed_on", { ascending: false })
      .order("set_number", { ascending: true })
      .limit(300)
      .returns<WorkoutLog[]>();
    history = groupExerciseHistory(rows ?? [], names, today);
  }

  return { ok: true, program, history, today };
}
