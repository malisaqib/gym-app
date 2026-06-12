import { test } from "node:test";
import assert from "node:assert/strict";
import { planItemToLogRow } from "./planToLog.ts";
import type { PlanMealItem } from "./planner.ts";

// A catalog plan item as the planner emits it (gram-anchored portion).
const daal: PlanMealItem = {
  id: "daal",
  name: "Daal (lentils)",
  portion: "1 katori (~200g)",
  calories: 150,
  protein: 9,
  carbs: 20,
  fat: 4,
  unitMode: "portion",
  baseCalories: 150 / 200,
  baseProtein: 9 / 200,
  baseCarbs: 20 / 200,
  baseFat: 4 / 200,
  amount: 200,
  servingGrams: 200,
  unit: "g",
};

test("plan→log: a catalog item logs as a verified, gram-scalable row", () => {
  const row = planItemToLogRow(daal);
  assert.equal(row.food_name, "Daal (lentils)");
  assert.equal(row.unit_mode, "portion");
  assert.equal(row.amount, 200);
  assert.equal(row.serving_grams, 200);
  // Totals reproduce the plan numbers exactly (base × amount).
  assert.equal(row.calories, 150);
  assert.equal(row.protein_g, 9);
  // Provenance: catalog = verified, traceable id, full confidence.
  assert.equal(row.matched_food_id, "catalog:daal");
  assert.equal(row.nutrition_source, "verified");
  assert.equal(row.match_confidence, 1);
  assert.equal(row.source, "manual");
  // Later quantity edits scale from the same base: 100g = half.
  assert.equal(Math.round(row.base_calories * 100), 75);
});

test("plan→log: db (USDA/FNDDS) items log as imported; approx items as estimated", () => {
  const usda: PlanMealItem = { ...daal, id: "db:abc-123", name: "Biryani with chicken" };
  const u = planItemToLogRow(usda);
  assert.equal(u.matched_food_id, "db:abc-123");
  assert.equal(u.nutrition_source, "imported");

  const custom: PlanMealItem = {
    id: "custom-1",
    name: "Homemade shake",
    portion: "1 glass",
    calories: 250,
    protein: 10,
    carbs: 30,
    fat: 9,
    approx: true,
  };
  const c = planItemToLogRow(custom);
  assert.equal(c.matched_food_id, null);
  assert.equal(c.match_confidence, null);
  assert.equal(c.nutrition_source, "estimated");
  // No stored spec → one countable unit carrying the item's macros exactly.
  assert.equal(c.unit_mode, "count");
  assert.equal(c.amount, 1);
  assert.equal(c.calories, 250);
});

test("plan→log: countable items keep their unit and count", () => {
  const roti: PlanMealItem = {
    id: "roti2",
    name: "2 roti",
    portion: "2 medium",
    calories: 220,
    protein: 6,
    carbs: 44,
    fat: 4,
    unitMode: "count",
    baseCalories: 110,
    baseProtein: 3,
    baseCarbs: 22,
    baseFat: 2,
    amount: 2,
    servingGrams: null,
    unit: "medium",
  };
  const row = planItemToLogRow(roti);
  assert.equal(row.unit_mode, "count");
  assert.equal(row.quantity, 2);
  assert.equal(row.unit, "medium");
  assert.equal(row.calories, 220);
});
