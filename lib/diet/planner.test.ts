import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  swapMeal,
  filterFromPreference,
  mergeFilters,
  removePlanItem,
  addPlanItem,
  appendPlanItem,
  swapPlanItem,
  setPlanItemAmount,
  searchCatalog,
  bestCatalogMatch,
  isKnownFood,
  type DietFilter,
} from "./planner.ts";
import { CATALOG_BY_ID, FOOD_CATALOG, type CatalogFood } from "./foodCatalog.ts";

const openFilter: DietFilter = { vegetarian: false, excludeTags: [], excludeFoods: [], regionFocus: null };

test("buildPlan returns the four meal slots in order", () => {
  const plan = buildPlan({ calorieTarget: 2100, proteinTargetG: 110, filter: openFilter, seed: 1 });
  assert.deepEqual(plan.meals.map((m) => m.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.ok(plan.meals.every((m) => m.items.length > 0));
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

  const withWhey = buildPlan({
    calorieTarget: 2200,
    proteinTargetG: 160,
    filter: openFilter,
    usual: { keep: "whey protein shake after the gym" },
    seed: 1,
  });
  const wheyItem = withWhey.meals.flatMap((m) => m.items).find((i) => i.id === "whey");
  assert.ok(wheyItem, "whey missing despite the usual diet mentioning it");
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
