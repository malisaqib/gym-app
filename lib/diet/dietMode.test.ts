import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDietMode, hasExplicitDietMode } from "./dietMode.ts";
import {
  buildPlan,
  filterFromPreference,
  effectiveDietMode,
  validateDietPlan,
  bestCatalogMatch,
  searchCatalog,
  swapPlanItem,
  replanRemaining,
  setPlanDietMode,
  type DietPlan,
  type DietFilter,
} from "./planner.ts";
import { CATALOG_BY_ID, FOOD_CATALOG, type MealSlot } from "./foodCatalog.ts";
import { DIET_PLAN_POOL } from "./planPool.ts";
import { buildMealCandidatePool, type MealCandidate, type MealCandidateLists } from "./mealCandidates.ts";
import { parseMealSelection } from "./mealSelection.ts";

const MAIN: MealSlot[] = ["lunch", "dinner"];
const isAnimal = (id: string) => CATALOG_BY_ID[id] != null && !CATALOG_BY_ID[id].vegetarian;

// Count meat/fish items that sit in a main (lunch/dinner) meal.
function animalMainItems(plan: DietPlan): number {
  return plan.meals
    .filter((m) => MAIN.includes(m.slot))
    .flatMap((m) => m.items)
    .filter((i) => isAnimal(i.id)).length;
}
function anyAnimalItems(plan: DietPlan): number {
  return plan.meals.flatMap((m) => m.items).filter((i) => isAnimal(i.id)).length;
}

function planFor(
  dietMode: "vegetarian" | "flexitarian" | "non_veg",
  opts: { seed?: number; calories?: number; protein?: number; pref?: "normal_desi" | "high_protein" } = {}
): DietPlan {
  const pref = opts.pref ?? "normal_desi";
  const filter = filterFromPreference(pref, { regionFocus: "desi", profileRegion: "pakistan" }, dietMode);
  const pool = buildMealCandidatePool({ filter, region: "pakistan", foodPreference: pref, allowProteinPowder: false });
  return buildPlan({
    calorieTarget: opts.calories ?? 2100,
    proteinTargetG: opts.protein ?? 120,
    filter,
    pool,
    seed: opts.seed ?? 4100,
    foodPreference: pref,
  });
}

const SEEDS = [1, 7, 26, 99, 555, 4100, 12345];

// --- resolver -----------------------------------------------------------------

test("legacy veg_limited resolves to strict vegetarian until an explicit mode is set", () => {
  assert.equal(resolveDietMode(null, "veg_limited"), "vegetarian");
  assert.equal(resolveDietMode(undefined, "veg_limited"), "vegetarian");
  assert.equal(resolveDietMode("unknown", "veg_limited"), "vegetarian");
  // An explicit choice always wins over the legacy text.
  assert.equal(resolveDietMode("flexitarian", "veg_limited"), "flexitarian");
  assert.equal(resolveDietMode("non_veg", "veg_limited"), "non_veg");
});

test("resolver defaults non-veg-limited legacy users to non_veg (safe legacy behavior)", () => {
  assert.equal(resolveDietMode(null, "normal_desi"), "non_veg");
  assert.equal(resolveDietMode(null, null), "non_veg");
  assert.equal(resolveDietMode("unknown", "normal_desi"), "non_veg");
});

test("hasExplicitDietMode only true for a real explicit mode", () => {
  assert.equal(hasExplicitDietMode("vegetarian"), true);
  assert.equal(hasExplicitDietMode("flexitarian"), true);
  assert.equal(hasExplicitDietMode("non_veg"), true);
  assert.equal(hasExplicitDietMode("unknown"), false);
  assert.equal(hasExplicitDietMode(null), false);
  assert.equal(hasExplicitDietMode(undefined), false);
});

// --- filter mapping -----------------------------------------------------------

test("filterFromPreference: legacy veg_limited still maps to a vegetarian filter", () => {
  const f = filterFromPreference("veg_limited");
  assert.equal(f.vegetarian, true);
  assert.equal(effectiveDietMode(f), "vegetarian");
});

test("filterFromPreference: explicit diet mode overrides the legacy preference", () => {
  // A legacy veg_limited row, but the user has now explicitly chosen flexitarian.
  const f = filterFromPreference("veg_limited", undefined, "flexitarian");
  assert.equal(f.vegetarian, false);
  assert.equal(effectiveDietMode(f), "flexitarian");
});

// --- generation: vegetarian ---------------------------------------------------

test("explicit vegetarian generation never includes meat or fish", () => {
  for (const seed of SEEDS) {
    const plan = planFor("vegetarian", { seed });
    for (const item of plan.meals.flatMap((m) => m.items)) {
      assert.ok(!isAnimal(item.id), `seed ${seed}: ${item.id} leaked meat/fish into a vegetarian plan`);
    }
    assert.ok(validateDietPlan(plan, DIET_PLAN_POOL).foodsOk);
  }
});

// --- generation: non_veg ------------------------------------------------------

test("explicit non_veg generation is allowed to use meat/fish", () => {
  const usedAnimal = SEEDS.some((seed) => anyAnimalItems(planFor("non_veg", { seed })) > 0);
  assert.ok(usedAnimal, "non_veg never used any meat/fish across seeds");
});

// --- generation: flexitarian --------------------------------------------------

test("flexitarian generation uses at most one meat/fish item, only in a main meal", () => {
  let sawMeat = false;
  for (const seed of SEEDS) {
    const plan = planFor("flexitarian", { seed });
    const mains = animalMainItems(plan);
    const all = anyAnimalItems(plan);
    if (all > 0) sawMeat = true;
    assert.equal(all, mains, `seed ${seed}: meat/fish appeared outside a main meal`);
    assert.ok(mains <= 1, `seed ${seed}: ${mains} meat/fish main items (limit 1)`);
    assert.ok(validateDietPlan(plan, DIET_PLAN_POOL).foodsOk, `seed ${seed}: validation flagged foods`);
  }
  assert.ok(sawMeat, "flexitarian never used meat/fish across any seed");
});

test("flexitarian high-protein generation still respects the one meat/fish item cap", () => {
  for (const seed of SEEDS) {
    const plan = planFor("flexitarian", { seed, pref: "high_protein", protein: 150 });
    assert.ok(animalMainItems(plan) <= 1, `seed ${seed}: high-protein flexitarian exceeded the cap`);
    assert.equal(anyAnimalItems(plan), animalMainItems(plan));
  }
});

test("flexitarian extra-item repair does not add a second meat/fish item", () => {
  // Low calories + high protein forces the protein repair to fire; it must reach
  // for vegetarian proteins, never a second meat/fish dish.
  for (const seed of SEEDS) {
    const plan = planFor("flexitarian", { seed, calories: 1900, protein: 150 });
    assert.ok(anyAnimalItems(plan) <= 1, `seed ${seed}: repair stacked a second meat/fish item`);
  }
});

// --- typed add / false substitution ------------------------------------------

const flexFilter: DietFilter = {
  vegetarian: false,
  dietMode: "flexitarian",
  excludeTags: [],
  excludeFoods: [],
  regionFocus: null,
};
const vegFilter: DietFilter = {
  vegetarian: true,
  dietMode: "vegetarian",
  excludeTags: [],
  excludeFoods: [],
  regionFocus: null,
};
const nonVegFilter: DietFilter = {
  vegetarian: false,
  dietMode: "non_veg",
  excludeTags: [],
  excludeFoods: [],
  regionFocus: null,
};

test("vegetarian typed add never resolves to meat/fish (and does not false-substitute)", () => {
  // "fish curry" and "aloo gosht" share generic tokens (curry/aloo) with veg
  // dishes; the matcher must reject, not silently swap in the veg food.
  assert.equal(bestCatalogMatch("fish curry", vegFilter, "lunch", FOOD_CATALOG, false, { meals: [] }), null);
  assert.equal(bestCatalogMatch("aloo gosht", vegFilter, "lunch", FOOD_CATALOG, false, { meals: [] }), null);
  assert.equal(bestCatalogMatch("grilled chicken", vegFilter, "dinner", FOOD_CATALOG, false, { meals: [] }), null);
  // A genuine vegetarian dish still matches.
  assert.equal(bestCatalogMatch("aloo curry", vegFilter, "lunch", FOOD_CATALOG, false, { meals: [] })?.id, "aloo");
});

test("flexitarian typed add rejects a second meat/fish main without substituting a veg food", () => {
  const planWithMeatDinner = { meals: [{ slot: "dinner" as MealSlot, items: [{ id: "chicken_thigh" }] }] };
  // Limit already used → typing another meat dish must be rejected, not swapped.
  assert.equal(
    bestCatalogMatch("fish curry", flexFilter, "lunch", FOOD_CATALOG, false, planWithMeatDinner),
    null
  );
  // With no meat yet, the same typed meat dish is allowed.
  assert.equal(
    bestCatalogMatch("fish curry", flexFilter, "lunch", FOOD_CATALOG, false, { meals: [] })?.id,
    "fish_curry"
  );
});

test("non_veg typed add still matches meat/fish normally", () => {
  assert.equal(bestCatalogMatch("fish curry", nonVegFilter, "lunch", FOOD_CATALOG, false, { meals: [] })?.id, "fish_curry");
  assert.equal(bestCatalogMatch("aloo gosht", nonVegFilter, "lunch", FOOD_CATALOG, false, { meals: [] })?.id, "aloo_gosht");
});

// --- add-food search ----------------------------------------------------------

test("flexitarian add-food search hides meat/fish once the day's meat item is used", () => {
  const planWithMeatDinner = { meals: [{ slot: "dinner" as MealSlot, items: [{ id: "chicken_thigh" }] }] };
  const results = searchCatalog("chicken", flexFilter, "lunch", FOOD_CATALOG, false, planWithMeatDinner);
  assert.ok(results.every((f) => f.vegetarian), "meat/fish leaked into search after the cap was reached");

  // With no meat used yet, a meat search can surface meat options.
  const open = searchCatalog("chicken", flexFilter, "lunch", FOOD_CATALOG, false, { meals: [] });
  assert.ok(open.some((f) => !f.vegetarian), "flexitarian search hid meat even before the cap");
});

test("vegetarian add-food search never returns meat/fish", () => {
  const results = searchCatalog("chicken", vegFilter, "lunch", FOOD_CATALOG, false, { meals: [] });
  assert.equal(results.length, 0);
});

// --- item swap ----------------------------------------------------------------

test("flexitarian item swap cannot introduce a second meat/fish item", () => {
  for (const seed of SEEDS) {
    let plan = planFor("flexitarian", { seed });
    if (animalMainItems(plan) === 0) continue; // nothing to over-fill
    // Try to swap a vegetarian item in every main meal toward something else; the
    // candidate pool must never offer a second meat/fish dish.
    for (const meal of plan.meals.filter((m) => MAIN.includes(m.slot))) {
      for (let i = 0; i < meal.items.length; i++) {
        if (isAnimal(meal.items[i].id)) continue;
        plan = swapPlanItem(plan, meal.slot, i, seed + i, DIET_PLAN_POOL);
        assert.ok(anyAnimalItems(plan) <= 1, `seed ${seed}: swap created a second meat/fish item`);
      }
    }
  }
});

// --- fit remaining ------------------------------------------------------------

test("flexitarian fit-remaining does not add meat after the meat meal is eaten", () => {
  for (const seed of SEEDS) {
    const plan = planFor("flexitarian", { seed });
    // Find the eaten main meal that holds the meat item (if any).
    const meatMeal = plan.meals.find((m) => MAIN.includes(m.slot) && m.items.some((i) => isAnimal(i.id)));
    if (!meatMeal) continue;
    const replanned = replanRemaining(
      plan,
      { calories: 1200, proteinG: 80 },
      [meatMeal.slot],
      DIET_PLAN_POOL,
      seed
    );
    assert.ok(anyAnimalItems(replanned) <= 1, `seed ${seed}: fit-remaining added a second meat/fish item`);
  }
});

// --- Groq selection validation ------------------------------------------------

function cand(id: string, vegetarian: boolean, slots: MealSlot[]): MealCandidate {
  return {
    id,
    name: id,
    role: "protein",
    slots,
    region: "global",
    vegetarian,
    whey: false,
    common: true,
    regionMatch: "global",
  };
}
function lists(over: Partial<MealCandidateLists>): MealCandidateLists {
  const base: MealCandidateLists = { breakfast: [], lunch: [], dinner: [], snack: [] };
  return { ...base, ...over };
}

test("Groq selection: vegetarian rejects any meat/fish candidate", () => {
  const c = lists({
    breakfast: [cand("eggs2", true, ["breakfast"])],
    lunch: [cand("daal", true, ["lunch"]), cand("chicken_breast", false, ["lunch"])],
  });
  const raw = { breakfast: [{ id: "eggs2" }], lunch: [{ id: "chicken_breast" }], dinner: [], snack: [] };
  assert.equal(parseMealSelection(raw, c, "vegetarian"), null);
  // A fully vegetarian selection passes.
  const vegRaw = { breakfast: [{ id: "eggs2" }], lunch: [{ id: "daal" }], dinner: [], snack: [] };
  assert.ok(parseMealSelection(vegRaw, c, "vegetarian"));
});

test("Groq selection: flexitarian allows one meat item but rejects a second", () => {
  const c = lists({
    lunch: [cand("daal", true, ["lunch"]), cand("chicken_breast", false, ["lunch"])],
    dinner: [cand("rajma", true, ["dinner"]), cand("fish_curry", false, ["dinner"])],
  });
  // One meat item in a main meal — accepted.
  const one = { breakfast: [], lunch: [{ id: "chicken_breast" }, { id: "daal" }], dinner: [{ id: "rajma" }], snack: [] };
  assert.ok(parseMealSelection(one, c, "flexitarian"));
  // Two meat items across mains — rejected.
  const two = { breakfast: [], lunch: [{ id: "chicken_breast" }], dinner: [{ id: "fish_curry" }], snack: [] };
  assert.equal(parseMealSelection(two, c, "flexitarian"), null);
});

test("Groq selection: flexitarian rejects meat in a non-main slot", () => {
  const c = lists({
    breakfast: [cand("eggs2", true, ["breakfast"]), cand("chicken_breast", false, ["breakfast"])],
  });
  const raw = { breakfast: [{ id: "chicken_breast" }], lunch: [], dinner: [], snack: [] };
  assert.equal(parseMealSelection(raw, c, "flexitarian"), null);
});

// --- saved plan normalization -------------------------------------------------

test("setPlanDietMode (flexitarian) trims a saved plan to one meat/fish item", () => {
  // Start from a non_veg plan that may carry meat in both mains, then normalize.
  let worst: DietPlan | null = null;
  for (const seed of SEEDS) {
    const p = planFor("non_veg", { seed });
    if (animalMainItems(p) >= 2) { worst = p; break; }
  }
  assert.ok(worst, "could not produce a 2-meat non_veg plan to normalize");
  const flex = setPlanDietMode(worst!, "flexitarian", DIET_PLAN_POOL, true);
  assert.equal(effectiveDietMode(flex.filter), "flexitarian");
  assert.ok(anyAnimalItems(flex) <= 1, "flexitarian normalization left more than one meat/fish item");
  assert.ok(validateDietPlan(flex, DIET_PLAN_POOL).foodsOk);
});

test("setPlanDietMode (vegetarian) strips all meat/fish from a saved plan", () => {
  const p = planFor("non_veg", { seed: 4100 });
  const veg = setPlanDietMode(p, "vegetarian", DIET_PLAN_POOL, true);
  assert.equal(anyAnimalItems(veg), 0);
  assert.equal(effectiveDietMode(veg.filter), "vegetarian");
});

test("setPlanDietMode (legacy, non-authoritative) keeps a saved vegetarian plan vegetarian", () => {
  const p = planFor("vegetarian", { seed: 4100 });
  // Unknown/null legacy user (non-authoritative) resolves to non_veg, but must NOT
  // force meat into a plan that was saved vegetarian.
  const kept = setPlanDietMode(p, "non_veg", DIET_PLAN_POOL, false);
  assert.equal(kept.filter.vegetarian, true);
  assert.equal(anyAnimalItems(kept), 0);
});
