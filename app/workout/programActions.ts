"use server";

import { createClient } from "@/lib/supabase/server";
import { ALL_EXERCISES } from "@/lib/workouts/exerciseCatalog";
import { generateProgram, type WeeklyProgram } from "@/lib/workouts/generator";
import { goalToEmphasis, normalizeTrainingSetup, type TrainingSetup } from "@/lib/workouts/trainingSetup";

/**
 * Workout rebuild — Phase 4: build the deterministic program on the server.
 *
 * Why a server action? The exercise dataset (~1MB) lives in exerciseCatalog and
 * must NOT ship to the client. The client sends its (localStorage) setup; we
 * generate here against the full catalog and return only the small program.
 * The emphasis is REUSED from the user's onboarding goal — we never ask again.
 * This is still 100% deterministic: no AI is involved.
 */
export async function buildProgram(
  raw: TrainingSetup
): Promise<{ ok: true; program: WeeklyProgram } | { ok: false; error: string }> {
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
  return { ok: true, program };
}
