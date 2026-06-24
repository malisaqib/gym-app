import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMealSelectionPrompt,
  parseMealSelection,
  type MealSelectionProfile,
} from "./mealSelection.ts";
import {
  buildMealCandidateLists,
  explicitProteinPowderOptIn,
} from "./mealCandidates.ts";
import { filterFromPreference, type DietFilter } from "./planner.ts";

const openFilter: DietFilter = {
  vegetarian: false,
  excludeTags: [],
  excludeFoods: [],
  regionFocus: "western",
};

function profile(overrides: Partial<MealSelectionProfile> = {}): MealSelectionProfile {
  const base = {
    calorieTarget: 2100,
    proteinTargetG: 130,
    weightKg: 75,
    goal: "maintain" as const,
    sex: "male" as const,
    region: "us_canada" as const,
    foodPreference: "high_protein" as const,
    activityLevel: "light" as const,
    trainingLocation: "gym" as const,
    vegetarian: false,
    excludeTags: [],
    excludeFoods: [],
    allowProteinPowder: false,
    usualMeals: { breakfast: "eggs and oats", foods: "chicken and yogurt" },
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    candidates:
      overrides.candidates ??
      buildMealCandidateLists({
        filter: {
          ...openFilter,
          vegetarian: merged.vegetarian,
          excludeTags: merged.excludeTags,
          excludeFoods: merged.excludeFoods,
        },
        region: merged.region,
        foodPreference: merged.foodPreference,
        allowProteinPowder: merged.allowProteinPowder,
      }),
  };
}

test("prompt exposes explicit candidate ids and forbids nutrition output", () => {
  const prompt = buildMealSelectionPrompt(profile());
  assert.match(prompt, /"id":"chicken_breast"/);
  assert.match(prompt, /Return ids only/);
  assert.match(prompt, /Never calculate or return calories/);
});

test("valid candidate ids are accepted", () => {
  const p = profile();
  const selection = parseMealSelection(
    {
      breakfast: [{ id: "scrambled" }, { id: "oats" }],
      lunch: [{ id: "chicken_breast" }, { id: "brown_rice" }],
      dinner: [{ id: "salmon" }, { id: "baked_potato" }],
      snack: [{ id: "banana" }],
    },
    p.candidates
  );
  assert.equal(selection?.lunch[0].id, "chicken_breast");
});

test("unknown ids and free-form names are rejected", () => {
  const candidates = profile().candidates;
  assert.equal(
    parseMealSelection(
      { breakfast: [{ id: "not-a-food" }], lunch: [], dinner: [], snack: [] },
      candidates
    ),
    null
  );
  assert.equal(
    parseMealSelection(
      { breakfast: [{ name: "eggs" }], lunch: [], dinner: [], snack: [] },
      candidates
    ),
    null
  );
});

test("wrong-slot, duplicate, and extra-key responses are rejected", () => {
  const candidates = profile().candidates;
  assert.equal(
    parseMealSelection(
      { breakfast: [{ id: "salmon" }], lunch: [], dinner: [], snack: [] },
      candidates
    ),
    null
  );
  assert.equal(
    parseMealSelection(
      { breakfast: [{ id: "oats" }, { id: "oats" }], lunch: [], dinner: [], snack: [] },
      candidates
    ),
    null
  );
  assert.equal(
    parseMealSelection(
      { breakfast: [{ id: "oats", name: "Oatmeal" }], lunch: [], dinner: [], snack: [] },
      candidates
    ),
    null
  );
});

test("avoided foods and meat are absent from their filtered candidate lists", () => {
  const avoided = profile({
    excludeTags: ["beef"],
    excludeFoods: ["salmon"],
  });
  assert.ok(avoided.candidates.dinner.every((food) => !["ground_beef", "salmon"].includes(food.id)));

  const vegetarian = profile({ vegetarian: true });
  assert.ok(vegetarian.candidates.lunch.every((food) => food.vegetarian));
  assert.ok(!vegetarian.candidates.lunch.some((food) => food.id === "chicken_breast"));
});

test("whey is candidate-gated by explicit protein powder preference", () => {
  const disabled = profile({ allowProteinPowder: false });
  const enabled = profile({ allowProteinPowder: true });
  assert.ok(!disabled.candidates.breakfast.some((food) => food.id === "whey"));
  assert.ok(enabled.candidates.breakfast.some((food) => food.id === "whey"));
});

test("protein powder opt-in requires explicit powder language", () => {
  assert.equal(explicitProteinPowderOptIn("I usually have a banana shake"), false);
  assert.equal(explicitProteinPowderOptIn("I use whey after training"), true);
  assert.equal(explicitProteinPowderOptIn("Keep my protein powder"), true);
  assert.equal(explicitProteinPowderOptIn("A protein shake is fine"), true);
});

test("regional candidate lists keep western and desi automatic choices distinct", () => {
  const usa = profile({ region: "us_canada" });
  assert.ok(usa.candidates.lunch.some((food) => food.id === "chicken_breast"));
  assert.ok(!usa.candidates.lunch.some((food) => food.region === "desi"));

  const pakistan = profile({ region: "pakistan" });
  assert.ok(pakistan.candidates.lunch.some((food) => food.id === "roti2"));
  assert.ok(!pakistan.candidates.lunch.some((food) => food.region === "western"));
});

test("non-veg can receive meat while current veg_limited semantics remain strict", () => {
  const nonVeg = profile();
  assert.ok(nonVeg.candidates.lunch.some((food) => !food.vegetarian));

  // The stored value combines two meanings. Preserve the existing strict
  // interpretation until onboarding splits vegetarian from flexitarian.
  const limitedFilter = filterFromPreference("veg_limited");
  const limited = buildMealCandidateLists({
    filter: limitedFilter,
    region: "pakistan",
    foodPreference: "veg_limited",
    allowProteinPowder: false,
  });
  assert.equal(limitedFilter.vegetarian, true);
  assert.ok(limited.lunch.every((food) => food.vegetarian));
});

test("malformed JSON shapes return null for deterministic fallback", () => {
  const candidates = profile().candidates;
  assert.equal(parseMealSelection(null, candidates), null);
  assert.equal(parseMealSelection({}, candidates), null);
  assert.equal(
    parseMealSelection(
      { breakfast: [], lunch: [], dinner: [], snack: [], commentary: "done" },
      candidates
    ),
    null
  );
});
