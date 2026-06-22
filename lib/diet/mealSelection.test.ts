import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMealSelection, type MealSelection } from "./mealSelection.ts";

test("parseMealSelection accepts a well-formed selection", () => {
  const sel = parseMealSelection({
    breakfast: [{ name: "eggs", portion: "3" }, { name: "paratha", portion: "1" }],
    lunch: [{ name: "chicken", portion: "1 piece" }, { name: "rice", portion: "1 cup" }],
    dinner: [{ name: "beef", portion: "1 cup" }, { name: "roti", portion: "2" }],
    snack: [{ name: "banana", portion: "1" }],
  });
  assert.ok(sel);
  assert.deepEqual((sel as MealSelection).snack, [{ name: "banana", portion: "1" }]);
  assert.equal((sel as MealSelection).breakfast[0].name, "eggs");
});

test("parseMealSelection coerces bare-string foods to {name}", () => {
  const sel = parseMealSelection({ breakfast: ["oats", "  milk  "], lunch: [], dinner: [], snack: [] });
  assert.deepEqual(sel?.breakfast, [{ name: "oats" }, { name: "milk" }]); // trimmed, no portion
});

test("parseMealSelection drops invalid entries and nameless objects", () => {
  const sel = parseMealSelection({
    breakfast: [{ name: "" }, { portion: "2" }, 42, null, { name: "eggs" }],
    lunch: [],
    dinner: [],
    snack: [],
  });
  assert.deepEqual(sel?.breakfast, [{ name: "eggs" }]);
});

test("parseMealSelection caps each slot to keep plans simple", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `food${i}` }));
  const sel = parseMealSelection({ breakfast: many, lunch: [], dinner: [], snack: [] });
  assert.equal(sel?.breakfast.length, 4); // MAX_PER_SLOT
});

test("parseMealSelection ignores unknown keys and missing slots default to []", () => {
  const sel = parseMealSelection({ lunch: [{ name: "daal" }], nonsense: [{ name: "x" }] });
  assert.ok(sel);
  assert.deepEqual(sel?.breakfast, []);
  assert.deepEqual(sel?.dinner, []);
  assert.deepEqual(sel?.lunch, [{ name: "daal" }]);
});

test("parseMealSelection returns null when nothing usable came back", () => {
  assert.equal(parseMealSelection(null), null);
  assert.equal(parseMealSelection("not an object"), null);
  assert.equal(parseMealSelection({}), null);
  assert.equal(parseMealSelection({ breakfast: [], lunch: [], dinner: [], snack: [] }), null);
  assert.equal(parseMealSelection({ breakfast: [{ portion: "no name" }] }), null);
});
