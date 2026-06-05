import type { ActivityLevel, Sex } from "@/lib/database.types";
import { buildGoalPlan, detectDirection, type GoalDirection, type GoalPlan, type PaceChoice } from "./goalPlan.ts";

/**
 * Adaptive recalculation (Phase 3).
 *
 * Pure, deterministic functions (no DB, no AI):
 *   - recomputePlan: rebuild the targets from a NEW current weight, reusing the
 *     stored goal weight / activity / pace. Called whenever the user weighs in,
 *     so targets follow the body instead of going stale.
 *   - detectPlateau: look at recent weigh-ins and decide if progress has stalled.
 *   - suggestAdjustment: a gentle, safe next step when stalled (the AI only
 *     PHRASES this; it never invents the numbers or the decision).
 *
 * Nutrition targets should be reviewed by a qualified dietitian before launch.
 */

// The profile fields the recompute needs (all nullable — older/partial rows).
export interface AdaptProfile {
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  activityLevel: ActivityLevel | null;
  weeklyPaceKg: number | null;
}

/** Do we have enough to recompute? Needs the body basics. */
export function canRecompute(p: AdaptProfile): boolean {
  return p.sex != null && p.age != null && p.heightCm != null;
}

/**
 * Rebuild the full plan from a new current weight, reusing the stored goal.
 * The stored signed pace is treated as the chosen magnitude and RE-CAPPED for
 * the new weight (the 1%-bodyweight cap shifts as you get lighter). Returns null
 * if the profile is too incomplete to compute.
 */
export function recomputePlan(p: AdaptProfile, newWeightKg: number): GoalPlan | null {
  if (!canRecompute(p)) return null;
  const mag = Math.round(Math.abs(p.weeklyPaceKg ?? 0) * 100) / 100;
  const pace: PaceChoice = mag > 0 ? mag : "recommended";
  return buildGoalPlan({
    sex: p.sex as Sex,
    age: p.age as number,
    heightCm: p.heightCm as number,
    currentWeightKg: newWeightKg,
    goalWeightKg: p.goalWeightKg,
    activityLevel: p.activityLevel ?? "light",
    pace,
  });
}

// --- Plateau detection ------------------------------------------------------

export interface WeightPoint {
  logged_on: string; // YYYY-MM-DD
  weight_kg: number;
}

export type PlateauStatus = "insufficient" | "on_track" | "plateau";

export interface PlateauResult {
  status: PlateauStatus;
  points: number; // weigh-ins used in the window
  spanDays: number; // days between first and last in the window
  towardGoalKg: number; // net change TOWARD the goal (+ = progress, − = away)
  weeklyRateKg: number; // signed actual weekly rate (− = losing)
}

const WINDOW_DAYS = 21; // look back ~3 weeks
const MIN_DAYS = 14; // need at least ~2 weeks of span to judge
const MIN_POINTS = 3; // and at least 3 weigh-ins
const TOWARD_GOAL_THRESHOLD_KG = 0.3; // less than this toward the goal = stalled

const dayMs = 86_400_000;
const parseDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Decide whether weight has stalled over the last ~2–3 weeks. Only meaningful
 * when actively losing or gaining (maintain has no "progress").
 */
export function detectPlateau(
  history: WeightPoint[],
  direction: GoalDirection,
  todayISO: string
): PlateauResult {
  const empty: PlateauResult = { status: "insufficient", points: 0, spanDays: 0, towardGoalKg: 0, weeklyRateKg: 0 };
  if (direction === "maintain") return empty;

  const cutoff = parseDay(todayISO) - WINDOW_DAYS * dayMs;
  const win = history
    .filter((h) => parseDay(h.logged_on) >= cutoff)
    .sort((a, b) => a.logged_on.localeCompare(b.logged_on));

  if (win.length < MIN_POINTS) return { ...empty, points: win.length };

  const first = win[0];
  const last = win[win.length - 1];
  const spanDays = Math.round((parseDay(last.logged_on) - parseDay(first.logged_on)) / dayMs);
  if (spanDays < MIN_DAYS) return { ...empty, points: win.length, spanDays };

  const change = last.weight_kg - first.weight_kg; // negative = lost weight
  const towardGoal = direction === "lose" ? -change : change; // positive = progress
  const weeklyRate = change / (spanDays / 7);

  return {
    status: towardGoal < TOWARD_GOAL_THRESHOLD_KG ? "plateau" : "on_track",
    points: win.length,
    spanDays,
    towardGoalKg: round1(towardGoal),
    weeklyRateKg: round2(weeklyRate),
  };
}

// --- Suggested adjustment (deterministic; AI only phrases it) ----------------

export type AdjustmentKind = "lower_activity" | "trim_calories" | "add_calories";

export interface Adjustment {
  kind: AdjustmentKind;
  calorieDelta: number; // signed informational change (already floor-safe)
}

const HARD_CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
const NUDGE_KCAL = 100;
const GAIN_NUDGE_KCAL = 120;

/**
 * A single, gentle adjustment for a stall — within safety floors. For a loss
 * stall we prefer reframing activity (bodies adjust; estimates drift) and only
 * trim a little if already sedentary. For a gain stall we add a little food.
 */
export function suggestAdjustment(input: {
  direction: GoalDirection;
  activityLevel: ActivityLevel;
  calorieTarget: number;
  sex: Sex;
}): Adjustment {
  const floor = HARD_CALORIE_FLOOR[input.sex];
  if (input.direction === "gain") {
    return { kind: "add_calories", calorieDelta: GAIN_NUDGE_KCAL };
  }
  // lose (maintain never reaches here — no plateau)
  if (input.activityLevel !== "sedentary") {
    return { kind: "lower_activity", calorieDelta: 0 };
  }
  const trimmed = Math.max(floor, input.calorieTarget - NUDGE_KCAL);
  return { kind: "trim_calories", calorieDelta: trimmed - input.calorieTarget };
}

/** Convenience: direction from current vs goal (re-export of the goalPlan rule). */
export function directionFor(currentKg: number, goalKg: number | null): GoalDirection {
  return detectDirection(currentKg, goalKg);
}

// helpers
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
