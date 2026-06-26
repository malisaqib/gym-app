import { test } from "node:test";
import assert from "node:assert/strict";
import { groundParsedFoodItems, needsPerItemGrounding, regroundUnmatchedItems } from "./grounding.ts";
import { foodSearchScore } from "./searchRank.ts";
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

test("grounds egg whites to the verified catalog, overriding a wrong LLM estimate", () => {
  // The model used to guess ~40 kcal / 8 g per egg white (≈double reality). A
  // strong catalog match must override that estimate with the USDA-backed value.
  const [item] = groundParsedFoodItems([
    parsed({ food_name: "egg whites", quantity: 3, unit: "egg", calories: 120, protein_g: 24 }),
  ]);

  assert.equal(item.matched_food_id, "catalog:egg_white");
  assert.equal(item.nutrition_source, "verified");
  assert.equal(item.calories, 51); // 3 × 17, overriding the 120 estimate
  assert.equal(item.protein_g, 11); // 3 × 3.6 → 10.8 → 11, overriding 24
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

// --- Fix: a WEAK match must not be promoted to verified/imported just because
// the model returned missing (0) macros. Only score >= 80 may adopt DB macros on
// a missing-nutrition item; strong matches (>= 90) are unaffected. The crafted
// candidates use nonsense tokens so nothing in the trusted catalog outscores
// them, and each test asserts its own score band (score field zeroed to match
// grounding, which ignores the candidate's retrieval score).

test("missing nutrition + WEAK match (score < 80) stays an estimate, not a DB match", () => {
  const candidate = dbFood({
    name: "Zorba blarg stew",
    source: "user_estimate", // estimated quality → +10, so an all-tokens match = 70
    score: 0,
    calories: 999, // must NOT be adopted
    protein_g: 99,
  });
  const query = "blarg zorba"; // tokens out of order → all-tokens (not prefix) match
  const band = foodSearchScore(query, candidate);
  assert.ok(band >= 70 && band < 80, `fixture must be a weak 70-79 match, got ${band}`);

  const [item] = groundParsedFoodItems(
    [parsed({ food_name: query, quantity: 100, unit: "g" })], // 0 kcal from the model (missing)
    { candidates: [candidate] }
  );
  // The fix: a weak match is NOT promoted on missing macros.
  assert.equal(item.matched_food_id, undefined);
  assert.equal(item.nutrition_source, undefined); // → defaults to "estimated" at insert
  assert.equal(item.calories, 0); // the candidate's 999 was NOT adopted
});

test("missing nutrition + MEDIUM match (score >= 80) adopts the DB macros", () => {
  const candidate = dbFood({
    name: "Zorba blarg stew",
    source: "usda_sr", // imported
    score: 0,
    portion: "100g",
    portion_grams: 100,
    calories: 140,
    protein_g: 20,
  });
  const query = "zorba blarg"; // prefix of the name → startsWith match = 85
  const band = foodSearchScore(query, candidate);
  assert.ok(band >= 80 && band < 90, `fixture must be an 80-89 match, got ${band}`);

  const [item] = groundParsedFoodItems(
    [parsed({ food_name: query, quantity: 100, unit: "g" })], // 0 kcal (missing)
    { candidates: [candidate] }
  );
  assert.equal(item.matched_food_id, "db:00000000-0000-0000-0000-000000000001");
  assert.equal(item.nutrition_source, "imported");
  assert.equal(item.calories, 140); // adopted from the DB row (scaled ×1)
  assert.equal(item.protein_g, 20);
});

test("strong match (score >= 90) still overrides the model's macros, as before", () => {
  const candidate = dbFood({
    name: "Zorba blarg stew",
    source: "usda_sr",
    score: 0,
    portion: "100g",
    portion_grams: 100,
    calories: 140,
    protein_g: 20,
  });
  const query = "zorba blarg stew"; // exact name → strong match (>= 90)
  assert.ok(foodSearchScore(query, candidate) >= 90, "fixture must be a strong >=90 match");

  const [item] = groundParsedFoodItems(
    [parsed({ food_name: query, quantity: 100, unit: "g", calories: 500, protein_g: 5 })], // model HAS macros
    { candidates: [candidate] }
  );
  // A strong match is authoritative regardless of the model's numbers.
  assert.equal(item.matched_food_id, "db:00000000-0000-0000-0000-000000000001");
  assert.equal(item.nutrition_source, "imported");
  assert.equal(item.calories, 140);
  assert.equal(item.protein_g, 20);
});

test("count units against a weight portion scale by servings, not by the gram number", () => {
  // The 6-kcal beef-kebab bug: "3 pieces" vs a "100g" portion used to compute
  // 3 ÷ 100 = 0.03 servings. A weight portion is ONE serving → scale = 3.
  const [item] = groundParsedFoodItems(
    [parsed({ food_name: "grilled beef steak", quantity: 3, unit: "pieces" })], // 0 kcal from the model
    {
      candidates: [
        dbFood({ name: "Grilled beef steak", portion: "100g", portion_grams: 100, calories: 196, protein_g: 28 }),
      ],
    }
  );
  assert.equal(item.calories, 196 * 3);
  assert.equal(item.protein_g, 28 * 3);
});

test("a steak candidate does not match 'beef kebab' without the fake query alias", () => {
  const [item] = groundParsedFoodItems(
    [parsed({ food_name: "beef kebab", quantity: 3, unit: "pieces", calories: 360, protein_g: 24 })],
    {
      candidates: [
        dbFood({
          name: "Beef, shoulder top blade steak, boneless, cooked, grilled",
          portion: "100g",
          portion_grams: 100,
          calories: 196,
          protein_g: 28,
        }),
      ],
    }
  );
  // The LLM's own estimate stands; the steak must NOT hijack the kebab.
  assert.equal(item.calories, 360);
  assert.equal(item.matched_food_id, undefined);
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

// --- Phase 7B: bare base words ground to the plain food, not a compound one ---

test("free-text 'banana' grounds to the plain Banana (not Banana shake)", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "banana" })]);
  assert.equal(item.matched_food_id, "catalog:banana");
  assert.equal(item.calories, 105); // plain banana, NOT the 250 kcal shake
  assert.equal(item.nutrition_source, "verified");
});

test("free-text 'banana shake' still grounds to Banana shake", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "banana shake" })]);
  assert.equal(item.matched_food_id, "catalog:banana_shake");
  assert.equal(item.calories, 250);
});

test("free-text 'chana' grounds to plain Chana (not Chana chaat)", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "chana" })]);
  assert.equal(item.matched_food_id, "catalog:chana");
  assert.equal(item.nutrition_source, "verified");
});

test("free-text 'chana chaat' still grounds to Chana chaat", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "chana chaat" })]);
  assert.equal(item.matched_food_id, "catalog:chana_chaat");
});

test("free-text 'oats' grounds to Oatmeal via the new alias", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "oats" })]);
  assert.equal(item.matched_food_id, "catalog:oats");
  assert.equal(item.nutrition_source, "verified");
});

test("free-text '2 anday' grounds to the verified 2-eggs catalog item", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "anday", quantity: 2, unit: "egg" })]);
  assert.equal(item.matched_food_id, "catalog:eggs2");
  assert.equal(item.calories, 160);
  assert.equal(item.protein_g, 12);
  assert.equal(item.nutrition_source, "verified");
});

test("bare gram-anchored serving labels ground as one serving, not a fractional count", () => {
  const [peanutButter] = groundParsedFoodItems([parsed({ food_name: "peanut butter" })]);
  assert.equal(peanutButter.matched_food_id, "catalog:peanut_butter");
  assert.equal(peanutButter.calories, 190);
  assert.equal(peanutButter.protein_g, 7);

  const [avocado] = groundParsedFoodItems([parsed({ food_name: "avocado" })]);
  assert.equal(avocado.matched_food_id, "catalog:avocado");
  assert.equal(avocado.calories, 160);
  assert.equal(avocado.protein_g, 2);
});

test("free-text 'cottage cheese' does not ground to paneer", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "cottage cheese" })]);
  assert.ok(item.matched_food_id !== "catalog:paneer", `grounded to paneer: ${item.matched_food_id}`);
});

test("a bare unknown word is still left as an estimate (no over-trust)", () => {
  const [item] = groundParsedFoodItems([parsed({ food_name: "zorbatron", calories: 42 })]);
  assert.equal(item.matched_food_id, undefined);
  assert.equal(item.calories, 42);
});
