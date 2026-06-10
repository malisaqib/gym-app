import { test } from "node:test";
import assert from "node:assert/strict";
import { groundParsedFoodItems } from "./grounding.ts";
import type { ParsedFoodItem } from "./parse.ts";

const parsed = (patch: Partial<ParsedFoodItem>): ParsedFoodItem => ({
  food_name: "food",
  quantity: 1,
  unit: "",
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...patch,
});

test("grounds cold coffee grams to the trusted catalog serving", () => {
  const [item] = groundParsedFoodItems([
    parsed({ food_name: "cold coffee shake", quantity: 250, unit: "g" }),
  ]);

  assert.equal(item.calories, 220);
  assert.equal(item.protein_g, 7);
  assert.equal(item.carbs_g, 32);
  assert.equal(item.fat_g, 7);
  assert.equal(item.matched_food_id, "catalog:cold_coffee");
  assert.equal(item.nutrition_source, "verified");
  assert.ok((item.match_confidence ?? 0) >= 0.9);
});

test("uses the raw single-item text as a fallback match", () => {
  const [item] = groundParsedFoodItems(
    [parsed({ food_name: "shake", quantity: 250, unit: "g" })],
    { rawText: "cold coffee" }
  );

  assert.equal(item.calories, 220);
  assert.equal(item.protein_g, 7);
  assert.equal(item.matched_food_id, "catalog:cold_coffee");
  assert.equal(item.nutrition_source, "verified");
});

test("scales trusted foods by logged grams", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "rice", quantity: 100, unit: "g" })]);

  assert.equal(item.calories, 133);
  assert.equal(item.protein_g, 3);
  assert.equal(item.matched_food_id, "catalog:rice");
  assert.equal(item.nutrition_source, "verified");
});

test("leaves unknown foods unchanged", () => {
  const [item] = groundParsedFoodItems([
    parsed({ food_name: "mystery preworkout sauce", quantity: 1, unit: "serving", calories: 42 }),
  ]);

  assert.equal(item.calories, 42);
  assert.equal(item.protein_g, 0);
  assert.equal(item.matched_food_id, undefined);
  assert.equal(item.nutrition_source, undefined);
});
