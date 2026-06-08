import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveQuantity, itemMacros, totalsFor } from "./quantity.ts";

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
