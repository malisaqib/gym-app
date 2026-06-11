import { test } from "node:test";
import assert from "node:assert/strict";
import { sumMacros, remaining, percent } from "./totals.ts";
import { itemMacros } from "./quantity.ts";

test("sumMacros adds up each macro across items", () => {
  const total = sumMacros([
    { calories: 110, protein_g: 3, carbs_g: 22, fat_g: 2 },
    { calories: 150, protein_g: 9, carbs_g: 22, fat_g: 3 },
  ]);
  assert.deepEqual(total, { calories: 260, protein_g: 12, carbs_g: 44, fat_g: 5 });
});

test("sumMacros of an empty day is all zeros", () => {
  assert.deepEqual(sumMacros([]), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
});

test("remaining is target minus eaten, and can go negative when over", () => {
  assert.equal(remaining(2000, 1500), 500);
  assert.equal(remaining(2000, 2300), -300);
});

test("percent is clamped to 100 and safe when target is 0", () => {
  assert.equal(percent(1000, 2000), 50);
  assert.equal(percent(2500, 2000), 100); // clamped
  assert.equal(percent(500, 0), 0); // no divide-by-zero
});

// F1 — the architecture's "no frozen stored number" rule. The coach
// (app/coach/actions.ts) and the dashboard rings (FoodLogger) MUST both compute
// the day via sumMacros(rows.map(itemMacros)) — live base × amount — so a
// desynced stored-totals cache can never make them disagree.
test("daily totals come from live base×amount, never the stored cache (coach = dashboard)", () => {
  const rows = [
    {
      // Stored cache is deliberately WRONG (says 999 kcal); the live truth is
      // 1.65/g × 200 g = 330 kcal. A correct reader must report 330.
      calories: 999,
      protein_g: 99,
      carbs_g: 50,
      fat_g: 40,
      base_calories: 1.65,
      base_protein_g: 0.31,
      base_carbs_g: 0,
      base_fat_g: 0.04,
      amount: 200,
    },
    {
      // 3 eggs at 80 kcal / 6 g protein per egg; cache also stale.
      calories: 1,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
      base_calories: 80,
      base_protein_g: 6,
      base_carbs_g: 0.5,
      base_fat_g: 5.5,
      amount: 3,
    },
  ];

  const live = sumMacros(rows.map(itemMacros)); // the one true day total
  assert.equal(live.calories, 330 + 240);
  assert.equal(live.protein_g, 62 + 18);

  // Loud failure mode: summing raw rows (the stale cache) gives garbage — this
  // is exactly what the coach used to do and must never do again.
  const stale = sumMacros(rows);
  assert.notEqual(stale.calories, live.calories);

  // Legacy rows (no base/amount yet) still fall back to their stored totals,
  // so old data keeps working through the same path.
  const legacy = [{ calories: 300, protein_g: 20, carbs_g: 10, fat_g: 5 }];
  assert.deepEqual(sumMacros(legacy.map(itemMacros)), {
    calories: 300,
    protein_g: 20,
    carbs_g: 10,
    fat_g: 5,
  });
});
