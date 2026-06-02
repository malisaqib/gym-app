"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateTargets, type TargetResult } from "@/lib/nutrition/engine";
import type { OnboardingInput } from "@/lib/onboarding/questions";
import { mapRelatableGoal, buildPlanGuidance, type PlanGuidance } from "@/lib/onboarding/goals";
import type { Experience, Sex } from "@/lib/database.types";

// Allowed values, used to validate the client input on the server (never trust
// the client). These mirror the CHECK constraints in the SQL schema.
const SEXES: Sex[] = ["male", "female"];
const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];

type SaveResult =
  | { ok: true; result: TargetResult; guidance: PlanGuidance }
  | { ok: false; error: string };

/**
 * Saves a completed onboarding flow:
 *   1. validate the structured input,
 *   2. map the relatable goal -> a practical goal, then run the calorie engine,
 *   3. write inputs, targets, language, relatable fields and the raw transcript
 *      to the profile and mark the user onboarded,
 *   4. return targets + friendly plan guidance for the final screen.
 */
export async function saveOnboarding(input: OnboardingInput): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  // --- Validate (defensive: the UI restricts these, but re-check anyway) ----
  const age = Number(input.age);
  const heightCm = Number(input.heightCm);
  const weightKg = Number(input.weightKg);
  const trainingDays = Number(input.trainingDays);

  const valid =
    SEXES.includes(input.sex) &&
    EXPERIENCES.includes(input.experience) &&
    Number.isFinite(age) && age >= 13 && age <= 99 &&
    Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230 &&
    Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250 &&
    Number.isInteger(trainingDays) && trainingDays >= 0 && trainingDays <= 7;

  if (!valid) {
    return { ok: false, error: "Some answers looked off. Please try again." };
  }

  // --- Map relatable goal -> practical goal, then run the engine ------------
  const goalDef = mapRelatableGoal(input.relatableGoal);

  const result = calculateTargets({
    sex: input.sex,
    age,
    heightCm,
    weightKg,
    trainingDays,
    goal: goalDef.goal,
  });

  const guidance = buildPlanGuidance({
    relatableGoalKey: input.relatableGoal,
    timeline: input.timeline,
    foodPreference: input.foodPreference,
    trainingLocation: input.trainingLocation,
    lang: input.preferredLanguage,
  });

  // --- Save to the user's profile -------------------------------------------
  const { error } = await supabase
    .from("profiles")
    .update({
      goal: goalDef.goal,
      relatable_goal: input.relatableGoal,
      timeline: input.timeline,
      training_location: input.trainingLocation,
      food_preference: input.foodPreference,
      sex: input.sex,
      age,
      height_cm: heightCm,
      weight_kg: weightKg,
      training_days: trainingDays,
      experience: input.experience,
      calorie_target: result.calorieTarget,
      protein_target_g: result.proteinTargetG,
      preferred_language: input.preferredLanguage,
      onboarding_raw: input.transcript,
      onboarded: true,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // The dashboard reads the profile, so refresh its cached render.
  revalidatePath("/dashboard");
  return { ok: true, result, guidance };
}
