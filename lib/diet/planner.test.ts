import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, swapMeal, filterFromPreference, mergeFilters, type DietFilter } from "./planner.ts";
import { CATALOG_BY_ID } from "./foodCatalog.ts";

const openFilter: DietFilter = { vegetarian: false, excludeTags: [], excludeFoods: [], regionFocus: null };

test("buildPlan returns the four meal slots in order", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  assert.deepEqual(plan.meals.map((m) => m.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.ok(plan.meals.every((m) => m.items.length > 0));
});

test("fits the calorie budget — never exceeds it, and lands within tolerance", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  // HARD constraint: total must never blow past the target.
  assert.ok(plan.totalCalories <= 2100, `over budget: ${plan.totalCalories}`);
  // ...and should land close (within ~10% under).
  assert.ok(plan.totalCalories >= 2100 * 0.9, `too low: ${plan.totalCalories}`);
  // every meal stays within its own slot budget.
  for (const m of plan.meals) {
    assert.ok(m.calories <= m.budget, `${m.slot} ${m.calories} > budget ${m.budget}`);
  }
});

test("caloriesShort is false for a normal plan, true when over-restricted", () => {
  const ok = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  assert.equal(ok.caloriesShort, false);

  // Exclude almost every food category → the day can't be filled → flagged.
  const starved = buildPlan({
    calorieTarget: 2100,
    proteinTargetG: 130,
    filter: {
      vegetarian: true,
      excludeTags: ["egg", "chicken", "beef", "fish", "lentil", "dairy", "nuts", "bread", "rice", "veg", "oats", "pasta", "fruit", "supplement"],
      excludeFoods: [],
      regionFocus: null,
    },
    seed: 1,
  });
  assert.equal(starved.caloriesShort, true);
  assert.ok(starved.totalCalories < 2100, "should be well under target");
});

test("hits the protein target within calories (or flags it honestly)", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  // the flag must reflect reality
  assert.equal(plan.proteinShort, plan.totalProtein < 130);
  // and it gets reasonably close regardless
  assert.ok(plan.totalProtein >= 110, `protein too low: ${plan.totalProtein}`);
  // raising protein must NOT have pushed calories over budget
  assert.ok(plan.totalCalories <= 2100, `protein pass blew the budget: ${plan.totalCalories}`);
});

test("seeds meals from the user's usual foods (and keeps them)", () => {
  const plan = buildPlan({
    calorieTarget: 2100,
    proteinTargetG: 120,
    filter: openFilter,
    seed: 1,
    usual: { breakfast: "paratha and eggs", lunch: "rice and daal" },
  });
  const ids = (slot: string) =>
    plan.meals.find((m) => m.slot === slot)!.items.map((i) => i.id);
  const bfast = ids("breakfast");
  assert.ok(
    bfast.includes("paratha") || bfast.some((id) => CATALOG_BY_ID[id].tags.includes("egg")),
    `breakfast didn't seed usual: ${bfast.join(",")}`
  );
  const lunch = ids("lunch");
  assert.ok(lunch.includes("rice") || lunch.includes("daal"), `lunch didn't seed usual: ${lunch.join(",")}`);
  assert.ok(plan.totalCalories <= 2100);
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

test("excludeFoods drops a specific item by name (e.g. whey protein shake)", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 130,
    filter: { vegetarian: false, excludeTags: [], excludeFoods: ["whey protein shake"], regionFocus: null },
    seed: 4,
  });
  const ids = plan.meals.flatMap((m) => m.items.map((i) => i.id));
  assert.ok(!ids.includes("whey"), "whey should be excluded");
});

test("a loose avoid phrase still matches the food name (tolerant)", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 130,
    filter: { vegetarian: false, excludeTags: [], excludeFoods: ["the whey protein shake thing"], regionFocus: null },
    seed: 8,
  });
  assert.ok(!plan.meals.flatMap((m) => m.items.map((i) => i.id)).includes("whey"));
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

test("mergeFilters unions excludes, ORs vegetarian, last regionFocus wins", () => {
  const merged = mergeFilters(
    { vegetarian: false, excludeTags: ["beef"] },
    { excludeTags: ["beef", "fish"], regionFocus: "desi" },
    { vegetarian: true }
  );
  assert.equal(merged.vegetarian, true);
  assert.deepEqual([...merged.excludeTags].sort(), ["beef", "fish"]);
  assert.equal(merged.regionFocus, "desi");
});

test("filterFromPreference maps veg_limited to vegetarian and merges extras", () => {
  assert.equal(filterFromPreference("veg_limited").vegetarian, true);
  assert.equal(filterFromPreference("normal_desi").vegetarian, false);
  const merged = filterFromPreference("normal_desi", { excludeTags: ["beef", "beef"], regionFocus: "desi" });
  assert.deepEqual(merged.excludeTags, ["beef"]); // deduped
  assert.equal(merged.regionFocus, "desi");
});
