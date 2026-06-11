import { test } from "node:test";
import assert from "node:assert/strict";
import { groundParsedFoodItems, needsPerItemGrounding, regroundUnmatchedItems } from "./grounding.ts";
import type { ParsedFoodItem } from "./parse.ts";
import type { RetrievedFood } from "./retrieve.ts";

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

// --- step 4: per-item retrieval ---------------------------------------------

const dbFood = (patch: Partial<RetrievedFood>): RetrievedFood => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "food",
  aliases: [],
  region: "global",
  portion: "100g",
  portion_grams: 100,
  calories: 100,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 2,
  source: "usda_sr",
  score: 0.5,
  ...patch,
});

test("needsPerItemGrounding: only unmatched items qualify", () => {
  assert.equal(needsPerItemGrounding(parsed({ food_name: "x" })), true);
  assert.equal(needsPerItemGrounding(parsed({ food_name: "x", matched_food_id: "catalog:rice" })), false);
});

test("regroundUnmatchedItems retrieves per item and grounds against its own candidates", async () => {
  const queries: string[] = [];
  const retrieve = async (query: string): Promise<RetrievedFood[]> => {
    queries.push(query);
    if (query === "grilled fish") {
      return [dbFood({ name: "Grilled fish", portion: "1 piece (~120g)", portion_grams: 120, calories: 230, protein_g: 25 })];
    }
    return [];
  };

  const matched = parsed({ food_name: "daal", matched_food_id: "catalog:daal", calories: 150 });
  const missing = parsed({ food_name: "grilled fish", quantity: 1, unit: "piece" }); // 0 kcal from the model
  const unknown = parsed({ food_name: "mystery sauce", calories: 42 });

  const out = await regroundUnmatchedItems([matched, missing, unknown], retrieve);

  // Already-matched items are never re-retrieved.
  assert.deepEqual(queries.sort(), ["grilled fish", "mystery sauce"]);
  assert.equal(out[0], matched);
  // The missing-nutrition item is repaired from its own candidate pool.
  assert.equal(out[1].calories, 230);
  assert.equal(out[1].protein_g, 25);
  assert.equal(out[1].matched_food_id, "db:00000000-0000-0000-0000-000000000001");
  assert.equal(out[1].nutrition_source, "imported");
  // Still-unmatched items keep their model estimate.
  assert.equal(out[2].calories, 42);
  assert.equal(out[2].matched_food_id, undefined);
});

test("regroundUnmatchedItems survives retrieval failures", async () => {
  const failing = async (): Promise<RetrievedFood[]> => {
    throw new Error("embeddings down");
  };
  const item = parsed({ food_name: "grilled fish", calories: 200 });
  const out = await regroundUnmatchedItems([item], failing);
  assert.equal(out[0].calories, 200);
  assert.equal(out[0].matched_food_id, undefined);
});
