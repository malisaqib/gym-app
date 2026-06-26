import { test } from "node:test";
import assert from "node:assert/strict";
import { FOOD_CATALOG, CATALOG_BY_ID, type CatalogFood, type MealSlot, type FoodRole } from "./foodCatalog.ts";

const ROLES: FoodRole[] = ["protein", "carb", "veg", "dairy", "fruit", "snack", "drink"];
const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const REGIONS = new Set(["desi", "western", "global"]);

// Does the friendly portion parse to grams (scalable) the way catalogSpec() does?
const isGramPortion = (portion: string) => /(\d+)\s*g\b/.test(portion);

test("no duplicate catalog IDs", () => {
  const ids = FOOD_CATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id(s) in FOOD_CATALOG");
  // CATALOG_BY_ID must round-trip every food.
  for (const f of FOOD_CATALOG) assert.equal(CATALOG_BY_ID[f.id], f);
});

test("every food has the required, well-typed metadata", () => {
  for (const f of FOOD_CATALOG) {
    assert.equal(typeof f.id, "string");
    assert.ok(f.id.length > 0, `${f.name}: empty id`);
    assert.ok(f.name && f.name.length > 0, `${f.id}: empty name`);
    assert.ok(REGIONS.has(f.region), `${f.id}: bad region ${f.region}`);
    assert.ok(ROLES.includes(f.role), `${f.id}: bad role ${f.role}`);
    assert.ok(Array.isArray(f.slots) && f.slots.length > 0, `${f.id}: needs at least one slot`);
    assert.ok(f.slots.every((s) => SLOTS.includes(s)), `${f.id}: bad slot`);
    assert.ok(Array.isArray(f.tags), `${f.id}: tags must be an array`);
    assert.equal(typeof f.vegetarian, "boolean", `${f.id}: vegetarian must be boolean`);
    assert.ok(typeof f.calories === "number" && f.calories >= 0, `${f.id}: bad calories`);
    for (const m of [f.protein, f.carbs, f.fat]) {
      assert.ok(typeof m === "number" && m >= 0, `${f.id}: bad macro`);
    }
    assert.ok(typeof f.portion === "string" && f.portion.length > 0, `${f.id}: needs a portion label`);
  }
});

test("macro sanity: stated calories roughly match the Atwater estimate", () => {
  // Generous tolerance — fiber / sugar-alcohol / rounding legitimately shift whole
  // foods a little; this only catches gross data entry errors (wrong macro/typo).
  for (const f of FOOD_CATALOG) {
    const atwater = 4 * f.protein + 4 * f.carbs + 9 * f.fat;
    const diff = Math.abs(atwater - f.calories);
    assert.ok(
      diff <= Math.max(40, 0.25 * f.calories),
      `${f.id}: calories ${f.calories} vs Atwater ${atwater.toFixed(0)} (diff ${diff.toFixed(0)})`
    );
  }
});

test("nuts / seeds / nut-butters carry an explicit small cap (never scale toward 100g)", () => {
  for (const f of FOOD_CATALOG) {
    const isNutSeed = f.tags.includes("nuts") || f.tags.includes("seeds");
    if (!isNutSeed) continue;
    assert.ok(f.maxAmount != null, `${f.id}: nut/seed needs an explicit maxAmount`);
    assert.ok(f.maxAmount! <= 60, `${f.id}: nut/seed cap ${f.maxAmount} is too high`);
  }
});

test("gram-scalable dairy is capped to a realistic amount", () => {
  for (const f of FOOD_CATALOG) {
    if (!f.tags.includes("dairy")) continue;
    if (!isGramPortion(f.portion)) continue; // count/serving dairy (milk, lassi) is capped by units
    if (f.tags.includes("supplement")) continue; // whey handled by its own serving cap
    assert.ok(f.maxAmount != null, `${f.id}: gram-based dairy needs a maxAmount`);
    assert.ok(f.maxAmount! <= 400, `${f.id}: dairy cap ${f.maxAmount} is unrealistically high`);
  }
});

test("whey stays a single-serving supplement", () => {
  const whey = CATALOG_BY_ID["whey"];
  assert.ok(whey);
  assert.equal(whey.maxAmount, 1);
  assert.equal(whey.plannerUnit, "serving");
  assert.ok(whey.tags.includes("supplement"));
});

// --- Phase 6B additions specifically -----------------------------------------

const PHASE_6B = [
  "lowfat_cottage_cheese", "milk_lowfat", "edamame", "black_beans", "lentils", "tempeh",
  "white_fish", "shrimp", "quinoa", "sweet_potato", "ww_pasta", "couscous", "ww_bagel",
  "avocado", "walnuts", "cashews", "pumpkin_seeds", "chia_seeds", "grapes", "watermelon",
  "guava", "papaya", "pear", "blueberries", "strawberries", "broccoli", "spinach_cooked",
  "carrots", "cucumber", "foul",
];

test("Phase 6B foods all exist and carry aliases for search/typed-add", () => {
  for (const id of PHASE_6B) {
    const f = CATALOG_BY_ID[id];
    assert.ok(f, `Phase 6B food missing: ${id}`);
    assert.ok((f.aliases?.length ?? 0) > 0, `${id}: needs at least one alias`);
  }
});

test("Phase 6B meat/fish foods are flagged non-vegetarian", () => {
  for (const id of ["white_fish", "shrimp"]) {
    assert.equal(CATALOG_BY_ID[id].vegetarian, false, `${id} must be non-vegetarian`);
  }
  // Everything else added in 6B is vegetarian.
  for (const id of PHASE_6B) {
    if (id === "white_fish" || id === "shrimp") continue;
    assert.equal(CATALOG_BY_ID[id].vegetarian, true, `${id} should be vegetarian`);
  }
});

test("Phase 6B gram-scalable proteins/carbs carry a realistic cap", () => {
  for (const id of ["lowfat_cottage_cheese", "edamame", "black_beans", "lentils", "tempeh",
    "white_fish", "shrimp", "quinoa", "sweet_potato", "ww_pasta", "couscous", "foul"]) {
    const f = CATALOG_BY_ID[id];
    assert.ok(isGramPortion(f.portion), `${id}: expected a gram-scalable portion`);
    assert.ok(f.maxAmount != null && f.maxAmount <= 350, `${id}: needs a realistic gram cap`);
  }
});
