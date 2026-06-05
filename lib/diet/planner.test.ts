import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, swapMeal, filterFromPreference, type DietFilter } from "./planner.ts";
import { CATALOG_BY_ID } from "./foodCatalog.ts";

const openFilter: DietFilter = { vegetarian: false, excludeTags: [], regionFocus: null };

test("buildPlan returns the four meal slots in order", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  assert.deepEqual(plan.meals.map((m) => m.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.ok(plan.meals.every((m) => m.items.length > 0));
});

test("daily totals land near the calorie target and hit most of the protein", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  assert.ok(plan.totalCalories >= 2100 * 0.8, `calories ${plan.totalCalories} too low`);
  assert.ok(plan.totalCalories <= 2100 * 1.2, `calories ${plan.totalCalories} too high`);
  assert.ok(plan.totalProtein >= 70, `protein ${plan.totalProtein} too low`);
});

test("the plan is deterministic for a given seed", () => {
  const a = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 7 });
  const b = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 7 });
  assert.deepEqual(a, b);
});

test("vegetarian filter never selects a non-veg food", () => {
  const plan = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 100,
    filter: { vegetarian: true, excludeTags: [], regionFocus: "desi" },
    seed: 3,
  });
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      assert.equal(CATALOG_BY_ID[item.id].vegetarian, true, `${item.name} is not vegetarian`);
    }
  }
});

test("excludeTags removes those foods (e.g. no beef)", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 120,
    filter: { vegetarian: false, excludeTags: ["beef"], regionFocus: null },
    seed: 5,
  });
  const ids = plan.meals.flatMap((m) => m.items.map((i) => i.id));
  assert.ok(ids.every((id) => !CATALOG_BY_ID[id].tags.includes("beef")));
});

test("swapMeal changes only the targeted meal", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  const swapped = swapMeal(plan, "lunch", 99);
  // other meals untouched
  for (const slot of ["breakfast", "dinner", "snack"] as const) {
    assert.deepEqual(
      swapped.meals.find((m) => m.slot === slot),
      plan.meals.find((m) => m.slot === slot)
    );
  }
  // totals stay consistent with the meals
  assert.equal(
    swapped.totalCalories,
    swapped.meals.reduce((s, m) => s + m.calories, 0)
  );
});

test("filterFromPreference maps veg_limited to vegetarian and merges extras", () => {
  assert.equal(filterFromPreference("veg_limited").vegetarian, true);
  assert.equal(filterFromPreference("normal_desi").vegetarian, false);
  const merged = filterFromPreference("normal_desi", { excludeTags: ["beef", "beef"], regionFocus: "desi" });
  assert.deepEqual(merged.excludeTags, ["beef"]); // deduped
  assert.equal(merged.regionFocus, "desi");
});
