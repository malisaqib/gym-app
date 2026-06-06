import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDirection,
  maxPaceMagnitude,
  recommendedPaceMagnitude,
  splitMacros,
  buildGoalPlan,
  paceFromTimeline,
  targetDateFrom,
  type GoalPlanInput,
} from "./goalPlan.ts";

// Reference person from the engine tests: male, 25y, 176cm, moderate activity.
const base: Omit<GoalPlanInput, "currentWeightKg" | "goalWeightKg" | "pace"> = {
  sex: "male",
  age: 25,
  heightCm: 176,
  activityLevel: "moderate",
};

test("detectDirection: deadband, lose, gain, null", () => {
  assert.equal(detectDirection(70, 70.5), "maintain"); // within 1kg
  assert.equal(detectDirection(70, 64), "lose");
  assert.equal(detectDirection(60, 68), "gain");
  assert.equal(detectDirection(70, null), "maintain");
});

test("maxPaceMagnitude: loss = min(0.75, 1% bodyweight); gain = 0.5", () => {
  assert.equal(maxPaceMagnitude("lose", 70), 0.7); // 1% of 70
  assert.equal(maxPaceMagnitude("lose", 100), 0.75); // capped by the hard 0.75
  assert.equal(maxPaceMagnitude("gain", 70), 0.5);
  assert.equal(maxPaceMagnitude("maintain", 70), 0);
});

test("recommendedPaceMagnitude stays within the cap", () => {
  assert.equal(recommendedPaceMagnitude("lose", 70), 0.5); // min(0.5, 0.7)
  assert.equal(recommendedPaceMagnitude("lose", 40), 0.4); // min(0.5, 0.4) — 1% rule wins
  assert.equal(recommendedPaceMagnitude("gain", 70), 0.25);
});

test("loss plan (70 -> 64, recommended) matches the engine + 12-week timeline", () => {
  const plan = buildGoalPlan({ ...base, currentWeightKg: 70, goalWeightKg: 64, pace: "recommended" });
  assert.equal(plan.direction, "lose");
  assert.equal(plan.goal, "lose_fat");
  assert.equal(plan.weeklyPaceKg, -0.5);
  assert.equal(plan.paceCapped, false);
  assert.equal(plan.calorieTarget, 2100); // TDEE 2604 - 500
  assert.equal(plan.proteinTargetG, 110); // 70 * 1.6 = 112 -> 110
  assert.equal(plan.weeksToGoal, 12); // 6kg / 0.5
  assert.equal(plan.totalChangeKg, 6);
});

test("loss plan caps a too-fast request and explains it (paceCapped)", () => {
  // Requesting 1.0 kg/wk for a 70kg person -> capped to 0.7 (1% rule).
  const plan = buildGoalPlan({ ...base, currentWeightKg: 70, goalWeightKg: 60, pace: 1.0 });
  assert.equal(plan.weeklyPaceKg, -0.7);
  assert.equal(plan.paceCapped, true);
  assert.equal(plan.calorieTarget, 1900); // 2604 - 700
  assert.equal(plan.weeksToGoal, 15); // ceil(10 / 0.7)
});

test("gain plan is slow and caps aggressive requests", () => {
  const plan = buildGoalPlan({ ...base, currentWeightKg: 60, goalWeightKg: 68, pace: 1.0 });
  assert.equal(plan.direction, "gain");
  assert.equal(plan.goal, "gain_muscle");
  assert.equal(plan.weeklyPaceKg, 0.5); // capped from 1.0
  assert.equal(plan.paceCapped, true);
  assert.equal(plan.weeksToGoal, 16); // ceil(8 / 0.5)
});

test("maintain plan has no deficit, no timeline", () => {
  const plan = buildGoalPlan({ ...base, currentWeightKg: 70, goalWeightKg: null, pace: "recommended" });
  assert.equal(plan.direction, "maintain");
  assert.equal(plan.weeklyPaceKg, 0);
  assert.equal(plan.weeksToGoal, null);
  assert.equal(plan.paceCapped, false);
  assert.equal(plan.calorieTarget, 2600); // pure TDEE for the reference person
});

test("splitMacros roughly sums back to the calorie target", () => {
  const { proteinG, carbG, fatG } = splitMacros(2100, 70);
  assert.equal(proteinG, 110);
  const kcal = proteinG * 4 + carbG * 4 + fatG * 9;
  assert.ok(Math.abs(kcal - 2100) <= 10, `macros sum ${kcal} should be ~2100`);
});

test("paceFromTimeline derives the required weekly pace (capped later by buildGoalPlan)", () => {
  assert.equal(paceFromTimeline("no_deadline", 70, 64), "recommended");
  assert.equal(paceFromTimeline("4_weeks", 70, null), "recommended"); // no goal
  assert.equal(paceFromTimeline("8_weeks", 70, 70), "recommended"); // already there
  assert.equal(paceFromTimeline("12_weeks", 70, 64), 0.5); // 6kg / 12 weeks
  assert.equal(paceFromTimeline("4_weeks", 70, 64), 1.5); // 6kg / 4 weeks (raw; gets capped)
});

test("an over-ambitious timeline is eased to a safe pace (paceCapped)", () => {
  const plan = buildGoalPlan({
    ...base,
    currentWeightKg: 70,
    goalWeightKg: 64,
    pace: paceFromTimeline("4_weeks", 70, 64), // 1.5 kg/wk required
  });
  assert.equal(plan.direction, "lose");
  assert.equal(plan.paceCapped, true);
  assert.equal(plan.weeklyPaceKg, -0.7); // capped to the 1% rule for 70kg
});

test("targetDateFrom adds weeks*7 days (UTC), null when maintaining", () => {
  assert.equal(targetDateFrom("2026-06-06", 12), "2026-08-29"); // +84 days
  assert.equal(targetDateFrom("2026-06-06", null), null);
  assert.equal(targetDateFrom("2026-06-06", 0), null);
});
