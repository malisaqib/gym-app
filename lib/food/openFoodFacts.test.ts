import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOffProduct } from "./openFoodFacts.ts";

const off = (product: Record<string, unknown>, status = 1) => ({ status, product });

test("parses a found product and scales to the serving", () => {
  const f = parseOffProduct(
    "0123456789012",
    off({
      product_name: "Peanut Butter",
      brands: "Acme, Other",
      serving_size: "32 g",
      serving_quantity: 32,
      nutriments: { "energy-kcal_100g": 588, proteins_100g: 25, carbohydrates_100g: 20, fat_100g: 50 },
    })
  )!;
  assert.ok(f, "should parse");
  assert.equal(f.name, "Peanut Butter (Acme)"); // first brand only, appended
  assert.equal(f.brand, "Acme");
  assert.deepEqual(f.per100, { calories: 588, protein: 25, carbs: 20, fat: 50 });
  assert.equal(f.portionGrams, 32);
  assert.equal(f.calories, Math.round(588 * 0.32));
  assert.equal(f.protein, Math.round(25 * 0.32));
});

test("does not append a duplicate brand already present in the name", () => {
  const f = parseOffProduct(
    "3017620422003",
    off({
      product_name: "Nutella",
      brands: "Nutella",
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    })
  )!;
  assert.equal(f.name, "Nutella");
});

test("no serving uses the per-100g portion", () => {
  const f = parseOffProduct("1", off({ product_name: "Lentils", nutriments: { "energy-kcal_100g": 116, proteins_100g: 9, carbohydrates_100g: 20, fat_100g: 0.4 } }))!;
  assert.equal(f.portion, "100 g");
  assert.equal(f.portionGrams, 100);
  assert.equal(f.calories, 116);
});

test("converts kJ energy when kcal is absent", () => {
  const f = parseOffProduct("1", off({ product_name: "Cereal", nutriments: { energy_100g: 2460, proteins_100g: 8, carbohydrates_100g: 80, fat_100g: 2 } }))!;
  assert.equal(f.per100.calories, Math.round(2460 / 4.184));
});

test("not found (status 0) returns null", () => {
  assert.equal(parseOffProduct("1", off({}, 0)), null);
  assert.equal(parseOffProduct("1", { status: 0 }), null);
});

test("low-quality rows are rejected (no energy, incomplete macros, or no name)", () => {
  assert.equal(parseOffProduct("1", off({ product_name: "Mystery", nutriments: {} })), null); // no energy
  assert.equal(parseOffProduct("1", off({ product_name: "Mystery", nutriments: { "energy-kcal_100g": 200, proteins_100g: 5 } })), null); // incomplete macros
  assert.equal(parseOffProduct("1", off({ nutriments: { "energy-kcal_100g": 200, proteins_100g: 5 } })), null); // no name
});
