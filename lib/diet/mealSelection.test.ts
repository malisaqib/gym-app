import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMealSelectionPrompt,
  generateMealSelection,
  parseMealSelection,
  type MealSelectionProfile,
} from "./mealSelection.ts";
import {
  buildMealCandidatePool,
  buildMealCandidateLists,
  explicitProteinPowderOptIn,
} from "./mealCandidates.ts";
import { resolveProteinPowderPreference } from "./proteinPowder.ts";
import { buildPlan, filterFromPreference, type DietFilter } from "./planner.ts";

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

test("stored protein powder preference overrides legacy text inference", () => {
  assert.equal(resolveProteinPowderPreference("enabled", ""), true);
  assert.equal(resolveProteinPowderPreference("disabled", "whey protein shake"), false);
  assert.equal(resolveProteinPowderPreference("unknown", "banana shake"), false);
  assert.equal(resolveProteinPowderPreference(null, "banana shake"), false);
  assert.equal(resolveProteinPowderPreference("unknown", "I use whey"), true);
  assert.equal(resolveProteinPowderPreference(null, "keep my protein powder"), true);
});

test("regional candidate lists keep western and desi automatic choices distinct", () => {
  const usa = profile({ region: "us_canada" });
  assert.ok(usa.candidates.lunch.some((food) => food.id === "chicken_breast"));
  assert.ok(!usa.candidates.lunch.some((food) => food.region === "desi"));

  const pakistan = profile({ region: "pakistan" });
  assert.ok(pakistan.candidates.lunch.some((food) => food.id === "roti2"));
  assert.ok(!pakistan.candidates.lunch.some((food) => food.id === "brown_rice"));
  assert.ok(!pakistan.candidates.lunch.some((food) => food.id === "turkey_breast"));
});

test("specific region metadata exposes familiar India, UK, and Middle East foods", () => {
  const india = profile({ region: "india" });
  assert.equal(
    india.candidates.lunch.find((food) => food.id === "paneer")?.regionMatch,
    "specific"
  );
  assert.equal(
    india.candidates.lunch.find((food) => food.id === "rajma")?.regionMatch,
    "specific"
  );

  const uk = profile({ region: "uk_europe" });
  assert.equal(
    uk.candidates.breakfast.find((food) => food.id === "cottage_cheese")?.regionMatch,
    "specific"
  );
  assert.equal(
    uk.candidates.breakfast.find((food) => food.id === "bread2")?.regionMatch,
    "specific"
  );

  const middleEast = profile({ region: "middle_east" });
  assert.equal(
    middleEast.candidates.lunch.find((food) => food.id === "pita")?.regionMatch,
    "specific"
  );
  assert.equal(
    middleEast.candidates.lunch.find((food) => food.id === "hummus")?.regionMatch,
    "specific"
  );
});

test("regional deterministic pools do not force cross-cuisine staples", () => {
  const usaProfile = {
    filter: openFilter,
    region: "us_canada" as const,
    foodPreference: "high_protein" as const,
    allowProteinPowder: false,
  };
  const usaPool = buildMealCandidatePool(usaProfile);
  assert.ok(usaPool.some((food) => food.id === "chicken_thigh"));
  assert.ok(usaPool.some((food) => food.id === "bread2"));
  assert.ok(!usaPool.some((food) => food.id === "roti2"));

  const pakistanPool = buildMealCandidatePool({
    ...usaProfile,
    region: "pakistan",
    foodPreference: "normal_desi",
  });
  assert.ok(pakistanPool.some((food) => food.id === "roti2"));
  assert.ok(pakistanPool.some((food) => food.id === "daal"));
  assert.ok(!pakistanPool.some((food) => food.id === "turkey_breast"));
});

test("regional deterministic plans use the matching curated cuisine pool", () => {
  const usaFilter = {
    ...openFilter,
    regionFocus: "western" as const,
    profileRegion: "us_canada" as const,
  };
  const usaPool = buildMealCandidatePool({
    filter: usaFilter,
    region: "us_canada",
    foodPreference: "high_protein",
    allowProteinPowder: false,
  });
  const usaPlan = buildPlan({
    calorieTarget: 2100,
    proteinTargetG: 130,
    filter: usaFilter,
    seed: 4,
    pool: usaPool,
  });
  const usaRegions = usaPlan.meals
    .flatMap((meal) => meal.items)
    .map((item) => usaPool.find((food) => food.id === item.id)?.region);
  assert.ok(usaRegions.includes("western"));
  assert.ok(!usaRegions.includes("desi"));

  const pakistanFilter = {
    ...openFilter,
    regionFocus: "desi" as const,
    profileRegion: "pakistan" as const,
  };
  const pakistanPool = buildMealCandidatePool({
    filter: pakistanFilter,
    region: "pakistan",
    foodPreference: "normal_desi",
    allowProteinPowder: false,
  });
  const pakistanPlan = buildPlan({
    calorieTarget: 2100,
    proteinTargetG: 130,
    filter: pakistanFilter,
    seed: 4,
    pool: pakistanPool,
  });
  const pakistanItems = pakistanPlan.meals
    .flatMap((meal) => meal.items)
    .map((item) => pakistanPool.find((food) => food.id === item.id))
    .filter((food) => food != null);
  assert.ok(pakistanItems.some((food) => food.region === "desi"));
  assert.ok(
    pakistanItems.every(
      (food) => !["turkey_breast", "brown_rice", "bread2", "tuna"].includes(food.id)
    )
  );
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

test("HTTP 429 records a safe fallback reason for deterministic generation", async () => {
  const result = await generateMealSelection(profile(), {
    apiKey: "test-key",
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });

  assert.equal(result.selection, null);
  assert.equal(result.fallbackReason, "rate_limited");
});

test("malformed Groq JSON records a safe fallback reason", async () => {
  const result = await generateMealSelection(profile(), {
    apiKey: "test-key",
    fetchImpl: async () =>
      Response.json({
        choices: [{ message: { content: "{not-json" } }],
      }),
  });

  assert.equal(result.selection, null);
  assert.equal(result.fallbackReason, "malformed_json");
});
