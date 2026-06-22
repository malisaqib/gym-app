import { test } from "node:test";
import assert from "node:assert/strict";
import { displayNameForLoggedFood } from "./logDisplayName.ts";
import { displayNameForQuantity } from "./displayName.ts";

const item = (food_name: string) => ({
  food_name,
  quantity: 1,
  unit: "",
  calories: 100,
  protein_g: 1,
  carbs_g: 10,
  fat_g: 1,
});

test("simple single-item logs keep the user's display phrase", () => {
  assert.equal(displayNameForLoggedFood("coffee shake", item("Shake, fast food, vanilla, coffee-flavored"), 1), "coffee shake");
});

test("leading quantities and serving words are removed from the display name", () => {
  assert.equal(displayNameForLoggedFood("2 eggs", item("Egg, whole, cooked"), 1), "eggs");
  assert.equal(displayNameForLoggedFood("one glass coffee shake", item("Shake, fast food, vanilla, coffee-flavored"), 1), "coffee shake");
});

test("natural short phrases are cleaned before display", () => {
  assert.equal(displayNameForLoggedFood("I had coffee shake", item("Shake, fast food, vanilla, coffee-flavored"), 1), "coffee shake");
});

test("multi-item parses keep the parser's per-item names", () => {
  assert.equal(displayNameForLoggedFood("2 roti and daal", item("Roti / chapati"), 2), "Roti / chapati");
});

test("long sentences fall back to the parsed food name", () => {
  assert.equal(
    displayNameForLoggedFood("after gym I had a large homemade coffee shake with ice", item("Coffee shake"), 1),
    "Coffee shake"
  );
});

test("quantity-rendered rows do not duplicate counts in the food name", () => {
  assert.equal(displayNameForQuantity("2 roti"), "roti");
  assert.equal(displayNameForQuantity("1 boiled egg"), "boiled egg");
  assert.equal(displayNameForQuantity("2 eggs (boiled/fried)"), "eggs (boiled/fried)");
  assert.equal(displayNameForQuantity("Omelette (2 eggs)"), "Omelette");
  assert.equal(displayNameForQuantity("one glass milk"), "milk");
});
