import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFood, type RawFoodRow } from "./foodClassify.ts";

// USDA SR-Legacy rows are per-100g (portion_grams = 100, region "western").
const usda = (name: string, m: { kcal: number; p: number; c: number; f: number }): RawFoodRow => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  region: "western",
  portion: "100g",
  portion_grams: 100,
  calories: m.kcal,
  protein_g: m.p,
  carbs_g: m.c,
  fat_g: m.f,
  source: "usda_sr",
});

test("excludes pure ingredients / condiments / sugars", () => {
  assert.equal(classifyFood(usda("Oil, olive, salad or cooking", { kcal: 884, p: 0, c: 0, f: 100 })), null);
  assert.equal(classifyFood(usda("Sugars, granulated", { kcal: 387, p: 0, c: 100, f: 0 })), null);
  assert.equal(classifyFood(usda("Salt, table", { kcal: 0, p: 0, c: 0, f: 0 })), null);
  assert.equal(classifyFood(usda("Spices, cinnamon, ground", { kcal: 247, p: 4, c: 81, f: 1 })), null);
  assert.equal(classifyFood(usda("Butter, salted", { kcal: 717, p: 0.9, c: 0.1, f: 81 })), null);
  assert.equal(classifyFood(usda("Leavening agents, baking soda", { kcal: 0, p: 0, c: 0, f: 0 })), null);
});

test("excludes raw animal flesh (prefers cooked)", () => {
  assert.equal(classifyFood(usda("Beef, ground, 80% lean meat / 20% fat, raw", { kcal: 254, p: 17, c: 0, f: 20 })), null);
  assert.equal(classifyFood(usda("Fish, salmon, atlantic, raw", { kcal: 142, p: 20, c: 0, f: 6 })), null);
});

test("cooked chicken → protein, non-veg, chicken tag, lunch/dinner, scaled to a serving", () => {
  const f = classifyFood(usda("Chicken, broilers or fryers, breast, meat only, cooked, roasted", { kcal: 165, p: 31, c: 0, f: 3.6 }))!;
  assert.ok(f, "should be kept");
  assert.equal(f.role, "protein");
  assert.equal(f.vegetarian, false);
  assert.ok(f.tags.includes("chicken"));
  assert.deepEqual(f.slots, ["lunch", "dinner"]);
  // 150g serving = per-100g × 1.5
  assert.equal(f.calories, Math.round(165 * 1.5));
  assert.equal(f.protein, Math.round(31 * 1.5));
});

test("lentils → vegetarian protein", () => {
  const f = classifyFood(usda("Lentils, mature seeds, cooked, boiled, without salt", { kcal: 116, p: 9, c: 20, f: 0.4 }))!;
  assert.equal(f.role, "protein");
  assert.equal(f.vegetarian, true);
});

test("egg → protein, vegetarian, egg tag, includes breakfast", () => {
  const f = classifyFood(usda("Egg, whole, cooked, hard-boiled", { kcal: 155, p: 13, c: 1.1, f: 11 }))!;
  assert.equal(f.role, "protein");
  assert.equal(f.vegetarian, true);
  assert.ok(f.tags.includes("egg"));
  assert.ok(f.slots.includes("breakfast"));
});

test("cooked rice → carb, all three main meals", () => {
  const f = classifyFood(usda("Rice, white, long-grain, regular, cooked", { kcal: 130, p: 2.7, c: 28, f: 0.3 }))!;
  assert.equal(f.role, "carb");
  assert.deepEqual(f.slots, ["breakfast", "lunch", "dinner"]);
});

test("milk → dairy, vegetarian, dairy tag", () => {
  const f = classifyFood(usda("Milk, whole, 3.25% milkfat", { kcal: 61, p: 3.2, c: 4.8, f: 3.3 }))!;
  assert.equal(f.role, "dairy");
  assert.equal(f.vegetarian, true);
  assert.ok(f.tags.includes("dairy"));
});

test("banana raw → fruit kept (raw is fine for produce), breakfast/snack", () => {
  const f = classifyFood(usda("Bananas, raw", { kcal: 89, p: 1.1, c: 23, f: 0.3 }))!;
  assert.equal(f.role, "fruit");
  assert.deepEqual(f.slots, ["breakfast", "snack"]);
});

test("almonds → snack, nuts tag, kept despite high fat", () => {
  const f = classifyFood(usda("Nuts, almonds", { kcal: 579, p: 21, c: 22, f: 50 }))!;
  assert.equal(f.role, "snack");
  assert.ok(f.tags.includes("nuts"));
  assert.equal(f.vegetarian, true);
});

test("unclassifiable rows are excluded", () => {
  assert.equal(classifyFood(usda("Restaurant, latino, arroz con grandules", { kcal: 150, p: 4, c: 25, f: 4 })), null);
});
