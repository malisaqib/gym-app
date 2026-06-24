import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  CALORIE_SHORT_THRESHOLD,
  PROTEIN_SHORT_THRESHOLD,
  swapMeal,
  filterFromPreference,
  mergeFilters,
  removePlanItem,
  insertPlanItem,
  addPlanItem,
  appendPlanItem,
  swapPlanItem,
  setPlanItemAmount,
  planItemSpec,
  searchCatalog,
  bestCatalogMatch,
  isKnownFood,
  replanRemaining,
  buildPlanFromSelection,
  buildPlanFromSelectionIds,
  normalizeDietPlan,
  validateDietPlan,
  type DietPlan,
  type DietFilter,
  type PlanMealItem,
  type SelectedNames,
} from "./planner.ts";
import { CATALOG_BY_ID, FOOD_CATALOG, type CatalogFood, type MealSlot } from "./foodCatalog.ts";
import { DIET_PLAN_FOOD_IDS, DIET_PLAN_POOL } from "./planPool.ts";
import { plannerPortionConstraint } from "./portionConstraints.ts";

const openFilter: DietFilter = { vegetarian: false, excludeTags: [], excludeFoods: [], regionFocus: null };

test("buildPlan returns the four meal slots in order", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  assert.deepEqual(plan.meals.map((m) => m.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.ok(plan.meals.every((m) => m.items.length > 0));
});

test("normalizeDietPlan backfills missing targets on old saved plans", () => {
  const plan = normalizeDietPlan(
    {
      meals: [
        {
          slot: "breakfast",
          title: "Breakfast",
          items: [{ id: "egg", name: "Egg", portion: "1 egg", calories: 80, protein: 6, carbs: 1, fat: 5 }],
        },
      ],
      filter: openFilter,
    },
    { calorieTarget: 2000, proteinTargetG: 120 }
  );

  assert.ok(plan);
  assert.equal(plan.calorieTarget, 2000);
  assert.equal(plan.proteinTargetG, 120);
  assert.equal(plan.totalCalories, 80);
  assert.equal(plan.totalProtein, 6);
  assert.equal(plan.meals[0].budget, 500);
  assert.equal(plan.caloriesShort, true);
  assert.equal(plan.proteinShort, true);
});

test("normalizeDietPlan prefers current profile targets over stale saved plan targets", () => {
  const plan = normalizeDietPlan(
    {
      meals: [
        {
          slot: "lunch",
          title: "Lunch",
          items: [{ id: "rice", name: "Rice", portion: "1 cup", calories: 200, protein: 4, carbs: 44, fat: 1 }],
        },
      ],
      calorieTarget: 1800,
      proteinTargetG: 100,
      filter: openFilter,
    },
    { calorieTarget: 2200, proteinTargetG: 140 }
  );

  assert.ok(plan);
  assert.equal(plan.calorieTarget, 2200);
  assert.equal(plan.proteinTargetG, 140);
  assert.equal(plan.meals[0].budget, 770);
});

test("fits the calorie budget — never exceeds it; within ±5% or honestly flagged", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  // HARD constraint: total must never blow past the target.
  assert.ok(plan.totalCalories <= 2100, `over budget: ${plan.totalCalories}`);
  // D1 contract: within the ±5% bar, or the shortfall is flagged — NEVER silent.
  assert.ok(
    plan.totalCalories >= 2100 * 0.95 || plan.caloriesShort,
    `SILENT under-target: ${plan.totalCalories}/2100, caloriesShort=${plan.caloriesShort}`
  );
  // ...and it still gets reasonably close even on the small test catalog.
  assert.ok(plan.totalCalories >= 2100 * 0.9, `too low: ${plan.totalCalories}`);
  // every meal stays within its slot budget + the 10% flex (day cap is hard).
  for (const m of plan.meals) {
    assert.ok(m.calories <= m.budget * 1.1, `${m.slot} ${m.calories} > flexed budget ${m.budget * 1.1}`);
  }
});

// D1 — the ±5% bar is enforced BOTH directions: a day that per-slot filling
// leaves short (one starved slot) must either top up to ≥95% using other meals'
// remaining headroom, or be flagged caloriesShort — silently landing at ~88% is
// a defect. This pool deliberately starves the snack slot (no snack foods) and
// gives the main meals one big anchor (80% of slot) plus small fillers, so only
// the day-level top-up can reach tolerance.
test("a short day either tops up to ≥95% of target or is honestly flagged (never silent)", () => {
  const mk = (id: string, slot: "breakfast" | "lunch" | "dinner", calories: number, protein: number): CatalogFood => ({
    id: `${slot}_${id}`,
    name: `${slot} ${id}`,
    portion: "1 serving (~100g)",
    calories,
    protein,
    carbs: 10,
    fat: 5,
    region: "desi",
    vegetarian: true,
    tags: [],
    role: protein >= 15 ? "protein" : "carb",
    slots: [slot],
  });
  const pool: CatalogFood[] = (["breakfast", "lunch", "dinner"] as const).flatMap((slot) => [
    mk("anchor", slot, 420, 30), // ~80% of a 2000-kcal day's bigger slots
    mk("small1", slot, 60, 4),
    mk("small2", slot, 55, 3),
    mk("small3", slot, 50, 3),
  ]);
  // NOTE: zero snack-slot foods → snack budget (10%) is unfillable.

  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 90, filter: openFilter, seed: 3, pool });
  assert.ok(plan.totalCalories <= 2000, `over budget: ${plan.totalCalories}`);
  const withinTolerance = plan.totalCalories >= 2000 * 0.95;
  assert.ok(
    withinTolerance || plan.caloriesShort,
    `SILENT under-target plan: ${plan.totalCalories}/2000 with caloriesShort=${plan.caloriesShort}`
  );
  // Meals may flex up to +10% over their slot budget (the scaler's coarse-step
  // escape hatch) — but the DAY total above is the hard contract.
  for (const m of plan.meals) {
    assert.ok(m.calories <= m.budget * 1.1, `${m.slot} ${m.calories} > flexed budget ${m.budget * 1.1}`);
  }
});

test("an unfixably short day is flagged caloriesShort below 95%", () => {
  // One 300-kcal food per main slot, nothing else: day max = 900 of 2000.
  const tiny = (slot: "breakfast" | "lunch" | "dinner"): CatalogFood => ({
    id: `only_${slot}`,
    name: `Only ${slot}`,
    portion: "1 serving (~100g)",
    calories: 300,
    protein: 20,
    carbs: 10,
    fat: 5,
    region: "desi",
    vegetarian: true,
    tags: [],
    role: "protein",
    slots: [slot],
  });
  const plan = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 90,
    filter: openFilter,
    seed: 1,
    pool: [tiny("breakfast"), tiny("lunch"), tiny("dinner")],
  });
  assert.ok(plan.totalCalories < 2000 * 0.95);
  assert.equal(plan.caloriesShort, true, "must flag the shortfall honestly");
});

test("caloriesShort always reflects reality (no false negatives), true when over-restricted", () => {
  // The flag must mirror the actual landing vs the 95% bar — a plan below
  // tolerance can never report caloriesShort=false.
  const ok = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  assert.equal(ok.caloriesShort, ok.totalCalories < 2100 * 0.95);

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

test("keeps the user's 'don't give up' foods in the plan, even under a high protein target", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 170, // high → triggers the protein-swap pass
    filter: openFilter,
    seed: 1,
    usual: { keep: "paratha" },
  });
  const ids = plan.meals.flatMap((m) => m.items.map((i) => i.id));
  // "paratha" legitimately matches both plain and aloo paratha — either kept is fine.
  assert.ok(
    ids.includes("paratha") || ids.includes("aloo_paratha"),
    `kept paratha was dropped: ${ids.join(",")}`
  );
  assert.ok(plan.totalCalories <= 2200, "still within the calorie cap");
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

test("vegetarian allows eggs & dairy but never meat or fish (per spec)", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 130,
    filter: { vegetarian: true, excludeTags: [], excludeFoods: [], regionFocus: null },
    seed: 11,
  });
  const meatFish = new Set(["chicken", "beef", "fish"]);
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      assert.ok(
        !CATALOG_BY_ID[item.id].tags.some((t) => meatFish.has(t)),
        `${item.name} is meat/fish under a vegetarian plan`
      );
    }
  }
});

test("vegetarian + avoid beef/chicken/fish/egg/dairy/nuts: none present, shortfalls flagged", () => {
  const banned = ["beef", "chicken", "fish", "egg", "dairy", "nuts"];
  const plan = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 120,
    filter: { vegetarian: true, excludeTags: banned, excludeFoods: [], regionFocus: null },
    seed: 2,
  });
  const bannedSet = new Set(banned);
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const f = CATALOG_BY_ID[item.id];
      assert.ok(!f.tags.some((t) => bannedSet.has(t)), `${f.name} violates the avoid set`);
      assert.equal(f.vegetarian, true, `${f.name} is not vegetarian`);
    }
  }
  // HARD cap still holds…
  assert.ok(plan.totalCalories <= 2000, `over budget: ${plan.totalCalories}`);
  // …and the plan must EITHER hit targets OR honestly flag it couldn't within
  // these constraints (with this tiny catalog, expect it to flag).
  assert.ok(plan.totalProtein >= 120 || plan.proteinShort, "protein shortfall must be flagged");
  assert.ok(plan.totalCalories >= 2000 * 0.85 || plan.caloriesShort, "calorie shortfall must be flagged");
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

test("automatic generation skips supplements and sweet drinks", () => {
  const pool: CatalogFood[] = [
    CATALOG_BY_ID.whey,
    CATALOG_BY_ID.coffee,
    CATALOG_BY_ID.cold_coffee,
    CATALOG_BY_ID.banana_shake,
    CATALOG_BY_ID.lassi,
    CATALOG_BY_ID.black_coffee,
    CATALOG_BY_ID.apple,
  ];
  const plan = buildPlan({
    calorieTarget: 800,
    proteinTargetG: 120,
    filter: openFilter,
    seed: 1,
    pool,
  });
  const ids = plan.meals.flatMap((m) => m.items.map((i) => i.id));
  for (const banned of ["whey", "coffee", "cold_coffee", "banana_shake", "lassi"]) {
    assert.ok(!ids.includes(banned), `${banned} should not be auto-selected`);
  }
  assert.ok(searchCatalog("coffee", openFilter, "snack").some((f) => f.id === "coffee"));
  assert.ok(addPlanItem(plan, "snack", "coffee").meals.some((m) => m.items.some((i) => i.id === "coffee")));
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

// --- per-item editing (Phase 3) --------------------------------------------

test("removePlanItem drops the item and recomputes totals", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 120, filter: openFilter, seed: 1 });
  const before = plan.meals.find((m) => m.slot === "lunch")!.items.length;
  const next = removePlanItem(plan, "lunch", 0);
  const lunch = next.meals.find((m) => m.slot === "lunch")!;
  assert.equal(lunch.items.length, before - 1);
  assert.equal(lunch.calories, lunch.items.reduce((s, i) => s + i.calories, 0));
  assert.equal(next.totalCalories, next.meals.reduce((s, m) => s + m.calories, 0));
});

test("addPlanItem adds a catalog food but never an avoided one", () => {
  const filter: DietFilter = { vegetarian: false, excludeTags: ["beef"], excludeFoods: [], regionFocus: null };
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 120, filter, seed: 1 });
  const next = addPlanItem(plan, "dinner", "salad");
  assert.ok(next.meals.find((m) => m.slot === "dinner")!.items.some((i) => i.id === "salad"));
  // an avoided food (beef) must be a no-op
  assert.deepEqual(addPlanItem(next, "dinner", "ground_beef"), next);
});

test("swapPlanItem returns a different in-budget catalog food; no-op for custom items", () => {
  const plan = buildPlan({ calorieTarget: 2200, proteinTargetG: 120, filter: openFilter, seed: 1 });
  const meal = plan.meals.find((m) => m.slot === "lunch")!;
  const idx = meal.items.findIndex((i) => isKnownFood(i.id));
  const next = swapPlanItem(plan, "lunch", idx, 42);
  const meal2 = next.meals.find((m) => m.slot === "lunch")!;
  assert.ok(meal2.calories <= meal2.budget, `swap exceeded budget: ${meal2.calories}/${meal2.budget}`);
  assert.equal(next.totalProtein, next.meals.reduce((s, m) => s + m.protein, 0));

  // a custom (non-catalog) item can't be swapped
  const withCustom = appendPlanItem(plan, "snack", {
    id: "custom-1", name: "Homemade shake", portion: "1 glass", calories: 200, protein: 20, carbs: 10, fat: 5, approx: true,
  });
  const cIdx = withCustom.meals.find((m) => m.slot === "snack")!.items.findIndex((i) => i.id === "custom-1");
  assert.deepEqual(swapPlanItem(withCustom, "snack", cIdx, 7), withCustom);
});

test("appendPlanItem can push the day OVER target (totals reflect it honestly)", () => {
  const plan = buildPlan({ calorieTarget: 1600, proteinTargetG: 100, filter: openFilter, seed: 1 });
  const next = appendPlanItem(plan, "snack", {
    id: "custom-x", name: "Big dessert", portion: "1 plate", calories: 900, protein: 8, carbs: 120, fat: 40, approx: true,
  });
  assert.ok(next.totalCalories > 1600, "totals should reflect going over target");
  assert.equal(next.caloriesShort, false);
});

test("plan items carry a quantity spec; setPlanItemAmount recomputes item + totals", () => {
  const plan = buildPlan({ calorieTarget: 2200, proteinTargetG: 120, filter: openFilter, seed: 1 });
  const meal = plan.meals.find((m) => m.items.length > 0)!;
  const item0 = meal.items[0];
  assert.ok(item0.unitMode === "count" || item0.unitMode === "portion", "item has a unit mode");
  assert.ok((item0.baseCalories ?? 0) > 0 && (item0.amount ?? 0) > 0, "item has base + amount");

  const a2 = (item0.amount ?? 1) * 2;
  const next = setPlanItemAmount(plan, meal.slot, 0, a2);
  const after = next.meals.find((m) => m.slot === meal.slot)!.items[0];
  assert.equal(after.amount, Math.round(a2));
  assert.equal(after.calories, Math.round((item0.baseCalories ?? 0) * Math.round(a2)));
  // day total stays consistent with the meals
  assert.equal(next.totalCalories, next.meals.reduce((s, m) => s + m.calories, 0));
});

test("planItemSpec derives legacy non-catalog quantities from portion text", () => {
  const grams = planItemSpec({
    id: "db:legacy-daal",
    name: "Daal, cooked",
    portion: "1 serving (~200g)",
    calories: 150,
    protein: 9,
    carbs: 22,
    fat: 3,
  });
  assert.equal(grams.unitMode, "portion");
  assert.equal(grams.amount, 200);
  assert.equal(grams.servingGrams, 200);

  const count = planItemSpec({
    id: "db:legacy-roti",
    name: "2 roti",
    portion: "2 medium",
    calories: 220,
    protein: 6,
    carbs: 44,
    fat: 4,
  });
  assert.equal(count.unitMode, "count");
  assert.equal(count.amount, 2);
  assert.equal(count.unit, "roti");
});

test("searchCatalog matches by name/tag and respects the filter", () => {
  assert.ok(searchCatalog("rice", openFilter, "lunch").some((f) => f.id === "rice" || f.id === "brown_rice"));
  const veg = searchCatalog("chicken", { vegetarian: true, excludeTags: [], excludeFoods: [], regionFocus: null }, "lunch");
  assert.equal(veg.length, 0, "no chicken under a vegetarian filter");
});

test("bestCatalogMatch maps free text to a catalog food, or null", () => {
  const m = bestCatalogMatch("some grilled chicken", openFilter, "dinner");
  assert.ok(m && m.tags.includes("chicken"));
  assert.equal(bestCatalogMatch("zzz unknown alien food", openFilter, "dinner"), null);
});

test("aliases (incl. Roman Urdu) match free text and search (Phase 4)", () => {
  assert.equal(bestCatalogMatch("nehari please", openFilter, "dinner")?.id, "nihari");
  assert.ok(searchCatalog("aam", openFilter, "snack").some((f) => f.id === "mango"));
  assert.ok(searchCatalog("panir", openFilter, "lunch").some((f) => f.id === "paneer"));
});

test("common planner aliases resolve to the intended curated foods", () => {
  assert.equal(bestCatalogMatch("anda", openFilter, "breakfast")?.id, "eggs2");
  assert.ok(
    searchCatalog("boiled eggs", openFilter, "breakfast").some(
      (food) => food.id === "boiled_egg1"
    )
  );
  assert.equal(bestCatalogMatch("chapati", openFilter, "lunch")?.id, "roti2");
  assert.equal(bestCatalogMatch("phulka", openFilter, "lunch")?.id, "roti2");
  assert.equal(bestCatalogMatch("chawal", openFilter, "lunch")?.id, "rice");
  assert.equal(bestCatalogMatch("curd", openFilter, "lunch")?.id, "dahi");
  assert.equal(bestCatalogMatch("dhal", openFilter, "dinner")?.id, "daal");
  assert.equal(bestCatalogMatch("chole", openFilter, "lunch")?.id, "chana");
  assert.equal(bestCatalogMatch("cottage cheese", openFilter, "lunch")?.id, "cottage_cheese");
});

test("reviewed Phase 4C foods have usable roles, slots, and realistic caps", () => {
  const expected = [
    "chicken_thigh",
    "turkey_breast",
    "turkey_mince",
    "lean_beef_steak",
    "cottage_cheese",
    "pita",
    "boiled_potato",
    "mashed_potato",
    "boiled_chickpeas",
    "hummus",
    "raita",
  ];
  for (const id of expected) {
    const food = CATALOG_BY_ID[id];
    assert.ok(food, `${id} missing`);
    assert.ok(food.slots.length > 0, `${id} has no meal slots`);
    const spec = planItemSpec({
      id: food.id,
      name: food.name,
      portion: food.portion,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
    });
    const constraint = plannerPortionConstraint(food, {
      unitMode: spec.unitMode,
      amount: spec.amount,
      unit: spec.unit,
    });
    assert.ok(constraint.maxAmount >= spec.amount, `${id} starts above its planner cap`);
  }
});

test("planner contract: unsafe imported DB foods never enter add/search/swap/hybrid paths", () => {
  const unsafe: CatalogFood = {
    id: "db:straw-mushrooms",
    name: "Mushrooms, straw, canned",
    region: "global",
    portion: "~120g",
    calories: 38,
    protein: 5,
    carbs: 6,
    fat: 1,
    vegetarian: true,
    role: "veg",
    slots: ["lunch", "dinner"],
    tags: ["veg"],
  };
  const pool = [unsafe, ...FOOD_CATALOG];
  const base = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 1 });

  assert.deepEqual(searchCatalog("straw", openFilter, "lunch", pool), []);
  assert.equal(bestCatalogMatch("straw mushrooms", openFilter, "lunch", pool), null);
  assert.deepEqual(addPlanItem(base, "lunch", unsafe.id, pool), base);

  const swapBase: DietPlan = {
    ...base,
    meals: base.meals.map((m) =>
      m.slot === "lunch"
        ? {
            ...m,
            budget: 500,
            items: [
              {
                id: "salad",
                name: "Green salad",
                portion: "1 bowl",
                calories: 30,
                protein: 2,
                carbs: 6,
                fat: 0,
              },
            ],
            calories: 30,
            protein: 2,
          }
        : m
    ),
  };
  const swapped = swapPlanItem(swapBase, "lunch", 0, 1, [CATALOG_BY_ID.salad, unsafe]);
  assert.ok(!swapped.meals.flatMap((m) => m.items).some((i) => i.id === unsafe.id));

  const hybrid = buildPlanFromSelection(
    { lunch: ["straw mushrooms"] },
    { calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 2, pool }
  );
  assert.ok(!hybrid.meals.flatMap((m) => m.items).some((i) => i.id === unsafe.id));
});

test("central Diet Plan pool isolates every plan flow from broad USDA foods", () => {
  const usdaOnly: CatalogFood = {
    id: "db:usda-only-sentinel",
    name: "Mushrooms, straw, canned",
    region: "global",
    portion: "~120g",
    calories: 34,
    protein: 3,
    carbs: 5,
    fat: 1,
    vegetarian: true,
    role: "veg",
    slots: ["lunch", "dinner"],
    tags: ["veg"],
  };

  assert.ok(DIET_PLAN_POOL.every((food) => !food.id.startsWith("db:")));
  assert.ok(!DIET_PLAN_FOOD_IDS.has(usdaOnly.id));

  const generated = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 120,
    filter: openFilter,
    seed: 1,
    pool: DIET_PLAN_POOL,
  });
  assert.ok(generated.meals.flatMap((meal) => meal.items).every((item) => DIET_PLAN_FOOD_IDS.has(item.id)));

  assert.deepEqual(searchCatalog("straw mushrooms", openFilter, "lunch", DIET_PLAN_POOL), []);
  assert.equal(bestCatalogMatch("straw mushrooms", openFilter, "lunch", DIET_PLAN_POOL), null);
  assert.equal(addPlanItem(generated, "lunch", usdaOnly.id, DIET_PLAN_POOL), generated);

  const swapped = swapPlanItem(generated, "lunch", 0, 17, DIET_PLAN_POOL);
  assert.ok(swapped.meals.flatMap((meal) => meal.items).every((item) => DIET_PLAN_FOOD_IDS.has(item.id)));

  const refit = replanRemaining(
    generated,
    { calories: 900, proteinG: 55 },
    ["breakfast"],
    DIET_PLAN_POOL,
    3
  );
  assert.ok(refit.meals.flatMap((meal) => meal.items).every((item) => DIET_PLAN_FOOD_IDS.has(item.id)));
});

test("candidate-id selection seeds the exact catalog food without fuzzy substitution", () => {
  const plan = buildPlanFromSelectionIds(
    { lunch: ["chicken_breast", "brown_rice"] },
    {
      calorieTarget: 2100,
      proteinTargetG: 120,
      filter: { ...openFilter, regionFocus: "western" },
      seed: 4,
      pool: DIET_PLAN_POOL,
    }
  );
  const lunchIds = plan.meals.find((meal) => meal.slot === "lunch")?.items.map((item) => item.id);
  assert.ok(lunchIds?.includes("chicken_breast"));
  assert.ok(lunchIds?.includes("brown_rice"));
});

test("typed Diet Plan matching fails closed for an unmatched estimate request", () => {
  assert.equal(
    bestCatalogMatch("purple dragonfruit quinoa bowl", openFilter, "lunch", DIET_PLAN_POOL),
    null
  );
});

test("final validator checks targets, safe foods, and realistic portions", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 120, filter: openFilter, seed: 1 });
  assert.equal(plan.validation?.foodsOk, true);
  assert.equal(plan.validation?.portionsOk, true);
  assert.equal(
    plan.validation?.targetOk,
    plan.totalCalories >= 2100 * CALORIE_SHORT_THRESHOLD &&
      plan.totalProtein >= 120 * PROTEIN_SHORT_THRESHOLD
  );

  const overTarget = appendPlanItem(plan, "snack", {
    id: "custom-over",
    name: "Large custom dessert",
    portion: "1 plate",
    calories: 1200,
    protein: 5,
    carbs: 160,
    fat: 45,
    approx: true,
  });
  assert.ok(overTarget.validation?.issues.some((i) => i.code === "calories_over_target"));

  const withEggs = addPlanItem(plan, "breakfast", "eggs2");
  const eggIndex = withEggs.meals.find((m) => m.slot === "breakfast")!.items.findIndex((i) => i.id === "eggs2");
  const oversized = setPlanItemAmount(withEggs, "breakfast", eggIndex, 10);
  assert.equal(oversized.validation?.portionsOk, false);
  assert.ok(oversized.validation?.issues.some((i) => i.code === "portion_too_large" && i.foodId === "eggs2"));

  const withYogurt = addPlanItem(plan, "breakfast", "greek_yogurt");
  const yogurtIndex = withYogurt.meals
    .find((m) => m.slot === "breakfast")!
    .items.findIndex((i) => i.id === "greek_yogurt");
  const tooSmall = setPlanItemAmount(withYogurt, "breakfast", yogurtIndex, 50);
  assert.ok(tooSmall.validation?.issues.some((i) => i.code === "portion_too_small"));
  const offStep = setPlanItemAmount(withYogurt, "breakfast", yogurtIndex, 101);
  assert.ok(offStep.validation?.issues.some((i) => i.code === "portion_step_invalid"));

  const quantityMismatch = appendPlanItem(plan, "snack", {
    id: "boiled_egg1",
    name: "1 boiled egg",
    portion: "1 egg",
    calories: 999,
    protein: 12,
    carbs: 2,
    fat: 10,
    unitMode: "count",
    baseCalories: 80,
    baseProtein: 6,
    baseCarbs: 1,
    baseFat: 5,
    amount: 2,
    servingGrams: null,
    unit: "egg",
  });
  assert.ok(quantityMismatch.validation?.issues.some((i) => i.code === "quantity_mismatch"));

  const unsafeItem: PlanMealItem = {
    id: "db:straw-mushrooms",
    name: "Mushrooms, straw, canned",
    portion: "~120g",
    calories: 38,
    protein: 5,
    carbs: 6,
    fat: 1,
  };
  const unsafe = appendPlanItem(plan, "lunch", unsafeItem);
  assert.equal(unsafe.validation?.foodsOk, false);
  assert.ok(unsafe.validation?.issues.some((i) => i.code === "unsafe_food" && i.foodId === unsafeItem.id));

  const silentShort = validateDietPlan({ ...plan, totalCalories: Math.round(plan.calorieTarget * 0.8), totalProtein: 10 });
  assert.equal(silentShort.targetOk, false);
  assert.ok(silentShort.issues.some((i) => i.code === "calories_short"));
  assert.ok(silentShort.issues.some((i) => i.code === "protein_short"));
});

// SIMPLE-plan contract (diet rebuild): a few staple foods done right and
// REPEATED — not a 15-dish rotating menu. Staple repetition across meals is
// deliberate; the plan must stay minimal and recognizable.
test("simple plan: a small repeatable set of foods (≤9 distinct), staples may repeat", () => {
  for (const seed of [1, 2, 3, 5, 9]) {
    const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed });
    const names = plan.meals.flatMap((m) => m.items.map((i) => i.name));
    const distinct = new Set(names);
    assert.ok(distinct.size <= 9, `seed ${seed}: ${distinct.size} distinct dishes — too fancy: ${[...distinct].join(", ")}`);
    assert.ok(plan.totalCalories <= 2100, `seed ${seed} over budget`);
  }
});

test("simple plan: hits protein and lands within ±5% calories (or honest flags)", () => {
  for (const seed of [1, 4, 7]) {
    const plan = buildPlan({ calorieTarget: 2200, proteinTargetG: 150, filter: openFilter, seed });
    assert.ok(plan.totalCalories <= 2200, `over budget: ${plan.totalCalories}`);
    assert.ok(
      plan.totalCalories >= 2200 * 0.95 || plan.caloriesShort,
      `silent calorie shortfall: ${plan.totalCalories}`
    );
    assert.ok(
      plan.totalProtein >= 150 * 0.93 || plan.proteinShort,
      `silent protein shortfall: ${plan.totalProtein}`
    );
  }
});

test("simple plan: protein comes primarily from staple sources", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 140, filter: openFilter, seed: 2 });
  const stapleIds = new Set(FOOD_CATALOG.filter((f) => f.staple === "protein").map((f) => f.id));
  const total = plan.meals.flatMap((m) => m.items).reduce((s, i) => s + i.protein, 0);
  const fromStaples = plan.meals
    .flatMap((m) => m.items)
    .filter((i) => stapleIds.has(i.id))
    .reduce((s, i) => s + i.protein, 0);
  assert.ok(total > 0);
  assert.ok(
    fromStaples / total >= 0.6,
    `only ${Math.round((fromStaples / total) * 100)}% of protein from staples`
  );
});

test("feasible plan lands within 5% of both calorie and protein targets", () => {
  const plan = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 140,
    filter: openFilter,
    seed: 1,
    pool: DIET_PLAN_POOL,
  });

  assert.ok(plan.totalCalories >= 2200 * 0.95 && plan.totalCalories <= 2200);
  assert.ok(plan.totalProtein >= 140 * 0.95 && plan.totalProtein <= 140 * 1.05);
  assert.equal(plan.caloriesShort, false);
  assert.equal(plan.proteinShort, false);
});

test("infeasible constrained target returns honest short flags and validation reasons", () => {
  const tinyPool: CatalogFood[] = [
    {
      ...CATALOG_BY_ID.apple,
      slots: ["breakfast", "lunch", "dinner", "snack"],
    },
  ];
  const plan = buildPlan({
    calorieTarget: 3000,
    proteinTargetG: 180,
    filter: openFilter,
    seed: 1,
    pool: tinyPool,
  });

  assert.equal(plan.caloriesShort, true);
  assert.equal(plan.proteinShort, true);
  assert.ok(plan.validation?.issues.some((issue) => issue.code === "calories_short"));
  assert.ok(plan.validation?.issues.some((issue) => issue.code === "protein_short"));
});

test("snacks are fruit-led, and meals are anchored (protein + carb in mains)", () => {
  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 130, filter: openFilter, seed: 3 });
  const snack = plan.meals.find((m) => m.slot === "snack")!;
  const fruitIds = new Set(FOOD_CATALOG.filter((f) => f.staple === "fruit").map((f) => f.id));
  assert.ok(snack.items.some((i) => fruitIds.has(i.id)), `snack has no fruit: ${snack.items.map((i) => i.name).join(", ")}`);
  for (const m of plan.meals) {
    if (m.slot === "snack") continue;
    const foods = m.items.map((i) => CATALOG_BY_ID[i.id]).filter(Boolean);
    assert.ok(foods.some((f) => f!.role === "protein"), `${m.slot} has no protein anchor`);
  }
});

test("whey never auto-planned by default; included (and swappable) when the usual diet mentions it", () => {
  const without = buildPlan({ calorieTarget: 2200, proteinTargetG: 160, filter: openFilter, seed: 1 });
  assert.ok(
    !without.meals.some((m) => m.items.some((i) => i.id === "whey")),
    "whey appeared without opt-in"
  );

  const genericShake = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 160,
    filter: openFilter,
    usual: { keep: "banana shake" },
    seed: 1,
  });
  assert.ok(
    !genericShake.meals.some((meal) => meal.items.some((item) => item.id === "whey")),
    "generic shake text incorrectly enabled whey"
  );

  const explicitlyDisabled = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 160,
    filter: openFilter,
    usual: { keep: "whey protein shake" },
    allowProteinPowder: false,
    seed: 1,
  });
  assert.ok(
    !explicitlyDisabled.meals.some((meal) => meal.items.some((item) => item.id === "whey")),
    "explicitly disabled protein powder was included"
  );

  const withWhey = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 160,
    filter: openFilter,
    usual: { keep: "whey protein shake after the gym" },
    seed: 1,
  });
  const wheyItem = withWhey.meals.flatMap((m) => m.items).find((i) => i.id === "whey");
  assert.ok(wheyItem, "whey missing despite the usual diet mentioning it");
  assert.equal(wheyItem.amount, 1, "whey repair must stay at one serving");
  const wheyMeal = withWhey.meals.find((m) => m.items.some((i) => i.id === "whey"))!;
  assert.ok(
    wheyMeal.items.some(
      (item) => item.id !== "whey" && CATALOG_BY_ID[item.id]?.role === "protein"
    ),
    "whey replaced the meal's normal food protein"
  );
  assert.ok(withWhey.totalCalories <= 2200, "whey pushed the day over budget");
  // Swappable: it is a real catalog item (not approx), so the per-item swap works.
  assert.equal(isKnownFood("whey"), true);
});

test("item swaps rotate through MANY options, not the same 2-3", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 });
  const slot = "lunch" as const;
  const seen = new Set<string>();
  for (let s = 1; s <= 12; s++) {
    const next = swapPlanItem(plan, slot, 0, s * 101);
    const name = next.meals.find((m) => m.slot === slot)!.items[0].name;
    seen.add(name);
  }
  assert.ok(seen.size >= 5, `swaps only rotated through ${seen.size} options: ${[...seen].join(", ")}`);
});

// D2 — mentioned() is word-boundary safe: a word CONTAINING a food name must
// not seed/protect that food ("buttermilk" is not "Milk"); whole words and
// aliases still match. bestCatalogMatch goes through the same mentioned() the
// plan seeder uses, so these assertions bind the seeding behavior too.
test("D2: usual-text matching is word-boundary safe (buttermilk ≠ milk)", () => {
  assert.notEqual(bestCatalogMatch("buttermilk", openFilter)?.id, "milk");
  assert.equal(bestCatalogMatch("a glass of milk", openFilter)?.id, "milk");
  // Multi-word names keep matching via their tokens ("daal" hits Daal (lentils)).
  assert.ok(bestCatalogMatch("daal and rice", openFilter));
});

test("vegetarian protein coverage improved — a strict veg plan can now be built", () => {
  // Veg + avoid egg/dairy/nuts used to collapse to daal/chana (shortfall). With
  // the Phase 4 additions (rajma/lobia/soya/tofu/chana chaat) it should fill out.
  const plan = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 110,
    filter: { vegetarian: true, excludeTags: ["egg", "dairy", "nuts"], excludeFoods: [], regionFocus: null },
    seed: 5,
  });
  // Coverage bar: a strict veg day still builds to ≥85% of target on the small
  // test catalog, and the 95%-tolerance flag must mirror the actual landing.
  assert.ok(plan.totalCalories >= 2000 * 0.85, `veg day collapsed: ${plan.totalCalories}`);
  assert.equal(plan.caloriesShort, plan.totalCalories < 2000 * 0.95);
  assert.ok(plan.totalCalories <= 2000, "still within the calorie cap");
});

test("mergeFilters unions excludes and keeps the latest region preferences", () => {
  const merged = mergeFilters(
    { vegetarian: false, excludeTags: ["beef"] },
    {
      excludeTags: ["beef", "fish"],
      regionFocus: "desi",
      profileRegion: "pakistan",
    },
    { vegetarian: true }
  );
  assert.equal(merged.vegetarian, true);
  assert.deepEqual([...merged.excludeTags].sort(), ["beef", "fish"]);
  assert.equal(merged.regionFocus, "desi");
  assert.equal(merged.profileRegion, "pakistan");
});

test("filterFromPreference maps veg_limited to vegetarian and merges extras", () => {
  assert.equal(filterFromPreference("veg_limited").vegetarian, true);
  assert.equal(filterFromPreference("normal_desi").vegetarian, false);
  const merged = filterFromPreference("normal_desi", { excludeTags: ["beef", "beef"], regionFocus: "desi" });
  assert.deepEqual(merged.excludeTags, ["beef"]); // deduped
  assert.equal(merged.regionFocus, "desi");
});

test("region focus is a soft preference and still returns valid curated foods", () => {
  const desi = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 120,
    filter: { ...openFilter, regionFocus: "desi" },
    seed: 4,
    pool: DIET_PLAN_POOL,
  });
  const western = buildPlan({
    calorieTarget: 2000,
    proteinTargetG: 120,
    filter: { ...openFilter, regionFocus: "western" },
    seed: 4,
    pool: DIET_PLAN_POOL,
  });
  const regionalCount = (plan: DietPlan, region: "desi" | "western") =>
    plan.meals
      .flatMap((meal) => meal.items)
      .filter((item) => CATALOG_BY_ID[item.id]?.region === region).length;

  assert.ok(regionalCount(desi, "desi") > regionalCount(western, "desi"));
  assert.ok(regionalCount(western, "western") > regionalCount(desi, "western"));
  assert.ok(
    [...desi.meals, ...western.meals]
      .flatMap((meal) => meal.items)
      .every((item) => DIET_PLAN_FOOD_IDS.has(item.id))
  );
});

// --- ship-readiness edge battery ---------------------------------------------

test("EDGE: floor-tier target (1200/100, female floor) builds sane non-empty mains", () => {
  for (const seed of [1, 3, 7]) {
    const plan = buildPlan({ calorieTarget: 1200, proteinTargetG: 100, filter: openFilter, seed });
    assert.ok(plan.totalCalories <= 1200, `over: ${plan.totalCalories}`);
    assert.ok(plan.totalCalories >= 1200 * 0.9 || plan.caloriesShort, "silent shortfall");
    for (const m of plan.meals) {
      if (m.slot === "snack") continue;
      assert.ok(m.items.length >= 1, `${m.slot} empty at 1200 kcal (seed ${seed})`);
    }
  }
});

test("EDGE: huge bulk target (3600/180) never exceeds and flags honestly if unreachable", () => {
  const plan = buildPlan({ calorieTarget: 3600, proteinTargetG: 180, filter: openFilter, seed: 5 });
  assert.ok(plan.totalCalories <= 3600, `over: ${plan.totalCalories}`);
  assert.ok(plan.totalCalories >= 3600 * 0.95 || plan.caloriesShort, "silent shortfall on bulk");
  assert.ok(plan.totalProtein >= 180 || plan.proteinShort, "silent protein shortfall on bulk");
});

test("EDGE: zero/invalid calorie target returns an honest empty plan (never NaN output)", () => {
  for (const target of [0, -500, Number.NaN]) {
    const plan = buildPlan({ calorieTarget: target, proteinTargetG: 120, filter: openFilter, seed: 1 });
    assert.equal(plan.totalCalories, 0);
    assert.equal(plan.caloriesShort, true);
    assert.ok(plan.meals.every((m) => m.items.length === 0));
  }
});

test("EDGE: vegan-ish (veg + no egg/dairy/nuts) at 1500/110 builds from plant staples only", () => {
  const plan = buildPlan({
    calorieTarget: 1500,
    proteinTargetG: 110,
    filter: { vegetarian: true, excludeTags: ["egg", "dairy", "nuts"], excludeFoods: [], regionFocus: null },
    seed: 2,
  });
  assert.ok(plan.totalCalories <= 1500);
  const foods = plan.meals.flatMap((m) => m.items.map((i) => CATALOG_BY_ID[i.id])).filter(Boolean);
  for (const f of foods) {
    assert.ok(f!.vegetarian, `non-veg leaked: ${f!.name}`);
    assert.ok(!f!.tags.some((t) => ["egg", "dairy", "nuts"].includes(t)), `allergen leaked: ${f!.name}`);
  }
  // It still anchors protein from plant staples rather than collapsing.
  assert.ok(plan.totalProtein >= 70 || plan.proteinShort, "plant protein collapsed silently");
});

test("EDGE: per-item ops on SCALED items keep amounts and stay within flexed budgets", () => {
  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 140, filter: openFilter, seed: 4 });
  const lunch = plan.meals.find((m) => m.slot === "lunch")!;
  const scaledIdx = lunch.items.findIndex((i) => i.unitMode === "portion" && (i.amount ?? 0) > 0);
  assert.ok(scaledIdx >= 0, "no scaled portion item to test");

  // Remove -> undo restores the exact item, position, meal totals, and day totals.
  const removed = removePlanItem(plan, "lunch", scaledIdx);
  const restored = insertPlanItem(removed, "lunch", scaledIdx, lunch.items[scaledIdx]);
  const restoredLunch = restored.meals.find((m) => m.slot === "lunch")!;
  assert.deepEqual(restoredLunch.items, lunch.items);
  assert.equal(restoredLunch.calories, lunch.calories);
  assert.equal(restoredLunch.protein, lunch.protein);
  assert.equal(restored.totalCalories, plan.totalCalories);
  assert.equal(restored.totalProtein, plan.totalProtein);

  // setPlanItemAmount recomputes totals from the scaled base.
  const doubled = setPlanItemAmount(plan, "lunch", scaledIdx, (lunch.items[scaledIdx].amount ?? 100) * 2);
  const item = doubled.meals.find((m) => m.slot === "lunch")!.items[scaledIdx];
  assert.ok(Math.abs(item.calories - lunch.items[scaledIdx].calories * 2) <= 2, "amount edit didn't scale");
});

test("EDGE: automatic scaler respects per-food realistic max amounts", () => {
  const cases: Array<{ id: keyof typeof CATALOG_BY_ID; max: number; slots: MealSlot[] }> = [
    { id: "greek_yogurt", max: 300, slots: ["breakfast", "snack"] },
    { id: "eggs2", max: 4, slots: ["breakfast", "snack"] },
    { id: "roti2", max: 4, slots: ["breakfast", "lunch", "dinner"] },
    { id: "chicken_breast", max: 250, slots: ["lunch", "dinner"] },
    { id: "rice", max: 300, slots: ["lunch", "dinner"] },
  ];

  for (const testCase of cases) {
    const food = { ...CATALOG_BY_ID[testCase.id], slots: testCase.slots };
    const plan = buildPlan({ calorieTarget: 3600, proteinTargetG: 220, filter: openFilter, seed: 3, pool: [food] });
    const items = plan.meals.flatMap((m) => m.items).filter((i) => i.id === testCase.id);

    assert.ok(items.length > 0, `expected ${testCase.id} to be selected`);
    assert.ok(
      items.every((i) => (i.amount ?? 0) <= testCase.max),
      `oversized ${testCase.id}: ${items.map((i) => i.amount).join(", ")}`
    );
  }
});

test("EDGE: swapping a scaled item keeps the meal within its flexed budget", () => {
  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 140, filter: openFilter, seed: 4 });
  for (let s = 1; s <= 6; s++) {
    const next = swapPlanItem(plan, "dinner", 0, s * 37);
    const dinner = next.meals.find((m) => m.slot === "dinner")!;
    assert.ok(dinner.calories <= dinner.budget * 1.15, `swap blew the meal: ${dinner.calories}/${dinner.budget}`);
  }
});

// --- Feature: learn from the log (preferIds bias) ----------------------------

test("preferIds pulls a food into selection that ranks too low to appear otherwise", () => {
  // 8 interchangeable staple proteins; the one whose id sorts LAST never enters
  // the top-N window on its own (equal score → id tiebreak), so it only appears
  // when preferred. This isolates the bias from the normal randomisation.
  const protein = (id: string): CatalogFood => ({
    id,
    name: id,
    portion: "1 serving (~150g)",
    calories: 300,
    protein: 30,
    carbs: 5,
    fat: 15,
    region: "desi",
    vegetarian: true,
    role: "protein",
    slots: ["lunch"],
    tags: [],
    staple: "protein",
  });
  const pool: CatalogFood[] = [
    ...["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map(protein),
    protein("zzz_pref"),
    {
      id: "c1", name: "carb", portion: "1 katori (~150g)", calories: 200, protein: 4, carbs: 44, fat: 1,
      region: "desi", vegetarian: true, role: "carb", slots: ["lunch"], tags: [], staple: "carb",
    },
  ];
  const has = (p: ReturnType<typeof buildPlan>) => p.meals.some((m) => m.items.some((i) => i.id === "zzz_pref"));

  let withPref = 0;
  let without = 0;
  for (let seed = 1; seed <= 30; seed++) {
    if (has(buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed, pool, preferIds: new Set(["zzz_pref"]) }))) withPref++;
    if (has(buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed, pool }))) without++;
  }
  assert.equal(without, 0, "control: a low-ranked food must never appear unprompted");
  assert.ok(withPref > 0, "preferIds failed to surface the preferred food");
});

// --- Feature: close the daily loop (replanRemaining) -------------------------

test("replanRemaining freezes eaten meals and refits the rest to what's left", () => {
  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 1 });
  const eaten: MealSlot[] = ["breakfast", "lunch"];
  const eatenSet = new Set<string>(eaten);
  const next = replanRemaining(plan, { calories: 800, proteinG: 50 }, eaten, FOOD_CATALOG, 1);

  // eaten meals are byte-for-byte unchanged (frozen)
  for (const slot of eaten) {
    assert.deepEqual(next.meals.find((m) => m.slot === slot), plan.meals.find((m) => m.slot === slot));
  }
  // the un-eaten meals together never exceed the remaining calories
  const openCal = next.meals.filter((m) => !eatenSet.has(m.slot)).reduce((s, m) => s + m.calories, 0);
  assert.ok(openCal <= 800, `refit exceeded remaining: ${openCal}/800`);
  // totals stay internally consistent with the meals
  assert.equal(next.totalCalories, next.meals.reduce((s, m) => s + m.calories, 0));
});

test("replanRemaining is a no-op when there's no room or nothing left to plan", () => {
  const plan = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 1 });
  assert.equal(replanRemaining(plan, { calories: 0, proteinG: 0 }, ["breakfast"], FOOD_CATALOG, 1), plan);
  assert.equal(replanRemaining(plan, { calories: -100, proteinG: 0 }, [], FOOD_CATALOG, 1), plan);
  assert.equal(
    replanRemaining(plan, { calories: 900, proteinG: 50 }, ["breakfast", "lunch", "dinner", "snack"], FOOD_CATALOG, 1),
    plan
  );
});

test("replanRemaining preserves the logged record and the day targets, and is deterministic", () => {
  const base = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 1 });
  const plan = { ...base, logged: { date: "2026-06-17", slots: ["breakfast"] as MealSlot[] } };
  const a = replanRemaining(plan, { calories: 1200, proteinG: 80 }, ["breakfast"], FOOD_CATALOG, 5);
  const b = replanRemaining(plan, { calories: 1200, proteinG: 80 }, ["breakfast"], FOOD_CATALOG, 5);
  assert.deepEqual(a, b); // deterministic for a seed
  assert.deepEqual(a.logged, plan.logged); // logged record carried through
  assert.equal(a.calorieTarget, 2000);
  assert.equal(a.proteinTargetG, 120);
});

// --- Hybrid generator (Phase 2/3): Groq picks the foods, the deterministic ----
// engine grounds them. These prove the math CONTRACT holds no matter what the
// selector hands over — including sparse, empty, or fancy/unmatched garbage.

// Representative selections, from clean to adversarial.
const SELECTIONS: SelectedNames[] = [
  { breakfast: ["eggs", "paratha"], lunch: ["chicken", "rice"], dinner: ["beef", "roti"], snack: ["banana"] },
  { breakfast: ["oats", "milk"], lunch: ["daal", "rice"], dinner: ["chicken", "naan"], snack: ["apple"] },
  { lunch: ["chicken"] }, // sparse — one slot, one food
  {}, // empty — the pure deterministic fallback path
  { breakfast: ["truffle risotto foam"], dinner: ["foie gras terrine"], snack: ["gold leaf"] }, // unmatched garbage
];

test("hybrid: hits ±5% (or honestly flags) and never exceeds, for ANY Groq selection", () => {
  for (const names of SELECTIONS) {
    for (const seed of [1, 5]) {
      const plan = buildPlanFromSelection(names, { calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed });
      const label = JSON.stringify(names);
      assert.ok(plan.totalCalories <= 2100, `over budget: ${plan.totalCalories} for ${label}`);
      assert.ok(
        plan.totalCalories >= 2100 * 0.95 || plan.caloriesShort,
        `silent shortfall: ${plan.totalCalories}/2100 for ${label}`
      );
      assert.ok(plan.totalProtein >= 130 || plan.proteinShort, `silent protein shortfall for ${label}`);
      // a COMPLETE plan: the deterministic builder fills every main meal even
      // when the selection seeded nothing for it.
      for (const m of plan.meals) {
        if (m.slot === "snack") continue;
        assert.ok(m.items.length >= 1, `${m.slot} empty for ${label}`);
      }
    }
  }
});

test("hybrid: vegetarian filter holds even when the selection names meat", () => {
  const vf: DietFilter = { vegetarian: true, excludeTags: [], excludeFoods: [], regionFocus: null };
  const plan = buildPlanFromSelection(
    { breakfast: ["eggs"], lunch: ["chicken", "rice"], dinner: ["beef", "roti"], snack: ["apple"] },
    { calorieTarget: 2000, proteinTargetG: 110, filter: vf, seed: 3 }
  );
  for (const m of plan.meals) {
    for (const i of m.items) {
      assert.equal(CATALOG_BY_ID[i.id]?.vegetarian, true, `${i.name} is not vegetarian`);
    }
  }
});

test("hybrid: avoid tags hold even when the selection names an avoided food", () => {
  const f: DietFilter = { vegetarian: false, excludeTags: ["beef"], excludeFoods: [], regionFocus: null };
  const plan = buildPlanFromSelection(
    { lunch: ["beef", "rice"], dinner: ["beef karahi", "roti"] },
    { calorieTarget: 2100, proteinTargetG: 120, filter: f, seed: 4 }
  );
  const ids = plan.meals.flatMap((m) => m.items.map((i) => i.id));
  assert.ok(ids.every((id) => !CATALOG_BY_ID[id]?.tags.includes("beef")), `beef leaked: ${ids.join(",")}`);
});

test("hybrid: an all-unmatched (fancy) selection still yields a complete plan from catalog foods", () => {
  const plan = buildPlanFromSelection(
    { breakfast: ["truffle omelette foam"], lunch: ["wagyu carpaccio"], dinner: ["foie gras terrine"] },
    { calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 6 }
  );
  for (const m of plan.meals) {
    if (m.slot === "snack") continue;
    assert.ok(m.items.length >= 1, `${m.slot} empty`);
  }
  // nothing fancy leaks in — every item is a real curated catalog food.
  for (const i of plan.meals.flatMap((m) => m.items)) {
    assert.ok(CATALOG_BY_ID[i.id], `non-catalog food leaked: ${i.name}`);
  }
  assert.ok(plan.totalCalories <= 2000);
});

test("hybrid: an empty selection is identical to the pure deterministic plan (the fallback)", () => {
  const a = buildPlanFromSelection({}, { calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 9 });
  const b = buildPlan({ calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 9 });
  assert.deepEqual(a, b);
});

test("hybrid: a selected food that matches the catalog is actually used (Groq drives the 'what')", () => {
  const plan = buildPlanFromSelection(
    { breakfast: ["oats"], lunch: ["daal", "rice"], dinner: ["chicken", "roti"], snack: ["banana"] },
    { calorieTarget: 2100, proteinTargetG: 120, filter: openFilter, seed: 2 }
  );
  const bfast = plan.meals.find((m) => m.slot === "breakfast")!.items.map((i) => i.id);
  assert.ok(bfast.includes("oats"), `selected oats not used in breakfast: ${bfast.join(",")}`);
  const lunch = plan.meals.find((m) => m.slot === "lunch")!.items.map((i) => i.id);
  assert.ok(lunch.includes("daal") || lunch.includes("rice"), `lunch ignored the selection: ${lunch.join(",")}`);
});

test("hybrid polish: one mentioned protein does not seed multiple same-category dishes", () => {
  const plan = buildPlanFromSelection(
    { breakfast: ["eggs", "paratha"], lunch: ["chicken", "rice"] },
    { calorieTarget: 2100, proteinTargetG: 130, filter: openFilter, seed: 1 }
  );

  const breakfast = plan.meals.find((m) => m.slot === "breakfast")!.items;
  const breakfastFoods = breakfast.map((i) => CATALOG_BY_ID[i.id]).filter(Boolean);
  assert.equal(
    breakfastFoods.filter((f) => f!.tags.includes("egg")).length,
    1,
    `eggs seeded too many egg dishes: ${breakfast.map((i) => i.name).join(", ")}`
  );
  assert.ok(
    breakfastFoods.some((f) => f!.role === "carb"),
    `breakfast did not preserve a carb seed: ${breakfast.map((i) => i.name).join(", ")}`
  );

  const lunch = plan.meals.find((m) => m.slot === "lunch")!.items;
  const lunchFoods = lunch.map((i) => CATALOG_BY_ID[i.id]).filter(Boolean);
  assert.equal(
    lunchFoods.filter((f) => f!.tags.includes("chicken")).length,
    1,
    `chicken seeded too many chicken dishes: ${lunch.map((i) => i.name).join(", ")}`
  );
  assert.ok(
    lunchFoods.some((f) => f!.tags.includes("rice")),
    `lunch did not preserve the rice seed: ${lunch.map((i) => i.name).join(", ")}`
  );
});

test("hybrid: plans use only simple curated catalog foods, never fancy ingredients", () => {
  for (const names of SELECTIONS) {
    const plan = buildPlanFromSelection(names, { calorieTarget: 2000, proteinTargetG: 120, filter: openFilter, seed: 7 });
    const items = plan.meals.flatMap((m) => m.items);
    for (const i of items) assert.ok(CATALOG_BY_ID[i.id], `non-catalog food in plan: ${i.name}`);
    assert.ok(new Set(items.map((i) => i.name)).size <= 14, "plan grew too fancy (too many distinct dishes)");
  }
});
