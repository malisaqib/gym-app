import type { Goal, Sex } from "@/lib/database.types";

/**
 * Phase 2 — Calorie & protein engine.
 *
 * Pure, deterministic functions (no database, no AI, no randomness) so they are
 * easy to read and test. The math is based on the Mifflin–St Jeor equation, the
 * most widely used and accurate resting-metabolism formula for healthy adults.
 *
 * Flow:  inputs -> BMR -> TDEE (maintenance) -> calorie target for the goal
 *                                            -> protein target for the goal
 *
 * Nutrition target logic should be reviewed by a qualified dietitian before
 * public launch. Safety floors below cap deficits to steer toward gradual,
 * sustainable change — never extreme cuts.
 */

export interface TargetInput {
  sex: Sex;
  age: number; // years
  heightCm: number;
  weightKg: number;
  trainingDays: number; // training sessions per week, 0–7
  goal: Goal;
}

export interface TargetResult {
  bmr: number; // resting calories burned per day
  activityFactor: number; // multiplier applied to BMR to get TDEE
  tdee: number; // maintenance calories per day
  calorieTarget: number; // recommended daily calories for the goal
  proteinTargetG: number; // recommended daily protein in grams
  safetyFloorApplied: boolean; // true if we raised calories for safety
}

// --- Tunable assumptions (kept here so they're visible and easy to change) --

// Activity multipliers (BMR -> TDEE). Standard Mifflin–St Jeor factors.
const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  veryActive: 1.725,
  extraActive: 1.9,
} as const;

// Calorie adjustment per goal, relative to maintenance (TDEE).
const GOAL_CALORIE_MULTIPLIER: Record<Goal, number> = {
  lose_fat: 0.8, // ~20% deficit
  maintain: 1.0,
  gain_muscle: 1.1, // ~10% lean surplus (beginners shouldn't bulk hard)
};

// Protein per kg of bodyweight per goal. Higher in a deficit to protect muscle.
const GOAL_PROTEIN_PER_KG: Record<Goal, number> = {
  lose_fat: 2.0,
  maintain: 1.6,
  gain_muscle: 1.8,
};

// The absolute lowest daily calories we will ever recommend, by sex. A backstop
// against unsafe crash diets.
const HARD_CALORIE_FLOOR: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};

// --- Core functions ---------------------------------------------------------

/** Mifflin–St Jeor resting metabolic rate (calories burned at rest). */
export function calculateBmr(input: TargetInput): number {
  const { weightKg, heightCm, age, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // The only difference between sexes is a constant offset.
  return sex === "male" ? base + 5 : base - 161;
}

/** Map weekly training sessions to an activity multiplier. */
export function activityFactorForTrainingDays(trainingDays: number): number {
  if (trainingDays <= 0) return ACTIVITY_FACTORS.sedentary;
  if (trainingDays <= 2) return ACTIVITY_FACTORS.light;
  if (trainingDays <= 4) return ACTIVITY_FACTORS.moderate;
  if (trainingDays <= 6) return ACTIVITY_FACTORS.veryActive;
  return ACTIVITY_FACTORS.extraActive; // 7 days/week
}

/** Total Daily Energy Expenditure = maintenance calories. */
export function calculateTdee(input: TargetInput): number {
  return calculateBmr(input) * activityFactorForTrainingDays(input.trainingDays);
}

/** Protein target in grams, rounded to the nearest 5g. */
export function calculateProteinTarget(input: TargetInput): number {
  const grams = input.weightKg * GOAL_PROTEIN_PER_KG[input.goal];
  return roundTo(grams, 5);
}

/**
 * Daily calorie target for the goal, with safety floors so we never recommend
 * an unsafe deficit:
 *   - never below the user's BMR (don't eat under what your body burns at rest)
 *   - never below the absolute hard floor (1200 kcal F / 1500 kcal M)
 *
 * Returns whether a floor had to be applied, so the UI can explain it.
 */
export function calculateCalorieTarget(input: TargetInput): {
  calorieTarget: number;
  safetyFloorApplied: boolean;
} {
  const bmr = calculateBmr(input);
  const tdee = bmr * activityFactorForTrainingDays(input.trainingDays);

  const raw = tdee * GOAL_CALORIE_MULTIPLIER[input.goal];

  // Floors realistically only bite for the fat-loss goal (the one that cuts).
  const floor = Math.max(bmr, HARD_CALORIE_FLOOR[input.sex]);
  const safe = Math.max(raw, floor);

  return {
    calorieTarget: roundTo(safe, 10),
    safetyFloorApplied: safe > raw, // we had to raise calories for safety
  };
}

/** Run the whole engine: inputs -> calorie & protein targets. */
export function calculateTargets(input: TargetInput): TargetResult {
  const bmr = calculateBmr(input);
  const activityFactor = activityFactorForTrainingDays(input.trainingDays);
  const tdee = bmr * activityFactor;
  const { calorieTarget, safetyFloorApplied } = calculateCalorieTarget(input);

  return {
    bmr: Math.round(bmr),
    activityFactor,
    tdee: Math.round(tdee),
    calorieTarget,
    proteinTargetG: calculateProteinTarget(input),
    safetyFloorApplied,
  };
}

// --- helpers ----------------------------------------------------------------

/** Round a number to the nearest `step` (e.g. nearest 10 or 5). */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
