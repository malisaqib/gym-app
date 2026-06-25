"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildGoalPlan, paceFromTimeline, targetDateFrom } from "@/lib/nutrition/goalPlan";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
import { isRegion } from "@/lib/region";
import { getLocalToday } from "@/lib/date";
import type {
  ActivityLevel,
  Experience,
  FoodPreference,
  Lang,
  ProteinPowderPreference,
  Region,
  RelatableGoalKey,
  Sex,
  Timeline,
  TrainingLocation,
} from "@/lib/database.types";

/**
 * Edit the details collected at onboarding, from Settings.
 *
 * We re-validate everything (never trust the client) and re-run the SAME
 * deterministic goal plan used at onboarding (current vs goal weight + pace ->
 * safe pace, calories, macros, timeline) so the targets stay correct. No AI.
 */

const SEXES: Sex[] = ["male", "female"];
const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];
const TIMELINES: Timeline[] = ["no_deadline", "4_weeks", "8_weeks", "12_weeks"];
const LOCATIONS: TrainingLocation[] = ["home", "gym", "both"];
const FOODS: FoodPreference[] = ["normal_desi", "high_protein", "budget", "hostel_student", "veg_limited"];
const LANGS: Lang[] = ["en", "roman_urdu"];
const ACTIVITY_LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "very", "extra"];
const PROTEIN_POWDER_PREFERENCES: ProteinPowderPreference[] = ["enabled", "disabled", "unknown"];
// Derived from the single source of truth so adding a goal in goals.ts can
// never again leave this validator out of sync (the bug that rejected
// "build_muscle" with "Some values look off").
const GOAL_KEYS: RelatableGoalKey[] = RELATABLE_GOALS.map((g) => g.key);

export interface ProfileEditInput {
  fullName: string;
  relatableGoal: RelatableGoalKey;
  timeline: Timeline;
  trainingLocation: TrainingLocation;
  foodPreference: FoodPreference;
  proteinPowderPreference: ProteinPowderPreference;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDays: number;
  experience: Experience;
  region: Region | null; // null = not set yet (older accounts before region existed)
  preferredLanguage: Lang;
  // Usual eating (Phase 2) — optional free text.
  usualBreakfast: string;
  usualLunch: string;
  usualDinner: string;
  usualFoods: string;
  dislikedFoods: string;
}

type Result =
  | {
      ok: true;
      calorieTarget: number;
      proteinTargetG: number;
      carbTargetG: number;
      fatTargetG: number;
      targetDate: string | null;
      // True when the requested timeline needed a faster-than-safe pace and we
      // eased it (the returned targetDate is the SAFE, realistic one).
      paceCapped: boolean;
    }
  | { ok: false; error: string };

export async function updateProfile(input: ProfileEditInput): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const age = Number(input.age);
  const heightCm = Number(input.heightCm);
  const weightKg = Number(input.weightKg);
  const goalWeightKg = Number(input.goalWeightKg);
  const trainingDays = Number(input.trainingDays);

  const valid =
    SEXES.includes(input.sex) &&
    EXPERIENCES.includes(input.experience) &&
    TIMELINES.includes(input.timeline) &&
    LOCATIONS.includes(input.trainingLocation) &&
    FOODS.includes(input.foodPreference) &&
    PROTEIN_POWDER_PREFERENCES.includes(input.proteinPowderPreference) &&
    LANGS.includes(input.preferredLanguage) &&
    GOAL_KEYS.includes(input.relatableGoal) &&
    ACTIVITY_LEVELS.includes(input.activityLevel) &&
    (input.region === null || isRegion(input.region)) &&
    Number.isFinite(age) && age >= 13 && age <= 99 &&
    Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230 &&
    Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250 &&
    Number.isFinite(goalWeightKg) && goalWeightKg >= 30 && goalWeightKg <= 250 &&
    Number.isInteger(trainingDays) && trainingDays >= 0 && trainingDays <= 7;

  if (!valid) return { ok: false, error: "Some values look off — please check and try again." };

  const plan = buildGoalPlan({
    sex: input.sex,
    age,
    heightCm,
    currentWeightKg: weightKg,
    goalWeightKg,
    activityLevel: input.activityLevel,
    pace: paceFromTimeline(input.timeline, weightKg, goalWeightKg), // timeline drives pace
  });

  const today = await getLocalToday();
  const targetDate = targetDateFrom(today, plan.weeksToGoal);

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim().slice(0, 80) || null,
      goal: plan.goal,
      relatable_goal: input.relatableGoal,
      timeline: input.timeline,
      training_location: input.trainingLocation,
      food_preference: input.foodPreference,
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
      usual_breakfast: input.usualBreakfast.trim() || null,
      usual_lunch: input.usualLunch.trim() || null,
      usual_dinner: input.usualDinner.trim() || null,
      usual_foods: input.usualFoods.trim() || null,
      disliked_foods: input.dislikedFoods.trim() || null,
      preferred_language: input.preferredLanguage,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  // Other screens read these — refresh their cached renders.
  revalidatePath("/dashboard");
  revalidatePath("/diet");
  revalidatePath("/coach");
  revalidatePath("/weight");
  revalidatePath("/settings");
  return {
    ok: true,
    calorieTarget: plan.calorieTarget,
    proteinTargetG: plan.proteinTargetG,
    carbTargetG: plan.carbTargetG,
    fatTargetG: plan.fatTargetG,
    targetDate,
    paceCapped: plan.paceCapped,
  };
}
