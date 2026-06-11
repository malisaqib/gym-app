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
