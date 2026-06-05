import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBmr,
  activityFactor,
  calculateTdee,
  capWeeklyPace,
  calculateProteinTarget,
  calculateTargets,
  type TargetInput,
} from "./engine.ts";

// A reusable healthy male example.
const male: TargetInput = {
  sex: "male",
  age: 25,
  heightCm: 180,
  weightKg: 80,
  goal: "maintain",
  activityLevel: "moderate",
};

test("BMR matches the Mifflin–St Jeor formula (male)", () => {
  // 10*80 + 6.25*180 - 5*25 + 5 = 1805
  assert.equal(calculateBmr(male), 1805);
});

test("BMR uses the female offset (-161)", () => {
  // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
  const female: TargetInput = { ...male, sex: "female", weightKg: 60, heightCm: 165, age: 30 };
  assert.ok(Math.abs(calculateBmr(female) - 1320.25) < 1e-6);
});

test("activity factor maps each honest level to the standard multiplier", () => {
  assert.equal(activityFactor("sedentary"), 1.2);
  assert.equal(activityFactor("light"), 1.375);
  assert.equal(activityFactor("moderate"), 1.55);
  assert.equal(activityFactor("very"), 1.725);
  assert.equal(activityFactor("extra"), 1.9);
});

// =============================================================================
// Reference case — must match a standard Mifflin–St Jeor calculator.
// Person: male, 25y, 176cm, 70kg, MODERATE activity.
//   BMR  = 10*70 + 6.25*176 - 5*25 + 5 = 1680
//   TDEE = 1680 * 1.55 = 2604  -> maintain ~2600
//   mild loss (0.25 kg/wk, -250) -> ~2350
//   loss      (0.5  kg/wk, -500) -> ~2100
// =============================================================================
const reference: TargetInput = {
  sex: "male",
  age: 25,
  heightCm: 176,
  weightKg: 70,
  goal: "maintain",
  activityLevel: "moderate",
};

test("reference: BMR ~1680 and TDEE ~2604", () => {
  assert.equal(calculateBmr(reference), 1680);
  assert.ok(Math.abs(calculateTdee(reference) - 2604) < 1e-6);
});

test("reference: maintenance ~2600", () => {
  const r = calculateTargets(reference);
  assert.equal(r.calorieTarget, 2600);
  assert.equal(r.weeklyPaceKg, 0);
  assert.equal(r.safetyFloorApplied, false);
});

test("reference: mild loss (0.25 kg/wk) ~2350", () => {
  const r = calculateTargets({ ...reference, goal: "lose_fat", weeklyPaceKg: -0.25 });
  // 2604 - 250 = 2354 -> 2350
  assert.equal(r.calorieTarget, 2350);
  assert.equal(r.paceCapped, false);
});

test("reference: loss (0.5 kg/wk) ~2100", () => {
  const r = calculateTargets({ ...reference, goal: "lose_fat", weeklyPaceKg: -0.5 });
  // 2604 - 500 = 2104 -> 2100
  assert.equal(r.calorieTarget, 2100);
  assert.equal(r.paceCapped, false);
});

// --- Pace defaults from goal (when no explicit pace is given) ----------------

test("default pace per goal: maintain=0, loss=-0.5, gain=+0.25", () => {
  assert.equal(calculateTargets(reference).weeklyPaceKg, 0); // 2600
  assert.equal(calculateTargets({ ...reference, goal: "lose_fat" }).calorieTarget, 2100); // -500
  assert.equal(calculateTargets({ ...reference, goal: "gain_muscle" }).calorieTarget, 2850); // +250 -> 2854
});

// --- Safety: pace caps ------------------------------------------------------

test("pace cap: a too-aggressive loss request is capped at 0.75 kg/wk", () => {
  const { pace, capped } = capWeeklyPace(-1.2);
  assert.equal(pace, -0.75);
  assert.equal(capped, true);
  // End to end: 2604 - 750 = 1854 -> 1850, flagged as capped.
  const r = calculateTargets({ ...reference, goal: "lose_fat", weeklyPaceKg: -1.2 });
  assert.equal(r.weeklyPaceKg, -0.75);
  assert.equal(r.paceCapped, true);
  assert.equal(r.calorieTarget, 1850);
});

test("pace cap: gain is kept slow (capped at 0.5 kg/wk)", () => {
  const { pace, capped } = capWeeklyPace(1.0);
  assert.equal(pace, 0.5);
  assert.equal(capped, true);
});

// --- Safety: hard calorie floor ---------------------------------------------

test("safety floor prevents an unsafe deficit (small, sedentary female)", () => {
  const r = calculateTargets({
    sex: "female",
    age: 25,
    heightCm: 155,
    weightKg: 50,
    goal: "lose_fat",
    activityLevel: "sedentary",
    weeklyPaceKg: -0.75,
  });
  // BMR 1182.75, TDEE ~1419.3, raw ~669 — far below the 1200 floor, so the
  // engine raises it to the floor and flags that it did.
  assert.equal(r.calorieTarget, 1200);
  assert.equal(r.safetyFloorApplied, true);
});

// --- No double-count + interim default --------------------------------------

test("interim: with no activityLevel, the engine assumes a conservative 'light'", () => {
  // TargetInput has no `trainingDays` field at all — training frequency CANNOT
  // influence TDEE. Without an explicit level we default to light (1.375).
  const r = calculateTargets({ ...reference, activityLevel: undefined });
  assert.equal(r.activityFactor, 1.375);
  assert.equal(r.tdee, 2310); // 1680 * 1.375
  assert.equal(r.calorieTarget, 2310);
});

// --- Protein ----------------------------------------------------------------

test("protein target scales with bodyweight and goal", () => {
  // lose_fat: 80kg * 2.0 = 160g
  assert.equal(calculateProteinTarget({ ...male, goal: "lose_fat" }), 160);
  // maintain: 80kg * 1.6 = 128 -> nearest 5 = 130
  assert.equal(calculateProteinTarget({ ...male, goal: "maintain" }), 130);
  // gain_muscle: 80kg * 1.8 = 144 -> nearest 5 = 145
  assert.equal(calculateProteinTarget({ ...male, goal: "gain_muscle" }), 145);
});
