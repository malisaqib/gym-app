import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBmr,
  activityFactorForTrainingDays,
  calculateTdee,
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
  trainingDays: 4,
  goal: "maintain",
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

test("activity factor maps training days to the right bracket", () => {
  assert.equal(activityFactorForTrainingDays(0), 1.2);
  assert.equal(activityFactorForTrainingDays(2), 1.375);
  assert.equal(activityFactorForTrainingDays(4), 1.55);
  assert.equal(activityFactorForTrainingDays(6), 1.725);
  assert.equal(activityFactorForTrainingDays(7), 1.9);
});

test("TDEE = BMR * activity factor", () => {
  // 1805 * 1.55 = 2797.75
  assert.ok(Math.abs(calculateTdee(male) - 2797.75) < 1e-6);
});

test("maintain target rounds TDEE to the nearest 10", () => {
  const r = calculateTargets(male);
  assert.equal(r.calorieTarget, 2800); // 2797.75 -> 2800
  assert.equal(r.safetyFloorApplied, false);
});

test("fat-loss applies a ~20% deficit when it's safe", () => {
  const r = calculateTargets({ ...male, goal: "lose_fat" });
  // 0.8 * 2797.75 = 2238.2 -> 2240, well above the floor.
  assert.equal(r.calorieTarget, 2240);
  assert.equal(r.safetyFloorApplied, false);
});

test("muscle-gain applies a ~10% surplus", () => {
  const r = calculateTargets({ ...male, goal: "gain_muscle" });
  // 1.1 * 2797.75 = 3077.5 -> 3080
  assert.equal(r.calorieTarget, 3080);
});

test("safety floor prevents an unsafe deficit (small, sedentary female)", () => {
  const r = calculateTargets({
    sex: "female",
    age: 25,
    heightCm: 155,
    weightKg: 50,
    trainingDays: 0,
    goal: "lose_fat",
  });
  // BMR ~1182.75, TDEE ~1419.3, raw deficit ~1135 — below the 1200 floor,
  // so the engine raises it and flags that it did.
  assert.equal(r.calorieTarget, 1200);
  assert.equal(r.safetyFloorApplied, true);
});

test("protein target scales with bodyweight and goal", () => {
  // lose_fat: 80kg * 2.0 = 160g
  assert.equal(calculateProteinTarget({ ...male, goal: "lose_fat" }), 160);
  // maintain: 80kg * 1.6 = 128 -> nearest 5 = 130
  assert.equal(calculateProteinTarget({ ...male, goal: "maintain" }), 130);
  // gain_muscle: 80kg * 1.8 = 144 -> nearest 5 = 145
  assert.equal(calculateProteinTarget({ ...male, goal: "gain_muscle" }), 145);
});
