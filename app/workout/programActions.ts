"use server";

import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { WorkoutLog } from "@/lib/database.types";
import { ALL_EXERCISES } from "@/lib/workouts/exerciseCatalog";
import {
  generateProgram,
  swapProgramExercise,
  type MovementPattern,
  type ProgramExercise,
  type WeeklyProgram,
} from "@/lib/workouts/generator";
import { askExerciseCoach } from "@/lib/workouts/exerciseCoach";
import { groupExerciseHistory, type ExerciseHistory } from "@/lib/workouts/history";
import {
  goalToEmphasis,
  normalizeTrainingSetup,
  type TrainingEmphasis,
  type TrainingSetup,
} from "@/lib/workouts/trainingSetup";

// Re-read the user's emphasis from their saved goal (single source of truth).
async function emphasisForUser(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<TrainingEmphasis> {
  const { data: profile } = await supabase.from("profiles").select("goal").eq("id", userId).single();
  return goalToEmphasis(profile?.goal ?? null);
}

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
  const emphasis = await emphasisForUser(supabase, user.id);
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

/**
 * Phase 6 — swap one exercise for another valid one of the SAME movement
 * pattern. Deterministic + grounded (no AI): only ever returns an exercise the
 * user can actually do. `excludeIds` should be the day's current exercise ids
 * so the swap doesn't duplicate. The client sends its (localStorage) setup.
 */
export async function swapExercise(
  raw: TrainingSetup,
  pattern: MovementPattern,
  excludeIds: string[]
): Promise<{ ok: true; exercise: ProgramExercise } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const setup = normalizeTrainingSetup(raw);
  const emphasis = await emphasisForUser(supabase, user.id);

  const exercise = swapProgramExercise(setup, emphasis, ALL_EXERCISES, pattern, excludeIds);
  if (!exercise) return { ok: false, error: "No other option fits your setup for this movement." };
  return { ok: true, exercise };
}

/**
 * Phase 6 — AI "ask the coach" about one exercise. The ONLY AI in the workout
 * feature; grounded in the exercise's dataset instructions and told never to
 * invent a new program (see lib/workouts/exerciseCoach). Degrades gracefully
 * when GROQ_API_KEY isn't configured.
 */
export async function askAboutExercise(input: {
  exercise: ProgramExercise;
  level: WeeklyProgram["level"];
  emphasis: WeeklyProgram["emphasis"];
  question: string;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const question = input.question.trim();
  if (!question) return { ok: false, error: "Type a question first." };

  try {
    const answer = await askExerciseCoach(
      { exercise: input.exercise, level: input.level, emphasis: input.emphasis },
      question.slice(0, 500)
    );
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The coach is unavailable right now." };
  }
}
