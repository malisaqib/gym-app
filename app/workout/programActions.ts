"use server";

import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { WorkoutLog } from "@/lib/database.types";
import { ALL_EXERCISES } from "@/lib/workouts/exerciseCatalog";
import { enrichExercises } from "@/lib/workouts/enrich";
import {
  buildWorkoutPlan,
  swapPlanExercise,
  resolveWorkoutGoal,
  type MovementPattern,
  type PlanExercise,
  type SwapDirection,
  type WorkoutInput,
  type WorkoutPlan,
} from "@/lib/workouts/coachPlan";
import { askExerciseCoach } from "@/lib/workouts/exerciseCoach";
import { groupExerciseHistory, type ExerciseHistory } from "@/lib/workouts/history";
import { normalizeTrainingSetup, type TrainingSetup } from "@/lib/workouts/trainingSetup";

/**
 * Workout rebuild — server entry for the deterministic generator. The exercise
 * dataset (~1MB) must NOT ship to the client, so we enrich it ONCE here and
 * build/swap server-side, returning only the small plan. No AI in generation;
 * AI is only the per-exercise "Ask coach" below.
 */

// Enrich once per server instance (pure + deterministic, ~873 records).
const ENRICHED = enrichExercises(ALL_EXERCISES);

type Supa = Awaited<ReturnType<typeof createClient>>;

function isOverweight(weight: number | null | undefined, height: number | null | undefined): boolean {
  if (!weight || !height) return false;
  const m = height / 100;
  if (m <= 0) return false;
  return weight / (m * m) >= 30;
}

// Merge the Workout-tab setup with onboarding/profile data into one input. The
// workout goal is the user's explicit choice, else derived from their profile.
async function workoutInputFrom(supabase: Supa, userId: string, setup: TrainingSetup): Promise<WorkoutInput> {
  const { data: p } = await supabase
    .from("profiles")
    .select("relatable_goal, goal, sex, weight_kg, height_cm")
    .eq("id", userId)
    .single<{
      relatable_goal: string | null;
      goal: string | null;
      sex: "male" | "female" | null;
      weight_kg: number | null;
      height_cm: number | null;
    }>();
  return {
    goal: setup.goal ?? resolveWorkoutGoal(p?.relatable_goal, p?.goal),
    location: setup.trainingLocation,
    equipment: setup.equipment,
    hasEquipment: setup.hasEquipment,
    level: setup.experienceLevel,
    daysPerWeek: setup.trainingDaysPerWeek,
    injuriesNote: setup.injuriesNote,
    focusArea: setup.focusArea,
    overweight: isOverweight(p?.weight_kg, p?.height_cm),
    sex: p?.sex ?? undefined,
  };
}

export type BuildProgramResult =
  | { ok: true; plan: WorkoutPlan; history: Record<string, ExerciseHistory>; today: string }
  | { ok: false; error: string };

export async function buildProgram(raw: TrainingSetup): Promise<BuildProgramResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const setup = normalizeTrainingSetup(raw);
  const input = await workoutInputFrom(supabase, user.id, setup);
  const plan = buildWorkoutPlan(input, ENRICHED);

  // Seed logging history for every distinct exercise in the plan (set-logging
  // is keyed on exercise name and is unchanged).
  const names = [...new Set(plan.days.flatMap((d) => d.exercises.map((e) => e.name)))];
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

  return { ok: true, plan, history, today };
}

// Direction-aware "nothing fits" messages — they point back to the per-exercise
// make-easier/harder cue, which scales the SAME movement when no swap exists.
const SWAP_EMPTY: Record<SwapDirection, string> = {
  easier: "This is already about as easy as it gets here — use the “Make it easier” tip to scale the movement itself.",
  harder: "No tougher alternative fits your setup — use the “Make it harder” tip on this exercise instead.",
  different: "No other safe option fits your setup for this movement.",
};

/**
 * Swap one exercise for another VALID one of the SAME movement pattern, in the
 * requested direction (easier / different / harder). Deterministic + grounded:
 * only ever returns an exercise the user can actually do (same equipment
 * availability, ≤ their level, injury/impact-safe).
 */
export async function swapWorkoutExercise(
  raw: TrainingSetup,
  pattern: MovementPattern,
  currentId: string,
  excludeIds: string[],
  direction: SwapDirection
): Promise<{ ok: true; exercise: PlanExercise } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const setup = normalizeTrainingSetup(raw);
  const input = await workoutInputFrom(supabase, user.id, setup);
  const exercise = swapPlanExercise(input, pattern, currentId, excludeIds, direction, ENRICHED);
  if (!exercise) return { ok: false, error: SWAP_EMPTY[direction] };
  return { ok: true, exercise };
}

/**
 * AI "ask the coach" about ONE exercise — the only AI in the workout feature,
 * grounded in that exercise's dataset instructions, never inventing a program.
 */
export async function askAboutExercise(input: {
  name: string;
  muscles: string[];
  sets: number;
  reps: string;
  restSeconds: number;
  instructions: string[];
  level: string;
  goalLabel: string;
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
      {
        name: input.name,
        muscles: input.muscles,
        sets: input.sets,
        reps: input.reps,
        restSeconds: input.restSeconds,
        instructions: input.instructions,
        level: input.level,
        goalLabel: input.goalLabel,
      },
      question.slice(0, 500)
    );
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The coach is unavailable right now." };
  }
}
