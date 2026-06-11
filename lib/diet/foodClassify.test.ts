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

test("excludes branded/frozen pizza + restaurant rows from the plan pool", () => {
  assert.equal(classifyFood(usda("DIGIORNO Pizza, supreme topping, rising crust, frozen, baked", { kcal: 250, p: 11, c: 28, f: 10 })), null);
  assert.equal(classifyFood(usda('LITTLE CAESARS 14" Original Round Cheese Pizza, Regular Crust', { kcal: 260, p: 12, c: 31, f: 10 })), null);
  assert.equal(classifyFood(usda("Pizza, cheese topping, regular crust, frozen, cooked", { kcal: 268, p: 11, c: 33, f: 10 })), null);
  assert.equal(classifyFood(usda("Pizza rolls, frozen, unprepared", { kcal: 248, p: 9, c: 33, f: 9 })), null);
  assert.equal(classifyFood(usda("Rice, white, steamed, Chinese restaurant", { kcal: 151, p: 3, c: 33, f: 0.3 })), null);
  assert.equal(classifyFood(usda("Fish, gefiltefish, commercial, sweet recipe", { kcal: 84, p: 9, c: 7, f: 2 })), null);
  // ...while plain whole foods with "sweet" in the name are kept.
  assert.ok(classifyFood(usda("Sweet potato, cooked, baked in skin, flesh, without salt", { kcal: 90, p: 2, c: 21, f: 0.2 })));
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

test("raw starches and legumes that need cooking are excluded", () => {
  assert.equal(classifyFood(usda("Cassava, raw", { kcal: 160, p: 1.4, c: 38, f: 0.3 })), null);
  assert.equal(classifyFood(usda("Beans, kidney, red, mature seeds, raw", { kcal: 333, p: 24, c: 60, f: 1 })), null);
  assert.equal(classifyFood(usda("Egg, whole, raw, fresh", { kcal: 143, p: 13, c: 1, f: 10 })), null);
  assert.equal(classifyFood(usda("Tofu, raw, firm", { kcal: 144, p: 17, c: 3, f: 9 })), null);
  assert.equal(classifyFood(usda("Noodles, japanese, soba, dry", { kcal: 336, p: 14.4, c: 74.6, f: 0.7 })), null);
  assert.equal(classifyFood(usda("Amaranth grain, uncooked", { kcal: 371, p: 13.6, c: 65, f: 7 })), null);
  const cooked = classifyFood(usda("Cassava, cooked, boiled", { kcal: 112, p: 0.4, c: 27, f: 0.3 }))!;
  assert.equal(cooked.role, "carb");
  assert.ok(classifyFood(usda("Noodles, japanese, soba, cooked", { kcal: 99, p: 5.1, c: 21.4, f: 0.1 })));
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

test("banana peppers are vegetables, not fruit snacks", () => {
  const f = classifyFood(usda("Pepper, banana, raw", { kcal: 27, p: 1.7, c: 5.4, f: 0.5 }))!;
  assert.equal(f.role, "veg");
  assert.deepEqual(f.slots, ["lunch", "dinner"]);
});

test("almonds → snack, nuts tag, kept despite high fat", () => {
  const f = classifyFood(usda("Nuts, almonds", { kcal: 579, p: 21, c: 22, f: 50 }))!;
  assert.equal(f.role, "snack");
  assert.ok(f.tags.includes("nuts"));
  assert.equal(f.vegetarian, true);
});

test("pumpkin and squash seeds are snacks, not vegetables", () => {
  const f = classifyFood(usda("Seeds, pumpkin and squash seeds", { kcal: 559, p: 30, c: 11, f: 49 }))!;
  assert.equal(f.role, "snack");
  assert.deepEqual(f.slots, ["snack"]);
});

test("vegetables mentioning excluded seeds are not snacks", () => {
  const f = classifyFood(usda("Peppers, hot chili, red, canned, excluding seeds, solids and liquids", { kcal: 21, p: 0.9, c: 5, f: 0.1 }))!;
  assert.equal(f.role, "veg");
  assert.deepEqual(f.slots, ["lunch", "dinner"]);
});

test("seed flour is an ingredient, while chayote is a vegetable", () => {
  assert.equal(classifyFood(usda("Seeds, sesame flour", { kcal: 382, p: 40, c: 35, f: 12 })), null);
  const chayote = classifyFood(usda("Chayote, fruit, raw", { kcal: 19, p: 0.8, c: 4.5, f: 0.1 }))!;
  assert.equal(chayote.role, "veg");
  assert.deepEqual(chayote.slots, ["lunch", "dinner"]);
});

test("excludes supplement / dried / powdered forms (they'd dominate plans)", () => {
  assert.equal(classifyFood(usda("Soy protein, isolate", { kcal: 335, p: 81, c: 7, f: 4 })), null);
  assert.equal(classifyFood(usda("Beef, cured, dried", { kcal: 410, p: 33, c: 3, f: 30 })), null);
  assert.equal(classifyFood(usda("Egg, white, dried, powder", { kcal: 382, p: 81, c: 8, f: 0 })), null);
  assert.equal(classifyFood(usda("Beverages, whey protein powder isolate", { kcal: 359, p: 80, c: 8, f: 1 })), null);
  assert.equal(classifyFood(usda("Wheat germ, crude", { kcal: 360, p: 23, c: 52, f: 10 })), null);
  assert.equal(classifyFood(usda("Seeds, cottonseed meal", { kcal: 367, p: 50, c: 30, f: 5 })), null);
});

test("excludes snack-bar / chips / defatted-meal junk", () => {
  assert.equal(classifyFood(usda("Formulated bar, high protein", { kcal: 400, p: 30, c: 40, f: 12 })), null);
  assert.equal(classifyFood(usda("Snacks, potato chips, salted", { kcal: 536, p: 7, c: 53, f: 35 })), null);
  assert.equal(classifyFood(usda("Soy meal, defatted, raw", { kcal: 337, p: 49, c: 34, f: 3 })), null);
});

test("excludes packaged sweets/crackers even when they mention nuts or fruit", () => {
  assert.equal(classifyFood(usda("Candies, fudge, peanut butter", { kcal: 450, p: 8, c: 60, f: 20 })), null);
  assert.equal(classifyFood(usda("Crackers, snack, cheese", { kcal: 480, p: 9, c: 65, f: 18 })), null);
  assert.equal(classifyFood(usda("Pie, Dutch Apple, Commercially Prepared", { kcal: 290, p: 2, c: 40, f: 13 })), null);
  assert.equal(classifyFood(usda("Rice and vermicelli mix, rice pilaf flavor, prepared", { kcal: 130, p: 3, c: 25, f: 2 })), null);
  assert.equal(classifyFood(usda("Millet, puffed", { kcal: 354, p: 13, c: 80, f: 3 })), null);
});

test("keeps standalone nuts and nut butters despite oil/butter words", () => {
  assert.ok(classifyFood(usda("Nuts, almonds, oil roasted, with salt added", { kcal: 607, p: 21, c: 20, f: 55 })));
  assert.ok(classifyFood(usda("Peanut butter, smooth style", { kcal: 588, p: 25, c: 20, f: 50 })));
});

test("excludes branded/restaurant rows from the automatic plan pool", () => {
  assert.equal(classifyFood(usda("Pillsbury Golden Layer Buttermilk Biscuits, refrigerated dough", { kcal: 330, p: 6, c: 44, f: 15 })), null);
  assert.equal(classifyFood(usda("Restaurant, Chinese, shrimp and vegetables", { kcal: 120, p: 9, c: 10, f: 4 })), null);
  assert.equal(classifyFood(usda("Vitasoy USA Nasoya, Lite Silken Tofu", { kcal: 55, p: 7, c: 2, f: 2 })), null);
  assert.equal(classifyFood(usda("Spaghetti, protein-fortified", { kcal: 164, p: 8, c: 31, f: 1 })), null);
  assert.equal(classifyFood(usda("Cereals, QUAKER, oatmeal, instant", { kcal: 370, p: 12, c: 68, f: 6 })), null);
});

test("shellfish and mollusks are non-veg and tagged as fish", () => {
  const f = classifyFood(usda("Mollusks, cuttlefish, mixed species, cooked, moist heat", { kcal: 158, p: 32, c: 1, f: 1.4 }))!;
  assert.ok(f, "cooked shellfish can be classified for omnivore plans");
  assert.equal(f.vegetarian, false);
  assert.ok(f.tags.includes("fish"));
});

test("common low-calorie cooked vegetables are kept", () => {
  const cabbage = classifyFood(usda("Cabbage, common, cooked, boiled, drained, without salt", { kcal: 23, p: 1.3, c: 5.5, f: 0.1 }))!;
  assert.equal(cabbage.role, "veg");
  const squash = classifyFood(usda("Squash, summer, cooked, boiled, drained, without salt", { kcal: 19, p: 0.9, c: 4.8, f: 0.1 }))!;
  assert.equal(squash.role, "veg");
});

test("mustard greens are kept but mustard condiment is excluded", () => {
  assert.equal(classifyFood(usda("Mustard, prepared, yellow", { kcal: 66, p: 4, c: 6, f: 4 })), null);
  const greens = classifyFood(usda("Mustard spinach, cooked, boiled, drained, without salt", { kcal: 22, p: 2.1, c: 3.9, f: 0.2 }))!;
  assert.equal(greens.role, "veg");
});

test("excludes beverages, juice, soups, processed meats, and offal", () => {
  assert.equal(classifyFood(usda("Beverages, orange juice drink", { kcal: 54, p: 0, c: 13, f: 0 })), null);
  assert.equal(classifyFood(usda("Soup, clam chowder, canned, condensed", { kcal: 72, p: 3, c: 10, f: 2 })), null);
  assert.equal(classifyFood(usda("Frankfurter, beef", { kcal: 290, p: 11, c: 2, f: 26 })), null);
  assert.equal(classifyFood(usda("Beef, variety meats and by-products, liver, cooked", { kcal: 191, p: 29, c: 5, f: 5 })), null);
});

test("excludes ALL-CAPS branded entries", () => {
  assert.equal(classifyFood(usda("WENDY'S, CLASSIC SINGLE Hamburger, no cheese", { kcal: 250, p: 15, c: 20, f: 12 })), null);
  // generic USDA (normal case) is kept
  assert.ok(classifyFood(usda("Chicken, breast, cooked", { kcal: 165, p: 31, c: 0, f: 3.6 })));
});

test("canned tuna in water → protein kept (the 'water' false-exclude is fixed)", () => {
  const f = classifyFood(usda("Fish, tuna, light, canned in water, drained solids", { kcal: 116, p: 26, c: 0, f: 0.8 }))!;
  assert.ok(f, "tuna in water should be kept");
  assert.equal(f.role, "protein");
  assert.ok(f.tags.includes("fish"));
});

test("processed meats (meatballs) → protein", () => {
  const f = classifyFood(usda("Meatballs, meatless", { kcal: 197, p: 18, c: 8, f: 11 }));
  // "meatless" still contains "meat" → protein (vegetarian flag handles the rest).
  assert.equal(f?.role, "protein");
});

test("game & processed meats are non-veg (never leak into a vegetarian plan)", () => {
  for (const n of ["Elk, free range, top sirloin", "Game meat, bison, ground", "Beef patty, cooked", "Chicken nuggets"]) {
    const f = classifyFood(usda(n, { kcal: 200, p: 25, c: 2, f: 10 }));
    if (f) assert.equal(f.vegetarian, false, `${n} should be non-veg`);
  }
});

test("avocado → fruit", () => {
  const f = classifyFood(usda("Avocados, raw, all commercial varieties", { kcal: 160, p: 2, c: 9, f: 15 }))!;
  assert.equal(f.role, "fruit");
  assert.equal(f.vegetarian, true);
});

test("unclassifiable rows are excluded", () => {
  assert.equal(classifyFood(usda("Restaurant, latino, arroz con grandules", { kcal: 150, p: 4, c: 25, f: 4 })), null);
});
