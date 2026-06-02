import { test } from "node:test";
import assert from "node:assert/strict";
import { sumMacros, remaining, percent } from "./totals.ts";

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
