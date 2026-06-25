"use server";

import { createClient } from "@/lib/supabase/server";
import { buildGoalPlan, paceFromTimeline, targetDateFrom, type GoalPlan } from "@/lib/nutrition/goalPlan";
import { getLocalToday } from "@/lib/date";
import type { OnboardingInput } from "@/lib/onboarding/questions";
import { buildPlanGuidance, type PlanGuidance } from "@/lib/onboarding/goals";
import { isRegion } from "@/lib/region";
import { logEvent } from "@/lib/analytics";
import type {
  ActivityLevel,
  DietMode,
  Experience,
  ProteinPowderPreference,
  Sex,
} from "@/lib/database.types";

// Allowed values, used to validate the client input on the server (never trust
// the client). These mirror the CHECK constraints in the SQL schema.
const SEXES: Sex[] = ["male", "female"];
const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];
const ACTIVITY_LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "very", "extra"];
const PROTEIN_POWDER_PREFERENCES: ProteinPowderPreference[] = ["enabled", "disabled", "unknown"];
const DIET_MODES: DietMode[] = ["vegetarian", "flexitarian", "non_veg", "unknown"];

type SaveResult =
  | { ok: true; plan: GoalPlan; targetDate: string | null; goalWeightKg: number; guidance: PlanGuidance }
  | { ok: false; error: string };

/**
 * Saves a completed onboarding flow:
 *   1. validate the structured input,
 *   2. build a deterministic goal plan from current vs goal weight + pace
 *      (direction, safe pace, calories, macros, timeline) — no AI in the math,
 *   3. write inputs, targets, language, relatable fields and the raw transcript
 *      to the profile and mark the user onboarded,
 *   4. return the plan + friendly guidance for the final screen.
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
  const goalWeightKg = Number(input.goalWeightKg);
  const trainingDays = Number(input.trainingDays);

  const valid =
    SEXES.includes(input.sex) &&
    EXPERIENCES.includes(input.experience) &&
    ACTIVITY_LEVELS.includes(input.activityLevel) &&
    DIET_MODES.includes(input.dietMode) &&
    PROTEIN_POWDER_PREFERENCES.includes(input.proteinPowderPreference) &&
    isRegion(input.region) &&
    Number.isFinite(age) && age >= 13 && age <= 99 &&
    Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230 &&
    Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250 &&
    Number.isFinite(goalWeightKg) && goalWeightKg >= 30 && goalWeightKg <= 250 &&
    Number.isInteger(trainingDays) && trainingDays >= 0 && trainingDays <= 7;

  if (!valid) {
    return { ok: false, error: "Some answers looked off. Please try again." };
  }

  // --- Deterministic goal plan (the direction, safe pace, calories + macros) -
  // The chosen timeline drives the pace (re-capped safely inside buildGoalPlan).
  const plan = buildGoalPlan({
    sex: input.sex,
    age,
    heightCm,
    currentWeightKg: weightKg,
    goalWeightKg,
    activityLevel: input.activityLevel,
    pace: paceFromTimeline(input.timeline, weightKg, goalWeightKg),
  });

  const today = await getLocalToday();
  const targetDate = targetDateFrom(today, plan.weeksToGoal);

  // Friendly guidance, using the plan's direction so it can't contradict the
  // numeric target (the relatable goal still supplies tone/diet/workout text).
  const guidance = buildPlanGuidance({
    relatableGoalKey: input.relatableGoal,
    timeline: input.timeline,
    foodPreference: input.foodPreference,
    trainingLocation: input.trainingLocation,
    lang: input.preferredLanguage,
    goalOverride: plan.goal,
  });

  // --- Save to the user's profile -------------------------------------------
  const { error } = await supabase
    .from("profiles")
    .update({
      goal: plan.goal,
      relatable_goal: input.relatableGoal,
      timeline: input.timeline,
      training_location: input.trainingLocation,
      food_preference: input.foodPreference,
      diet_mode: input.dietMode,
      protein_powder_preference: input.proteinPowderPreference,
      sex: input.sex,
      age,
      height_cm: heightCm,
      weight_kg: weightKg,
      goal_weight_kg: goalWeightKg,
      activity_level: input.activityLevel,
      weekly_pace_kg: plan.weeklyPaceKg,
      target_date: targetDate,
      training_days: trainingDays,
      experience: input.experience,
      region: input.region,
      calorie_target: plan.calorieTarget,
      protein_target_g: plan.proteinTargetG,
      carb_target_g: plan.carbTargetG,
      fat_target_g: plan.fatTargetG,
      // Usual eating (Phase 2) — optional; empty strings stored as null.
      usual_breakfast: input.usualBreakfast.trim() || null,
      usual_lunch: input.usualLunch.trim() || null,
      usual_dinner: input.usualDinner.trim() || null,
      usual_foods: input.usualFoods.trim() || null,
      disliked_foods: input.dislikedFoods.trim() || null,
      preferred_language: input.preferredLanguage,
      onboarding_raw: input.transcript,
      onboarded: true,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Seed the weight chart with their starting weight + record the event.
  // Both are best-effort and must not block a successful onboarding.
  await supabase.from("bodyweight_logs").insert({ user_id: user.id, weight_kg: weightKg });
  await logEvent(supabase, user.id, "onboarding_completed", {
    goal: plan.goal,
    relatable_goal: input.relatableGoal,
    direction: plan.direction,
  });

  // NOTE: deliberately NO revalidatePath here. Any revalidate inside a server
  // action purges the client Router Cache and re-fetches the CURRENT route —
  // /onboarding's gate then sees onboarded=true and its redirect("/dashboard")
  // yanks the user off the results screen mid-read (the "glitch"). The
  // dashboard was never visited/cached this session, so the post-results
  // navigation fetches it fresh anyway.
  return { ok: true, plan, targetDate, goalWeightKg, guidance };
}
