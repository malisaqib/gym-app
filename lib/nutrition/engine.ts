import type { ActivityLevel, Goal, Sex } from "@/lib/database.types";

/**
 * Calorie & protein engine.
 *
 * Pure, deterministic functions (no database, no AI, no randomness) so they are
 * easy to read and to unit-test. Based on the Mifflin–St Jeor equation, the most
 * widely used resting-metabolism formula for healthy adults.
 *
 * Flow:  inputs -> BMR -> TDEE (maintenance) -> calorie target for the goal/pace
 *                                            -> protein target
 *
 * ACTIVITY CONVENTION (read before changing anything):
 *   TDEE = BMR * activityFactor, where activityFactor comes from ONE honest
 *   question about the user's WHOLE-DAY activity (sedentary..extra). Training is
 *   treated as ALREADY INCLUDED in that choice, so we NEVER add workout/exercise
 *   calories on top of TDEE — that would double-count.
 *   (This is the bug we fixed: the factor used to be inferred from training days
 *   alone, which over-stated maintenance by ~300–450 kcal for the typical user
 *   who trains a few times a week but is otherwise sedentary.)
 *
 * Nutrition targets should be reviewed by a qualified dietitian before public
 * launch. The pace cap + hard floors below keep changes gradual — never extreme.
 */

export interface TargetInput {
  sex: Sex;
  age: number; // years
  heightCm: number;
  weightKg: number;
  goal: Goal;
  // Honest whole-day activity level. Optional for now: until the onboarding
  // activity question is wired (next phase), callers omit it and we assume a
  // conservative "light" baseline rather than inferring activity from training.
  activityLevel?: ActivityLevel;
  // Signed weekly weight-change pace in kg (negative = loss, positive = gain).
  // Optional: if omitted we derive a sensible default from `goal`.
  weeklyPaceKg?: number;
}

export interface TargetResult {
  bmr: number; // resting calories burned per day
  activityFactor: number; // multiplier applied to BMR to get TDEE
  tdee: number; // maintenance calories per day
  calorieTarget: number; // recommended daily calories for the goal/pace
  proteinTargetG: number; // recommended daily protein in grams
  weeklyPaceKg: number; // the pace actually used (after safe capping)
  paceCapped: boolean; // true if we reduced an unsafe requested pace
  safetyFloorApplied: boolean; // true if we raised calories to the hard floor
}

// --- Tunable assumptions (kept here so they're visible and easy to change) --

// Whole-day activity multipliers (BMR -> TDEE). Standard Mifflin–St Jeor.
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little movement, little/no exercise
  light: 1.375, // light activity or light exercise ~1–3 days/week
  moderate: 1.55, // moderate activity or exercise ~3–5 days/week
  very: 1.725, // very active or hard exercise ~6–7 days/week
  extra: 1.9, // very hard exercise AND a physical job
};

// Interim default until the onboarding activity question lands (see TargetInput).
const DEFAULT_ACTIVITY: ActivityLevel = "light";

// Energy convention: ~7000 kcal per kg of body mass (a common practical figure),
// so 0.5 kg/week ≈ 500 kcal/day and 0.25 kg/week ≈ 250 kcal/day.
const KCAL_PER_KG = 7000;

// Safe weekly pace caps. Loss is capped hard; gain kept slow for beginners.
const MAX_LOSS_PACE_KG = 0.75; // never apply a steeper deficit than this
const MAX_GAIN_PACE_KG = 0.5;

// Default weekly pace per practical goal, when the caller doesn't specify one.
const DEFAULT_PACE_KG: Record<Goal, number> = {
  lose_fat: -0.5, // mild, sustainable deficit (~500 kcal/day)
  maintain: 0,
  gain_muscle: 0.25, // slow lean gain (~250 kcal/day) — beginners shouldn't bulk hard
};

// Protein per kg of bodyweight per goal. Higher in a deficit to protect muscle
// (within the accepted 1.6–2.2 g/kg band). Exported so goalPlan's macro split
// uses the SAME table — one source for protein math.
// Targets and safety caps should be reviewed by a qualified dietitian before
// public launch.
export const GOAL_PROTEIN_PER_KG: Record<Goal, number> = {
  lose_fat: 2.0,
  maintain: 1.6,
  gain_muscle: 1.8,
};

// The absolute lowest daily calories we will ever recommend, by sex. A hard
// backstop against unsafe crash diets.
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

/** Whole-day activity multiplier for an honest activity level. */
export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_FACTORS[level];
}

/** Total Daily Energy Expenditure = maintenance calories. */
export function calculateTdee(input: TargetInput): number {
  const level = input.activityLevel ?? DEFAULT_ACTIVITY;
  return calculateBmr(input) * activityFactor(level);
}

/**
 * Clamp a requested weekly pace into the safe range:
 *   loss capped at -MAX_LOSS_PACE_KG, gain capped at +MAX_GAIN_PACE_KG.
 * Returns the safe pace and whether we had to change it (so the UI can explain).
 */
export function capWeeklyPace(weeklyPaceKg: number): { pace: number; capped: boolean } {
  if (weeklyPaceKg < -MAX_LOSS_PACE_KG) return { pace: -MAX_LOSS_PACE_KG, capped: true };
  if (weeklyPaceKg > MAX_GAIN_PACE_KG) return { pace: MAX_GAIN_PACE_KG, capped: true };
  return { pace: weeklyPaceKg, capped: false };
}

/** Protein target in grams, rounded to the nearest 5g. */
export function calculateProteinTarget(input: TargetInput): number {
  const grams = input.weightKg * GOAL_PROTEIN_PER_KG[input.goal];
  return roundTo(grams, 5);
}

/**
 * Daily calorie target = TDEE + (capped weekly pace converted to a kcal/day
 * delta), then floored at the hard minimum so we never recommend an unsafe cut.
 * Returns the pace actually used plus the two safety flags.
 */
export function calculateCalorieTarget(input: TargetInput): {
  calorieTarget: number;
  weeklyPaceKg: number;
  paceCapped: boolean;
  safetyFloorApplied: boolean;
} {
  const tdee = calculateTdee(input);

  const requested = input.weeklyPaceKg ?? DEFAULT_PACE_KG[input.goal];
  const { pace, capped } = capWeeklyPace(requested);

  const dailyDelta = (pace * KCAL_PER_KG) / 7; // -0.5 kg/wk -> -500 kcal/day
  const raw = tdee + dailyDelta;

  const floor = HARD_CALORIE_FLOOR[input.sex];
  const safe = Math.max(raw, floor);

  return {
    calorieTarget: roundTo(safe, 10),
    weeklyPaceKg: pace,
    paceCapped: capped,
    safetyFloorApplied: safe > raw, // we had to raise calories for safety
  };
}

/** Run the whole engine: inputs -> calorie & protein targets. */
export function calculateTargets(input: TargetInput): TargetResult {
  const bmr = calculateBmr(input);
  const level = input.activityLevel ?? DEFAULT_ACTIVITY;
  const factor = activityFactor(level);
  const tdee = bmr * factor;
  const { calorieTarget, weeklyPaceKg, paceCapped, safetyFloorApplied } =
    calculateCalorieTarget(input);

  return {
    bmr: Math.round(bmr),
    activityFactor: factor,
    tdee: Math.round(tdee),
    calorieTarget,
    proteinTargetG: calculateProteinTarget(input),
    weeklyPaceKg,
    paceCapped,
    safetyFloorApplied,
  };
}

// --- helpers ----------------------------------------------------------------

/** Round a number to the nearest `step` (e.g. nearest 10 or 5). */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
