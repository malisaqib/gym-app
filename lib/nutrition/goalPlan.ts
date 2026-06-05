import type { ActivityLevel, Goal, Sex } from "@/lib/database.types";
import { calculateCalorieTarget } from "./engine.ts";

/**
 * Target-weight goal planning (Phase 2).
 *
 * Pure, deterministic functions (no DB, no AI). Given a current + goal weight and
 * a desired pace, it works out:
 *   - the direction (lose / gain / maintain),
 *   - a SAFE weekly pace (capped), and why if it had to cap,
 *   - the daily calorie target (via the same engine — single source of the math),
 *   - simple macros (protein ~1.6 g/kg, then fat %, rest carbs),
 *   - an estimated timeline (weeks) to the goal.
 *
 * Nutrition targets should be reviewed by a qualified dietitian before public
 * launch. All caps below keep change gradual and never extreme.
 */

export type GoalDirection = "lose" | "gain" | "maintain";

// "recommended" lets the app pick a sensible pace; a number is an ABS kg/week
// magnitude the user explicitly chose.
export type PaceChoice = "recommended" | number;

export interface GoalPlanInput {
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  goalWeightKg: number | null; // null => maintain
  activityLevel: ActivityLevel;
  pace: PaceChoice;
}

export interface GoalPlan {
  direction: GoalDirection;
  goal: Goal; // practical goal derived from the direction
  weeklyPaceKg: number; // signed, AFTER capping (loss negative, gain positive)
  paceCapped: boolean; // the requested pace exceeded a safe cap
  calorieTarget: number;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
  safetyFloorApplied: boolean;
  weeksToGoal: number | null; // null when maintaining
  totalChangeKg: number; // absolute kg to move (0 for maintain)
}

// --- tunables (mirror the engine's safety stance) ---------------------------
const MAINTAIN_DEADBAND_KG = 1.0; // within this of the goal => just maintain
const MAX_LOSS_PACE_KG = 0.75; // hard weekly loss cap (also enforced in engine)
const MAX_LOSS_BODYWEIGHT_PCT = 0.01; // ...and never more than 1% of bodyweight/week
const MAX_GAIN_PACE_KG = 0.5; // keep gains slow/lean
const PROTEIN_PER_KG = 1.6; // simple, sensible (Phase 2 spec)
const FAT_PCT_OF_CALORIES = 0.275; // ~27.5% from fat (healthy 20–35% band), rest carbs

const DIRECTION_TO_GOAL: Record<GoalDirection, Goal> = {
  lose: "lose_fat",
  gain: "gain_muscle",
  maintain: "maintain",
};

/** Which way are we going, with a small deadband around the goal = maintain. */
export function detectDirection(currentKg: number, goalKg: number | null): GoalDirection {
  if (goalKg == null) return "maintain";
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < MAINTAIN_DEADBAND_KG) return "maintain";
  return diff < 0 ? "lose" : "gain";
}

/** The safe weekly pace MAGNITUDE (kg/wk, positive) allowed for a direction. */
export function maxPaceMagnitude(direction: GoalDirection, currentKg: number): number {
  // round2 avoids float dust like 0.01 * 70 = 0.7000000000000001.
  if (direction === "lose") return Math.min(MAX_LOSS_PACE_KG, round2(MAX_LOSS_BODYWEIGHT_PCT * currentKg));
  if (direction === "gain") return MAX_GAIN_PACE_KG;
  return 0;
}

/** A sensible recommended pace MAGNITUDE (kept within the cap). */
export function recommendedPaceMagnitude(direction: GoalDirection, currentKg: number): number {
  const cap = maxPaceMagnitude(direction, currentKg);
  if (direction === "lose") return Math.min(0.5, cap); // ~0.5 kg/wk, or 1% if smaller
  if (direction === "gain") return Math.min(0.25, cap); // slow lean gain
  return 0;
}

/**
 * Split a daily calorie target into protein/carb/fat grams.
 * Protein is bodyweight-based; fat is a % of calories; carbs take the rest.
 * (This logic is mirrored in the SQL backfill in migration 0009 — keep in sync.)
 */
export function splitMacros(
  calorieTarget: number,
  currentWeightKg: number
): { proteinG: number; carbG: number; fatG: number } {
  const proteinG = round5(currentWeightKg * PROTEIN_PER_KG);
  const proteinKcal = proteinG * 4;
  const fatKcal = Math.round(calorieTarget * FAT_PCT_OF_CALORIES);
  const fatG = Math.max(0, Math.round(fatKcal / 9));
  const carbKcal = Math.max(0, calorieTarget - proteinKcal - fatKcal);
  const carbG = Math.round(carbKcal / 4);
  return { proteinG, carbG, fatG };
}

/** Build the full deterministic plan. */
export function buildGoalPlan(input: GoalPlanInput): GoalPlan {
  const direction = detectDirection(input.currentWeightKg, input.goalWeightKg);
  const goal = DIRECTION_TO_GOAL[direction];

  // Resolve the requested magnitude, then cap it to the safe rate.
  const requested =
    input.pace === "recommended"
      ? recommendedPaceMagnitude(direction, input.currentWeightKg)
      : Math.abs(input.pace);
  const cap = maxPaceMagnitude(direction, input.currentWeightKg);
  const magnitude = direction === "maintain" ? 0 : round2(Math.min(requested, cap));
  const paceCapped = direction !== "maintain" && requested > cap + 1e-9;

  const signed = direction === "lose" ? -magnitude : direction === "gain" ? magnitude : 0;

  // Calories via the SAME pure engine (the only place BMR/TDEE math lives).
  const { calorieTarget, safetyFloorApplied } = calculateCalorieTarget({
    sex: input.sex,
    age: input.age,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
    goal,
    activityLevel: input.activityLevel,
    weeklyPaceKg: signed,
  });

  const { proteinG, carbG, fatG } = splitMacros(calorieTarget, input.currentWeightKg);

  // Estimated timeline from the (capped) pace.
  const totalChangeKg =
    input.goalWeightKg == null ? 0 : Math.abs(input.goalWeightKg - input.currentWeightKg);
  const weeksToGoal =
    direction === "maintain" || magnitude <= 0 ? null : Math.ceil(totalChangeKg / magnitude);

  return {
    direction,
    goal,
    weeklyPaceKg: signed,
    paceCapped,
    calorieTarget,
    proteinTargetG: proteinG,
    carbTargetG: carbG,
    fatTargetG: fatG,
    safetyFloorApplied,
    weeksToGoal,
    totalChangeKg: round1(totalChangeKg),
  };
}

/** Target date = today + weeks·7, as YYYY-MM-DD. Pure (caller passes today). */
export function targetDateFrom(todayISO: string, weeks: number | null): string | null {
  if (weeks == null || weeks <= 0) return null;
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// helpers
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
