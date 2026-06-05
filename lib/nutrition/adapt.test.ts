import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recomputePlan,
  detectPlateau,
  suggestAdjustment,
  type AdaptProfile,
  type WeightPoint,
} from "./adapt.ts";

const profile: AdaptProfile = {
  sex: "male",
  age: 25,
  heightCm: 176,
  goalWeightKg: 64,
  activityLevel: "moderate",
  weeklyPaceKg: -0.5,
};

test("recomputePlan rebuilds targets from the new weight (protein scales)", () => {
  const plan = recomputePlan(profile, 68)!;
  assert.equal(plan.direction, "lose");
  assert.equal(plan.proteinTargetG, 110); // 68 * 1.6 = 108.8 -> 110
  // weeks shrink as you get closer: 4kg / 0.5 = 8
  assert.equal(plan.weeksToGoal, 8);
});

test("recomputePlan returns null when the profile is too incomplete", () => {
  assert.equal(recomputePlan({ ...profile, age: null }, 68), null);
});

test("recomputePlan flips to maintain once at/near the goal", () => {
  const plan = recomputePlan(profile, 64)!; // reached goal
  assert.equal(plan.direction, "maintain");
  assert.equal(plan.weeklyPaceKg, 0);
});

test("detectPlateau: flat weight over 3 weeks while losing = plateau", () => {
  const history: WeightPoint[] = [
    { logged_on: "2026-06-01", weight_kg: 70.0 },
    { logged_on: "2026-06-08", weight_kg: 70.1 },
    { logged_on: "2026-06-15", weight_kg: 69.9 },
    { logged_on: "2026-06-22", weight_kg: 70.0 },
  ];
  const r = detectPlateau(history, "lose", "2026-06-22");
  assert.equal(r.status, "plateau");
  assert.equal(r.points, 4);
  assert.equal(r.spanDays, 21);
});

test("detectPlateau: steady loss = on_track", () => {
  const history: WeightPoint[] = [
    { logged_on: "2026-06-01", weight_kg: 72.0 },
    { logged_on: "2026-06-10", weight_kg: 71.0 },
    { logged_on: "2026-06-22", weight_kg: 70.4 },
  ];
  const r = detectPlateau(history, "lose", "2026-06-22");
  assert.equal(r.status, "on_track");
  assert.ok(r.weeklyRateKg < 0);
});

test("detectPlateau: too few/too recent points = insufficient", () => {
  assert.equal(
    detectPlateau([{ logged_on: "2026-06-20", weight_kg: 70 }], "lose", "2026-06-22").status,
    "insufficient"
  );
  // 3 points but only a few days apart
  const recent: WeightPoint[] = [
    { logged_on: "2026-06-20", weight_kg: 70 },
    { logged_on: "2026-06-21", weight_kg: 70 },
    { logged_on: "2026-06-22", weight_kg: 70 },
  ];
  assert.equal(detectPlateau(recent, "lose", "2026-06-22").status, "insufficient");
});

test("detectPlateau: maintain goal never reports a plateau", () => {
  const history: WeightPoint[] = [
    { logged_on: "2026-06-01", weight_kg: 70 },
    { logged_on: "2026-06-12", weight_kg: 70 },
    { logged_on: "2026-06-22", weight_kg: 70 },
  ];
  assert.equal(detectPlateau(history, "maintain", "2026-06-22").status, "insufficient");
});

test("suggestAdjustment: loss + room to reframe activity -> lower_activity", () => {
  const a = suggestAdjustment({ direction: "lose", activityLevel: "moderate", calorieTarget: 2100, sex: "male" });
  assert.equal(a.kind, "lower_activity");
});

test("suggestAdjustment: loss + already sedentary -> small calorie trim, floor-safe", () => {
  const a = suggestAdjustment({ direction: "lose", activityLevel: "sedentary", calorieTarget: 1550, sex: "male" });
  assert.equal(a.kind, "trim_calories");
  assert.equal(a.calorieDelta, -50); // 1550 - 100 = 1450 < 1500 floor -> only -50
});

test("suggestAdjustment: gain stall -> add a little food", () => {
  const a = suggestAdjustment({ direction: "gain", activityLevel: "light", calorieTarget: 2800, sex: "male" });
  assert.equal(a.kind, "add_calories");
  assert.equal(a.calorieDelta, 120);
});
