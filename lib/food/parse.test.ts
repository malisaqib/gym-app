import test from "node:test";
import assert from "node:assert/strict";
import { splitObviousFoodCombo } from "./comboSplit.ts";
import { groundParsedFoodItems } from "./grounding.ts";

const names = (text: string) => splitObviousFoodCombo(text)?.map((item) => item.food_name);
const qty = (text: string) => splitObviousFoodCombo(text)?.map((item) => [item.food_name, item.quantity, item.unit]);

test("obvious desi staple combos split into separate parser items", () => {
  assert.deepEqual(names("daal chawal"), ["daal", "rice"]);
  assert.deepEqual(names("rice daal"), ["rice", "daal"]);
  assert.deepEqual(names("roti anda"), ["roti", "anda"]);
  assert.deepEqual(names("roti and anda"), ["roti", "anda"]);
  assert.deepEqual(names("dahi banana"), ["dahi", "banana"]);
});

test("adjacent explicit quantities stay attached to their own food", () => {
  assert.deepEqual(qty("2 roti 2 eggs"), [
    ["roti", 2, "roti"],
    ["eggs", 2, "egg"],
  ]);
  assert.deepEqual(qty("1 roti 2 anday"), [
    ["roti", 1, "roti"],
    ["anday", 2, "egg"],
  ]);
});

test("simple chicken/rice phrases split unless they are a known compound dish", () => {
  assert.deepEqual(names("chicken rice"), ["chicken", "rice"]);
  assert.deepEqual(names("rice and chicken"), ["rice", "chicken"]);
  assert.equal(splitObviousFoodCombo("chicken biryani"), null);
});

test("named dishes and drinks remain intact for the existing parser", () => {
  for (const text of ["banana shake", "chana chaat", "fish curry", "cold coffee", "lassi"]) {
    assert.equal(splitObviousFoodCombo(text), null, text);
  }
});

test("ambiguous serving phrases stay on the existing parser path", () => {
  assert.equal(splitObviousFoodCombo("1 katori daal chawal"), null);
  assert.equal(splitObviousFoodCombo("milk banana"), null);
});

test("split combo items still ground through the existing trusted catalog path", () => {
  const daalChawal = groundParsedFoodItems(splitObviousFoodCombo("daal chawal") ?? []);
  assert.deepEqual(daalChawal.map((item) => item.matched_food_id), ["catalog:daal", "catalog:rice"]);

  const rotiEggs = groundParsedFoodItems(splitObviousFoodCombo("2 roti 2 eggs") ?? []);
  assert.deepEqual(
    rotiEggs.map((item) => [item.food_name, item.quantity, item.unit, item.matched_food_id, item.calories]),
    [
      ["roti", 2, "roti", "catalog:roti2", 220],
      ["eggs", 2, "egg", "catalog:eggs2", 160],
    ]
  );
});
