import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveQuantity,
  itemMacros,
  totalsFor,
  explicitQuantityFromText,
  enforceExplicitQuantity,
  enforcePerItemQuantities,
  correctedMacroPatch,
  sanitizeParsedMacros,
  specFromFoodRow,
  logQuantityForFoodRow,
  MAX_AMOUNT_GRAMS,
  MAX_AMOUNT_UNITS,
} from "./quantity.ts";

test("countable: '3 eggs' → per-unit base, total recomputes by amount", () => {
  const spec = deriveQuantity({ quantity: 3, unit: "egg", calories: 240, protein_g: 30, carbs_g: 6, fat_g: 15 });
  assert.equal(spec.unit_mode, "count");
  assert.equal(spec.amount, 3);
  assert.equal(spec.base_calories, 80);
  assert.equal(spec.base_protein_g, 10);
  // total at logged amount = original
  assert.deepEqual(totalsFor(spec), { calories: 240, protein_g: 30, carbs_g: 6, fat_g: 15 });
  // change to 1 egg → 80 / 10
  const one = itemMacros({ ...zero, base_calories: spec.base_calories, base_protein_g: spec.base_protein_g, base_carbs_g: spec.base_carbs_g, base_fat_g: spec.base_fat_g, amount: 1 });
  assert.equal(one.calories, 80);
  assert.equal(one.protein_g, 10);
});

test("portion (grams): '100g chicken' → per-gram base, halving halves macros", () => {
  const spec = deriveQuantity({ quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 });
  assert.equal(spec.unit_mode, "portion");
  assert.equal(spec.unit, "g");
  assert.equal(spec.amount, 100);
  assert.equal(spec.serving_grams, 100);
  assert.deepEqual(totalsFor(spec), { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 });
  // 50g → ~halved
  const half = itemMacros({ ...zero, base_calories: spec.base_calories, base_protein_g: spec.base_protein_g, base_carbs_g: spec.base_carbs_g, base_fat_g: spec.base_fat_g, amount: 50 });
  assert.equal(half.calories, 83); // round(1.65 * 50)
  assert.equal(half.protein_g, 16); // round(0.31 * 50)
});

test("portion (serving word): '1 plate biryani' → grams via serving table, multiplier works", () => {
  const spec = deriveQuantity({ quantity: 1, unit: "plate", calories: 550, protein_g: 22, carbs_g: 65, fat_g: 22 });
  assert.equal(spec.unit_mode, "portion");
  assert.equal(spec.serving_grams, 350);
  assert.equal(spec.amount, 350);
  assert.deepEqual(totalsFor(spec), { calories: 550, protein_g: 22, carbs_g: 65, fat_g: 22 });
  // 0.5× serving = 175g → ~half
  const half = itemMacros({ ...zero, base_calories: spec.base_calories, base_protein_g: spec.base_protein_g, base_carbs_g: spec.base_carbs_g, base_fat_g: spec.base_fat_g, amount: 175 });
  assert.equal(half.calories, 275);
});

test("portion (fractional serving): 'half plate biryani' anchors to a full serving", () => {
  const spec = deriveQuantity({ quantity: 0.5, unit: "plate", calories: 275, protein_g: 11, carbs_g: 33, fat_g: 11 });
  assert.equal(spec.unit_mode, "portion");
  assert.equal(spec.serving_grams, 350); // base serving stays a full plate
  assert.equal(spec.amount, 175); // logged amount is half
  assert.deepEqual(totalsFor(spec), { calories: 275, protein_g: 11, carbs_g: 33, fat_g: 11 });
});

test("bare/unknown unit defaults to a countable stepper", () => {
  const spec = deriveQuantity({ quantity: 1, unit: "", calories: 105, protein_g: 1, carbs_g: 27, fat_g: 0 });
  assert.equal(spec.unit_mode, "count");
  assert.equal(spec.amount, 1);
  assert.equal(spec.base_calories, 105);
});

test("itemMacros falls back to stored totals when base columns are absent (legacy)", () => {
  const legacy = { calories: 300, protein_g: 20, carbs_g: 10, fat_g: 5 }; // no base_*/amount
  assert.deepEqual(itemMacros(legacy), { calories: 300, protein_g: 20, carbs_g: 10, fat_g: 5 });
});

test("backfill semantics: base = total, amount = 1 → exact original total", () => {
  const row = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, base_calories: 300, base_protein_g: 20, base_carbs_g: 40, base_fat_g: 9, amount: 1 };
  assert.deepEqual(itemMacros(row), { calories: 300, protein_g: 20, carbs_g: 40, fat_g: 9 });
});

const zero = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

// --- explicit quantity guard (the "chicken 200gms -> 100g" regression) -------

test("explicitQuantityFromText: weights, serving words, counts, kg/l scaling", () => {
  assert.deepEqual(explicitQuantityFromText("chicken 200gms"), { quantity: 200, unit: "g" });
  assert.deepEqual(explicitQuantityFromText("300gm chicken"), { quantity: 300, unit: "g" });
  assert.deepEqual(explicitQuantityFromText("250 ml milk"), { quantity: 250, unit: "g" });
  assert.deepEqual(explicitQuantityFromText("1 kg rice"), { quantity: 1000, unit: "g" });
  assert.deepEqual(explicitQuantityFromText("1 glass mango shake"), { quantity: 1, unit: "glass" });
  assert.deepEqual(explicitQuantityFromText("2 roti"), { quantity: 2, unit: "roti" });
  assert.deepEqual(explicitQuantityFromText("3 eggs"), { quantity: 3, unit: "egg" });
  assert.deepEqual(explicitQuantityFromText("2 anday"), { quantity: 2, unit: "egg" });
  assert.equal(explicitQuantityFromText("chicken handi"), null); // no explicit amount
});

test("enforceExplicitQuantity: user's 200g wins over the model's 100g, macros rescaled", () => {
  // Model anchored to a 100g candidate and dropped the user's "200gms".
  const item = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const fixed = enforceExplicitQuantity(item, { quantity: 200, unit: "g" });
  assert.equal(fixed.quantity, 200);
  assert.equal(fixed.unit, "g");
  assert.equal(fixed.calories, 330);
  assert.equal(fixed.protein_g, 62);
  assert.equal(fixed.food_name, "chicken"); // unrelated fields preserved
});

test("enforceExplicitQuantity: incomparable units (grams vs count) keep the model's parse", () => {
  const item = { quantity: 1, unit: "serving", calories: 200, protein_g: 10, carbs_g: 5, fat_g: 8 };
  // serving -> grams is known (200g), so 100g rescales: scale 0.5
  assert.equal(enforceExplicitQuantity(item, { quantity: 100, unit: "g" }).calories, 100);
  // egg count vs grams is NOT comparable → unchanged
  const eggish = { quantity: 2, unit: "egg", calories: 160, protein_g: 12, carbs_g: 1, fat_g: 11 };
  assert.deepEqual(enforceExplicitQuantity(eggish, { quantity: 250, unit: "g" }), eggish);
});

// F3 — explicit quantities are enforced PER ITEM in multi-item logs, bound by
// the text segment that mentions each food; ambiguity trusts the model.
test("F3: '200g chicken and 2 roti' enforces both items' typed amounts", () => {
  const chicken = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const roti = { food_name: "roti", quantity: 1, unit: "roti", calories: 110, protein_g: 3, carbs_g: 22, fat_g: 2 };

  const [c, r] = enforcePerItemQuantities([chicken, roti], "200g chicken and 2 roti");
  // chicken: the model anchored to 100g; the user said 200g → rescaled ×2.
  assert.equal(c.quantity, 200);
  assert.equal(c.unit, "g");
  assert.equal(c.calories, 330);
  assert.equal(c.protein_g, 62);
  // roti: the model said 1; the user said 2 → doubled.
  assert.equal(r.quantity, 2);
  assert.equal(r.calories, 220);
  assert.equal(r.protein_g, 6);
});

test("F3: ambiguous segments never cross-assign amounts (model parse kept)", () => {
  const a = { food_name: "chicken", quantity: 1, unit: "serving", calories: 200, protein_g: 25, carbs_g: 0, fat_g: 8 };
  const b = { food_name: "chicken curry", quantity: 1, unit: "serving", calories: 300, protein_g: 20, carbs_g: 10, fat_g: 18 };
  // Both items' tokens hit both segments ("chicken" appears in each) → ambiguous
  // for both → neither is touched, even though "200g" sits in one segment.
  const out = enforcePerItemQuantities([a, b], "chicken and chicken curry 200g");
  assert.deepEqual(out[0], a);
  assert.deepEqual(out[1], b);
});

test("F3: single-item logs still use the whole text (old behavior preserved)", () => {
  const item = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const [out] = enforcePerItemQuantities([item], "chicken 200gms");
  assert.equal(out.quantity, 200);
  assert.equal(out.calories, 330);
});

// F2 — a manual calories/protein correction rescales carbs/fat by the calorie
// ratio (energy consistency) and rebases EVERY per-unit base at the current
// amount so the correction still scales with later quantity edits.
test("F2: correctedMacroPatch halves carbs/fat when calories are halved", () => {
  const row = {
    calories: 500, protein_g: 30, carbs_g: 60, fat_g: 15,
    base_calories: 2.5, base_protein_g: 0.15, base_carbs_g: 0.3, base_fat_g: 0.075,
    amount: 200,
  };
  const p = correctedMacroPatch(row, { calories: 250, protein_g: 30 });
  assert.equal(p.calories, 250);
  assert.equal(p.protein_g, 30);
  assert.equal(p.carbs_g, 30); // 60 × (250/500)
  assert.equal(p.fat_g, 8); // round(15 × 0.5)
  // Bases reproduce the entered totals at the current amount (200).
  assert.equal(Math.round(p.base_calories * 200), 250);
  assert.equal(Math.round(p.base_carbs_g * 200), 30);
});

test("F2: zero-calorie old item leaves carbs/fat untouched (no ratio to scale by)", () => {
  const row = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, base_calories: 0, base_protein_g: 0, base_carbs_g: 0, base_fat_g: 0, amount: 1 };
  const p = correctedMacroPatch(row, { calories: 220, protein_g: 7 });
  assert.equal(p.calories, 220);
  assert.equal(p.protein_g, 7);
  assert.equal(p.carbs_g, 0);
  assert.equal(p.fat_g, 0);
  assert.equal(p.base_calories, 220); // amount 1 → base = total
});

// --- production hardening (audit R1–R4) + the user's acceptance case ---------

test("ACCEPTANCE: '200gms rice with 200gm chicken' logs both at exactly 200g", () => {
  // The model anchored both items to 100g candidates; the user typed 200g each.
  const rice = { food_name: "rice", quantity: 100, unit: "g", calories: 130, protein_g: 2, carbs_g: 28, fat_g: 0 };
  const chicken = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const [r, c] = enforcePerItemQuantities([rice, chicken], "200gms rice with 200gm chicken");
  assert.equal(r.quantity, 200);
  assert.equal(r.calories, 260);
  assert.equal(r.protein_g, 4);
  assert.equal(c.quantity, 200);
  assert.equal(c.calories, 330);
  assert.equal(c.protein_g, 62);
});

test("reference table: 100g identity, 50g half, 200g double, 1g, decimal 37.5g", () => {
  const per100 = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 };
  const at = (g: number) => enforceExplicitQuantity(per100, { quantity: g, unit: "g" });
  assert.equal(at(100).calories, 165); // identity
  assert.equal(at(50).calories, 83); // round(82.5)
  assert.equal(at(50).protein_g, 16); // round(15.5)
  assert.equal(at(200).calories, 330);
  assert.equal(at(200).protein_g, 62);
  assert.equal(at(1).calories, 2); // round(1.65)
  assert.equal(at(37.5).calories, 62); // round(61.875)
  assert.equal(at(37.5).protein_g, 12); // round(11.625)
});

test("no double scaling: enforcing the same text twice is a no-op the second time", () => {
  const item = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const once = enforcePerItemQuantities([item], "chicken 200gms")[0];
  const twice = enforcePerItemQuantities([once], "chicken 200gms")[0];
  assert.deepEqual(twice, once);
});

test("ceilings: 20 kg clamps to MAX grams; 500 roti clamps to MAX units; NaN/Infinity rejected", () => {
  const item = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 };
  const huge = enforceExplicitQuantity(item, { quantity: 20000, unit: "g" });
  assert.equal(huge.quantity, MAX_AMOUNT_GRAMS);
  assert.equal(huge.calories, Math.round(165 * (MAX_AMOUNT_GRAMS / 100)));

  const roti = { food_name: "roti", quantity: 1, unit: "roti", calories: 110, protein_g: 3, carbs_g: 22, fat_g: 2 };
  const many = enforceExplicitQuantity(roti, { quantity: 500, unit: "roti" });
  assert.equal(many.quantity, MAX_AMOUNT_UNITS);

  assert.deepEqual(enforceExplicitQuantity(item, { quantity: Number.NaN, unit: "g" }), item);
  assert.deepEqual(enforceExplicitQuantity(item, { quantity: Number.POSITIVE_INFINITY, unit: "g" }), item);
  assert.deepEqual(enforceExplicitQuantity(item, { quantity: -50, unit: "g" }), item);

  // deriveQuantity caps the STORED amount too (any writer path).
  assert.equal(deriveQuantity({ quantity: 99999, unit: "g", calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1 }).amount, MAX_AMOUNT_GRAMS);
  assert.equal(deriveQuantity({ quantity: 9999, unit: "egg", calories: 80, protein_g: 6, carbs_g: 0, fat_g: 5 }).amount, MAX_AMOUNT_UNITS);
});

test("corrections are capped at sane ceilings", () => {
  const row = { calories: 300, protein_g: 20, carbs_g: 10, fat_g: 5, base_calories: 300, base_protein_g: 20, base_carbs_g: 10, base_fat_g: 5, amount: 1 };
  const p = correctedMacroPatch(row, { calories: 99999999, protein_g: 88888 });
  assert.equal(p.calories, 5000);
  assert.equal(p.protein_g, 1000);
});

test("sanitizeParsedMacros: impossible protein/energy is clamped; plausible foods untouched", () => {
  // 200 kcal cannot hold 90g protein (360 kcal of protein energy alone).
  const absurd = sanitizeParsedMacros({ food_name: "x", quantity: 100, unit: "g", calories: 200, protein_g: 90, carbs_g: 0, fat_g: 5 });
  assert.equal(absurd.protein_g, 50); // floor(200/4)

  // 150 kcal cannot hold 100g protein (400 kcal of protein energy).
  const energy = sanitizeParsedMacros({ food_name: "x", quantity: 1, unit: "serving", calories: 150, protein_g: 100, carbs_g: 0, fat_g: 0 });
  assert.equal(energy.protein_g, 37); // floor(150/4)

  // 100g of food cannot exceed 900 kcal (pure fat is 9 kcal/g).
  const dense = sanitizeParsedMacros({ food_name: "x", quantity: 100, unit: "g", calories: 2500, protein_g: 10, carbs_g: 10, fat_g: 90 });
  assert.equal(dense.calories, 900);

  // 0 kcal with real macros → calories derived from macros (no contradiction).
  const zero = sanitizeParsedMacros({ food_name: "x", quantity: 1, unit: "glass", calories: 0, protein_g: 7, carbs_g: 32, fat_g: 7 });
  assert.equal(zero.calories, 7 * 4 + 32 * 4 + 7 * 9);

  // NaN/negative inputs are zeroed, never propagated.
  const nan = sanitizeParsedMacros({ food_name: "x", quantity: 1, unit: "", calories: Number.NaN, protein_g: -5, carbs_g: 10, fat_g: 2 });
  assert.equal(nan.protein_g, 0);
  assert.equal(nan.calories, 10 * 4 + 2 * 9); // derived from surviving macros

  // Real foods pass through IDENTICAL (same object — no churn).
  const chicken = { food_name: "chicken", quantity: 100, unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 };
  assert.equal(sanitizeParsedMacros(chicken), chicken);
  const whey = { food_name: "whey", quantity: 1, unit: "scoop", calories: 120, protein_g: 24, carbs_g: 3, fat_g: 1 };
  assert.equal(sanitizeParsedMacros(whey), whey);
  const lassi = { food_name: "namkeen lassi", quantity: 1, unit: "glass", calories: 120, protein_g: 6, carbs_g: 8, fat_g: 5 };
  assert.equal(sanitizeParsedMacros(lassi), lassi);
});

test("sanitizeParsedMacros: an unmatched count-unit estimate is capped at the single-item max", () => {
  // No grams (unit "item"), no matched_food_id → 9 kcal/g can't apply, so cap at 1500.
  const big = sanitizeParsedMacros({
    food_name: "imaginary xyz curry", quantity: 1, unit: "item",
    calories: 4000, protein_g: 30, carbs_g: 50, fat_g: 20,
  });
  assert.equal(big.calories, 1500);
  // Atwater consistency still holds against the capped calories.
  assert.ok(big.protein_g * 4 <= big.calories + Math.max(15, big.calories * 0.05));

  // A 0-kcal unmatched count item whose macros imply > 1500 kcal is also capped.
  const derived = sanitizeParsedMacros({
    food_name: "mystery plate", quantity: 1, unit: "item",
    calories: 0, protein_g: 400, carbs_g: 0, fat_g: 0, // Atwater → 1600
  });
  assert.equal(derived.calories, 1500);
});

test("sanitizeParsedMacros: known grams/plate estimates keep the gram-based ceiling, not the count cap", () => {
  // "1 plate" = 350 g → ceiling 3150 (NOT the 1500 count cap), even unmatched.
  const plate = sanitizeParsedMacros({
    food_name: "huge biryani", quantity: 1, unit: "plate",
    calories: 5000, protein_g: 40, carbs_g: 60, fat_g: 30,
  });
  assert.equal(plate.calories, 3150); // 350 g × 9, the existing weight ceiling

  // grams stays gram-based: 100 g caps at 900, untouched by the count cap.
  const grams = sanitizeParsedMacros({
    food_name: "dense unknown", quantity: 100, unit: "g",
    calories: 4000, protein_g: 20, carbs_g: 20, fat_g: 30,
  });
  assert.equal(grams.calories, 900);
});

test("sanitizeParsedMacros: matched DB foods are never touched by the count cap", () => {
  // A matched count-unit food keeps its (DB-derived) macros, even above 1500.
  const matched = {
    food_name: "platter", quantity: 1, unit: "item",
    calories: 4000, protein_g: 30, carbs_g: 50, fat_g: 20,
    matched_food_id: "db:00000000-0000-0000-0000-000000000001",
  };
  assert.equal(sanitizeParsedMacros(matched), matched); // unchanged (same object)
});

test("specFromFoodRow: gram rows stay gram-based; leading counts become per-unit specs", () => {
  const chicken = specFromFoodRow({
    name: "Chicken breast",
    portion: "100g",
    portion_grams: 100,
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
  });
  assert.equal(chicken.unit_mode, "portion");
  assert.equal(chicken.amount, 100);
  // 50g = exactly half via base × amount.
  assert.equal(Math.round(chicken.base_calories * 50), 83);
  assert.equal(Math.round(chicken.base_protein_g * 50 * 10) / 10, 15.5);
  const loggedChicken = logQuantityForFoodRow({
    name: "Chicken breast",
    portion: "100g",
    portion_grams: 100,
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
  });
  assert.equal(loggedChicken.quantity, 1);
  assert.equal(loggedChicken.amount, 100);
  assert.equal(loggedChicken.logged_unit, "100g");

  const servingOnly = specFromFoodRow({
    name: "Cooked rice",
    portion: "1 serving",
    portion_grams: null,
    serving_grams: 150,
    calories: 195,
    protein_g: 4,
    carbs_g: 42,
    fat_g: 1,
  });
  assert.equal(servingOnly.unit_mode, "portion");
  assert.equal(servingOnly.amount, 150);
  assert.equal(servingOnly.serving_grams, 150);

  const eggs = specFromFoodRow({
    name: "2 eggs (boiled/fried)",
    portion: "2 eggs",
    portion_grams: null,
    calories: 160,
    protein_g: 12,
    carbs_g: 2,
    fat_g: 11,
  });
  assert.equal(eggs.unit_mode, "count");
  assert.equal(eggs.amount, 2);
  assert.equal(eggs.unit, "eggs");
  assert.equal(eggs.base_calories, 80);
  assert.equal(totalsFor(eggs).calories, 160);
  const loggedEggs = logQuantityForFoodRow({
    name: "2 eggs (boiled/fried)",
    portion: "2 eggs",
    portion_grams: null,
    calories: 160,
    protein_g: 12,
    carbs_g: 2,
    fat_g: 11,
  });
  assert.equal(loggedEggs.quantity, 2);
  assert.equal(loggedEggs.logged_unit, "eggs");

  const roti = specFromFoodRow({
    name: "2 roti",
    portion: "2 medium",
    portion_grams: null,
    calories: 220,
    protein_g: 6,
    carbs_g: 44,
    fat_g: 4,
  });
  assert.equal(roti.unit_mode, "count");
  assert.equal(roti.amount, 2);
  assert.equal(roti.unit, "roti");
  assert.equal(roti.base_calories, 110);
  assert.equal(totalsFor(roti).calories, 220);
  const loggedRoti = logQuantityForFoodRow({
    name: "2 roti",
    portion: "2 medium",
    portion_grams: null,
    calories: 220,
    protein_g: 6,
    carbs_g: 44,
    fat_g: 4,
  });
  assert.equal(loggedRoti.quantity, 2);
  assert.equal(loggedRoti.logged_unit, "roti");

  const noAnchor = specFromFoodRow({
    name: "Mixed meal",
    portion: "one serving",
    portion_grams: null,
    calories: 250,
    protein_g: 12,
    carbs_g: 30,
    fat_g: 9,
  });
  assert.equal(noAnchor.unit_mode, "count");
  assert.equal(noAnchor.amount, 1);
  assert.equal(noAnchor.base_calories, 250); // one full serving, NOT 1 gram
});
