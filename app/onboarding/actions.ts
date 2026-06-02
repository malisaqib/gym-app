"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateTargets, type TargetResult } from "@/lib/nutrition/engine";
import type { OnboardingInput } from "@/lib/onboarding/questions";
import type { Experience, Goal, Sex } from "@/lib/database.types";

// Allowed values, used to validate the client input on the server (never trust
// the client). These mirror the CHECK constraints in the SQL schema.
const GOALS: Goal[] = ["lose_fat", "maintain", "gain_muscle"];
const SEXES: Sex[] = ["male", "female"];
const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];

type SaveResult =
  | { ok: true; result: TargetResult }
  | { ok: false; error: string };

/**
 * Saves a completed onboarding flow:
 *   1. validate the structured input,
 *   2. run the pure calorie/protein engine,
 *   3. write the inputs, the targets, the language and the raw transcript to
 *      the user's profile and mark them onboarded.
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
    GOALS.includes(input.goal) &&
    SEXES.includes(input.sex) &&
    EXPERIENCES.includes(input.experience) &&
    Number.isFinite(age) && age >= 13 && age <= 99 &&
    Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230 &&
    Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250 &&
    Number.isInteger(trainingDays) && trainingDays >= 0 && trainingDays <= 7;

  if (!valid) {
    return { ok: false, error: "Some answers looked off. Please try again." };
  }

  // --- Run the engine (pure function, no AI) --------------------------------
  const result = calculateTargets({
    sex: input.sex,
    age,
    heightCm,
    weightKg,
    trainingDays,
    goal: input.goal,
  });

  // --- Save to the user's profile -------------------------------------------
  const { error } = await supabase
    .from("profiles")
    .update({
      goal: input.goal,
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
  return { ok: true, result };
}
