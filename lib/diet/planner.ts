import type { FoodPreference, Region } from "@/lib/database.types";
import { explicitProteinPowderOptIn } from "./proteinPowder.ts";
import {
  resolveDietMode,
  type ResolvedDietMode,
} from "./dietMode.ts";
import { FOOD_CATALOG, CATALOG_BY_ID, type CatalogFood, type MealSlot } from "./foodCatalog.ts";
import { isUnsafeImportedPlannerFood } from "./foodClassify.ts";
import {
  clampPlannerAmount,
  isPlannerAmountOnStep,
  plannerPortionConstraint,
  preferredPlannerAmountMax,
} from "./portionConstraints.ts";

/**
 * Deterministic diet-plan generator (Phase 3 rebuild).
 *
 * Pure functions (no DB, no AI). The daily calorie + protein targets are a
 * BUDGET TO FIT, not to exceed:
 *   1. split the day across meals so the slot budgets sum to EXACTLY the target,
 *   2. seed each meal with the user's usual foods (where they fit the slot),
 *   3. fill the rest from the catalog — every add is hard-capped so a meal can
 *      never exceed its slot budget (so the day can never exceed the target),
 *   4. if protein is short, raise it by SWAPPING items for higher-protein ones
 *      of similar calories — never by adding calories on top,
 *   5. flag `proteinShort` if the target can't be met within the calorie budget.
 *
 * A seed makes it deterministic but lets regenerate/swap vary the result.
 * No hardcoded menus — plans are built. (Budget/cost is out of scope.)
 */

export interface DietFilter {
  vegetarian: boolean;
  dietMode?: ResolvedDietMode;
  excludeTags: string[]; // whole categories to remove (e.g. "beef") — matched on tags
  excludeFoods: string[]; // SPECIFIC foods to avoid, free text (e.g. "whey protein shake")
  regionFocus: "desi" | "western" | null; // soft lean, not a hard filter
  profileRegion?: Region | null;
}

/** The user's usual meals (free text), used to seed the plan. */
export interface UsualMeals {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  foods?: string; // foods they eat a lot (likes) — preferred when filling
  keep?: string; // comfort foods to KEEP — seeded into any fitting slot + protected
}

export interface PlanMealItem {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  approx?: boolean; // true for a free-typed item we estimated (not catalog-grounded)
  // Live quantity (Phase: plan-tab quantity). Total = base × amount, computed on
  // the fly. All optional/additive — old saved plans derive from the catalog.
  unitMode?: "count" | "portion";
  baseCalories?: number; // per unit (count) or per gram (portion)
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
  amount?: number; // units (count) or grams (portion)
  servingGrams?: number | null; // one base serving (portion only)
  unit?: string;
}

export interface ItemQtySpec {
  unitMode: "count" | "portion";
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  amount: number;
  servingGrams: number | null;
  unit: string;
}

export interface PlanMeal {
  slot: MealSlot;
  title: string;
  items: PlanMealItem[];
  calories: number;
  protein: number;
  budget: number; // this meal's calorie budget (so the UI can show fit)
}

export type DietPlanValidationIssueCode =
  | "invalid_target"
  | "calories_over_target"
  | "calories_short"
  | "protein_short"
  | "protein_over_target"
  | "unsafe_food"
  | "portion_too_large"
  | "portion_too_small"
  | "portion_step_invalid"
  | "quantity_mismatch"
  | "excessive_repeat"
  | "diet_mode_violation";

export interface DietPlanValidationIssue {
  code: DietPlanValidationIssueCode;
  message: string;
  slot?: MealSlot;
  foodId?: string;
  foodName?: string;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface DietPlanValidation {
  ok: boolean;
  targetOk: boolean;
  portionsOk: boolean;
  foodsOk: boolean;
  issues: DietPlanValidationIssue[];
}

export interface DietPlan {
  meals: PlanMeal[];
  calorieTarget: number;
  proteinTargetG: number;
  totalCalories: number;
  totalProtein: number;
  filter: DietFilter;
  proteinShort: boolean; // couldn't reach the protein target within the calorie budget
  caloriesShort: boolean; // couldn't fill the day (usually too-restrictive prefs / few foods)
  seed: number;
  // Optimistic-concurrency stamp, set on every persist (Date.now()). Writes
  // compare-and-swap on it so a stale tab can't silently overwrite edits made
  // in another tab. Absent on plans saved before this field existed.
  rev?: number;
  // Which meals the user has already logged into their food log TODAY (the
  // plan→log loop). `date` is the user's LOCAL day; when it isn't today the
  // whole record is stale and treated as "nothing logged yet" (a new day
  // clears it). Additive — old plans simply have none.
  logged?: { date: string; slots: MealSlot[] };
  // Final contract check for generated/saved plans: target fit, realistic
  // portions, and safe planner foods. Additive for older saved JSON.
  validation?: DietPlanValidation;
  foodPreference?: FoodPreference | null;
  // Resolved from the explicit profile preference (legacy clear-text inference
  // is applied before the plan is built). Persisted so every Diet Plan flow
  // enforces the same whey rule.
  allowProteinPowder?: boolean;
}

// The tolerance bar (±5%): a generated plan must land within 95–100% of the
// calorie target. Below 95% (after the day-level top-up pass) the plan is
// honestly flagged as the closest fit possible under the user's restrictions.
export const CALORIE_SHORT_THRESHOLD = 0.95;
export const PROTEIN_SHORT_THRESHOLD = 0.95;
export const PROTEIN_MAX_THRESHOLD = 1.05;
const SHORT_THRESHOLD = CALORIE_SHORT_THRESHOLD;

const SLOT_META: { slot: MealSlot; title: string; pct: number }[] = [
  { slot: "breakfast", title: "Breakfast", pct: 0.25 },
  { slot: "lunch", title: "Lunch", pct: 0.35 },
  { slot: "dinner", title: "Dinner", pct: 0.3 },
  { slot: "snack", title: "Snack", pct: 0.1 },
];

const SLOT_SET = new Set<MealSlot>(SLOT_META.map((m) => m.slot));

const positiveNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const safeNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Saved plans are JSON blobs and older versions may be missing additive fields
 * like calorie/protein targets, budgets, rev, or logged state. Normalize on load
 * so the UI and mutation actions never operate on partial target data.
 */
export function normalizeDietPlan(
  raw: unknown,
  targets: { calorieTarget?: number | null; proteinTargetG?: number | null } = {}
): DietPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<DietPlan>;
  if (!Array.isArray(input.meals)) return null;

  const calorieTarget = positiveNumber(targets.calorieTarget) ?? positiveNumber(input.calorieTarget) ?? 0;
  const proteinTargetG = positiveNumber(targets.proteinTargetG) ?? positiveNumber(input.proteinTargetG) ?? 0;
  const budgets = new Map(slotBudgets(calorieTarget).map((m) => [m.slot, m.cal]));
  const meals: PlanMeal[] = input.meals.flatMap((rawMeal) => {
    if (!rawMeal || !SLOT_SET.has((rawMeal as PlanMeal).slot)) return [];
    const meal = rawMeal as Partial<PlanMeal> & { slot: MealSlot };
    const items = Array.isArray(meal.items) ? (meal.items as PlanMealItem[]) : [];
    const calories = items.length ? items.reduce((s, i) => s + safeNumber(i.calories), 0) : safeNumber(meal.calories);
    const protein = items.length ? items.reduce((s, i) => s + safeNumber(i.protein), 0) : safeNumber(meal.protein);
    return [
      {
        slot: meal.slot,
        title: typeof meal.title === "string" && meal.title.trim() ? meal.title : SLOT_META.find((m) => m.slot === meal.slot)!.title,
        items,
        calories,
        protein,
        budget: positiveNumber(meal.budget) ?? budgets.get(meal.slot) ?? 0,
      },
    ];
  });

  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  const logged =
    input.logged && typeof input.logged.date === "string" && Array.isArray(input.logged.slots)
      ? { date: input.logged.date, slots: input.logged.slots.filter((s): s is MealSlot => SLOT_SET.has(s)) }
      : undefined;

  return withValidation({
    meals,
    calorieTarget,
    proteinTargetG,
    totalCalories,
    totalProtein,
    filter: input.filter ?? {
      vegetarian: false,
      dietMode: "non_veg",
      excludeTags: [],
      excludeFoods: [],
      regionFocus: null,
    },
    proteinShort: totalProtein < proteinTargetG * PROTEIN_SHORT_THRESHOLD,
    caloriesShort: totalCalories < calorieTarget * SHORT_THRESHOLD,
    seed: safeNumber(input.seed) || 1,
    rev: typeof input.rev === "number" ? input.rev : undefined,
    logged,
    foodPreference: input.foodPreference ?? null,
    allowProteinPowder: input.allowProteinPowder === true,
  });
}

// --- preferences ------------------------------------------------------------

/** Build a filter from the saved food preference + any AI-parsed extras. */
export function filterFromPreference(
  pref: FoodPreference | null,
  extra?: Partial<DietFilter>,
  dietMode?: ResolvedDietMode
): DietFilter {
  const resolvedMode = dietMode ?? resolveDietMode(null, pref);
  const base: DietFilter = {
    vegetarian: resolvedMode === "vegetarian",
    dietMode: resolvedMode,
    excludeTags: [],
    excludeFoods: [],
    regionFocus: null,
    profileRegion: null,
  };
  return {
    vegetarian: extra?.vegetarian ?? base.vegetarian,
    dietMode: extra?.dietMode ?? base.dietMode,
    regionFocus: extra?.regionFocus ?? base.regionFocus,
    profileRegion: extra?.profileRegion ?? base.profileRegion,
    excludeTags: dedupe([...base.excludeTags, ...(extra?.excludeTags ?? [])]),
    excludeFoods: dedupe([...base.excludeFoods, ...(extra?.excludeFoods ?? [])]),
  };
}

/**
 * Combine several preference sources into one filter (later parts win for
 * regionFocus; vegetarian is true if ANY part sets it; excludes are unioned).
 */
export function mergeFilters(...parts: Partial<DietFilter>[]): DietFilter {
  let vegetarian = false;
  let dietMode: ResolvedDietMode | undefined;
  let regionFocus: DietFilter["regionFocus"] = null;
  let profileRegion: Region | null = null;
  const tags = new Set<string>();
  const foods = new Set<string>();
  for (const p of parts) {
    if (p.vegetarian) vegetarian = true;
    if (p.dietMode) dietMode = p.dietMode;
    if (p.regionFocus) regionFocus = p.regionFocus;
    if (p.profileRegion) profileRegion = p.profileRegion;
    (p.excludeTags ?? []).forEach((t) => tags.add(t));
    (p.excludeFoods ?? []).forEach((f) => foods.add(f.toLowerCase().trim()));
  }
  return {
    vegetarian,
    dietMode,
    regionFocus,
    profileRegion,
    excludeTags: [...tags],
    excludeFoods: [...foods].filter(Boolean),
  };
}

// --- matching ---------------------------------------------------------------

// Whole-word/phrase containment. Word boundaries stop a short term from nuking
// unrelated foods — e.g. "vegetable" must NOT match the tag "veg", and
// "buttermilk" must NOT match the food "milk". Regex metachars are escaped.
function wordPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

// Does a free-text "avoid" term refer to this food? Tolerant in both directions
// but word-boundary safe, and matches the food's category tags as whole words.
function matchesAvoidedFood(food: CatalogFood, terms: string[]): boolean {
  if (!terms?.length) return false;
  const name = food.name.toLowerCase();
  const tags = food.tags.map((t) => t.toLowerCase());
  return terms.some((raw) => {
    const term = raw.toLowerCase().trim();
    if (term.length < 3) return false;
    return (
      wordPhrase(name, term) || // term names the food ("rice" → "Boiled rice")
      wordPhrase(term, name) || // the food name appears inside a longer phrase
      tags.some((tag) => wordPhrase(term, tag)) // term mentions a category tag
    );
  });
}

// Is this food mentioned in a free-text meal description ("paratha + egg")?
// Word-boundary safe (D2): plain substring matching let "buttermilk" in the
// user's usual text seed (and PROTECT) the catalog food "Milk", and "daal"
// inside "daal-roti" style words could mis-bind. Every check goes through
// wordPhrase so only whole words/phrases count.
function mentioned(food: CatalogFood, text: string): boolean {
  const t = text.toLowerCase();
  if (!t.trim()) return false;
  const name = food.name.toLowerCase();
  if (wordPhrase(t, name)) return true;
  if (food.tags.some((tag) => tag.length >= 3 && wordPhrase(t, tag.toLowerCase()))) return true;
  // Aliases incl. Roman Urdu (e.g. "nehari", "aam", "panir").
  if ((food.aliases ?? []).some((a) => a.length >= 3 && wordPhrase(t, a.toLowerCase()))) return true;
  const tokens = name.replace(/[^a-z]+/g, " ").split(" ").filter((w) => w.length >= 4);
  return tokens.some((tok) => wordPhrase(t, tok));
}

// How specifically does the free text name this food? A whole-name or alias
// phrase match is the strongest signal; otherwise we count distinct matched
// tags/name-tokens. Used to tell whether the user clearly typed a meat/fish
// dish (which a diet mode blocks) vs. merely shares a generic token like
// "curry" with an allowed vegetarian food. Mirrors mentioned()'s matching.
function mentionScore(food: CatalogFood, text: string): number {
  const t = text.toLowerCase();
  if (!t.trim()) return 0;
  const name = food.name.toLowerCase();
  if (wordPhrase(t, name)) return 1000 + name.length;
  for (const a of food.aliases ?? []) {
    const al = a.toLowerCase();
    if (al.length >= 3 && wordPhrase(t, al)) return 1000 + al.length;
  }
  let score = 0;
  for (const tag of food.tags) {
    if (tag.length >= 3 && wordPhrase(t, tag.toLowerCase())) score++;
  }
  const tokens = new Set(name.replace(/[^a-z]+/g, " ").split(" ").filter((w) => w.length >= 4));
  for (const tok of tokens) {
    if (wordPhrase(t, tok)) score++;
  }
  return score;
}

function allowed(food: CatalogFood, filter: DietFilter): boolean {
  if (isUnsafeImportedPlannerFood(food)) return false;
  // Veg drops only meat/fish (food.vegetarian = lacto-ovo). Egg/dairy/nuts are
  // NOT dropped by the veg toggle — they're avoided individually via excludeTags.
  if (effectiveDietMode(filter) === "vegetarian" && !food.vegetarian) return false;
  if (food.tags.some((t) => filter.excludeTags.includes(t))) return false;
  if (matchesAvoidedFood(food, filter.excludeFoods ?? [])) return false;
  return true;
}

// Would this food be valid if the diet mode placed NO restriction on meat/fish?
// (i.e. it only fails the vegetarian/flexitarian-animal rule, not unsafe/avoid/
// supplement gates). Lets us tell a diet-mode block apart from other reasons.
function allowedIgnoringDietAnimal(
  food: CatalogFood,
  filter: DietFilter,
  allowProteinPowder: boolean
): boolean {
  if (isUnsafeImportedPlannerFood(food)) return false;
  if (food.tags.some((t) => filter.excludeTags.includes(t))) return false;
  if (matchesAvoidedFood(food, filter.excludeFoods ?? [])) return false;
  if (food.tags.includes("supplement") && !allowProteinPowder) return false;
  return true;
}

export function effectiveDietMode(filter: DietFilter): ResolvedDietMode {
  if (filter.vegetarian) return "vegetarian";
  return filter.dietMode ?? "non_veg";
}

const FLEXITARIAN_MAIN_SLOTS = new Set<MealSlot>(["lunch", "dinner"]);

function isAnimalFood(food: CatalogFood): boolean {
  return !food.vegetarian;
}

function mealHasAnimalFood(meal: Pick<PlanMeal, "items">, pool: CatalogFood[]): boolean {
  return meal.items.some((item) => {
    const food = pool.find((candidate) => candidate.id === item.id) ?? CATALOG_BY_ID[item.id];
    return food ? isAnimalFood(food) : false;
  });
}

function builtMealHasAnimalFood(meal: BuiltMeal): boolean {
  return meal.picks.some((pick) => isAnimalFood(pick.food));
}

function flexitarianFoodAllowed(
  food: CatalogFood,
  filter: DietFilter,
  slot: MealSlot,
  animalMainUsedElsewhere: boolean
): boolean {
  if (effectiveDietMode(filter) !== "flexitarian" || !isAnimalFood(food)) return true;
  return FLEXITARIAN_MAIN_SLOTS.has(slot) && !animalMainUsedElsewhere;
}

export function isDietPlanFoodAllowed(food: CatalogFood, filter: DietFilter): boolean {
  return allowed(food, filter);
}

function allowedForAutoPlan(food: CatalogFood, filter: DietFilter): boolean {
  if (!allowed(food, filter)) return false;
  if (food.tags.includes("supplement")) return false;
  if (food.role === "drink" && (food.tags.includes("sweet") || /\bshake\b/i.test(food.name))) return false;
  return true;
}

function allowedForPlanOperation(
  food: CatalogFood,
  filter: DietFilter,
  allowProteinPowder: boolean,
  slot?: MealSlot,
  plan?: Pick<DietPlan, "meals">,
  // Validation walks items already on the plan; the day-level cap is checked
  // separately there (diet_mode_violation), so the per-item flexitarian count is
  // skipped to avoid flagging the single legitimately placed meat/fish item.
  ignoreFlexitarianLimit = false
): boolean {
  if (!allowed(food, filter)) return false;
  if (food.tags.includes("supplement") && !allowProteinPowder) return false;
  if (
    !ignoreFlexitarianLimit &&
    slot &&
    plan &&
    effectiveDietMode(filter) === "flexitarian" &&
    isAnimalFood(food)
  ) {
    // Candidate filtering: a meat/fish item may only be ADDED when the plan has
    // no meat/fish in ANY main meal yet (the day's single allowance). Counting
    // the current slot too stops two meat dishes stacking in one meal.
    const animalMainAlreadyUsed = plan.meals.some(
      (meal) =>
        FLEXITARIAN_MAIN_SLOTS.has(meal.slot) &&
        mealHasAnimalFood(meal, FOOD_CATALOG)
    );
    if (!flexitarianFoodAllowed(food, filter, slot, animalMainAlreadyUsed)) return false;
  }
  return true;
}

function regionBonus(food: CatalogFood, filter: DietFilter): number {
  if (filter.profileRegion && food.profileRegions?.includes(filter.profileRegion)) {
    return 14;
  }
  if (!filter.regionFocus) return 0;
  if (food.region === filter.regionFocus) return 10;
  return food.region === "global" ? 3 : 0;
}

const REGION_FALLBACK_IDS: Partial<Record<Region, Set<string>>> = {
  pakistan: new Set([
    "eggs2", "omelette", "egg_white", "roti1", "roti2", "daal", "chana", "soya",
    "dahi", "rice", "chicken_salan", "chicken_karahi", "fish_curry", "qeema",
    "mix_sabzi", "palak", "banana", "dates",
  ]),
  india: new Set([
    "eggs2", "omelette", "egg_white", "roti1", "roti2", "daal", "chana", "rajma",
    "paneer", "tofu", "soya", "dahi", "rice", "mix_sabzi", "palak", "banana",
  ]),
  middle_east: new Set([
    "eggs2", "boiled_egg1", "pita", "hummus", "rice", "chicken_breast",
    "chicken_thigh", "dahi", "greek_yogurt", "banana", "dates",
  ]),
  us_canada: new Set([
    "scrambled", "boiled_egg1", "oats", "bread2", "chicken_breast",
    "chicken_thigh", "turkey_breast", "turkey_mince", "tuna", "brown_rice",
    "baked_potato", "boiled_potato", "mashed_potato", "greek_yogurt",
    "cottage_cheese", "banana", "apple",
  ]),
  uk_europe: new Set([
    "scrambled", "boiled_egg1", "oats", "bread2", "chicken_breast",
    "chicken_thigh", "turkey_breast", "turkey_mince", "brown_rice",
    "baked_potato", "boiled_potato", "mashed_potato", "greek_yogurt",
    "cottage_cheese", "banana", "apple",
  ]),
};

const SIMPLE_FOOD_IDS = new Set([
  "eggs2", "boiled_egg1", "egg_white", "chicken_breast", "roti1", "roti2",
  "daal", "chana", "soya", "dahi", "rice", "mix_sabzi", "banana", "dates",
  "oats", "bread2", "boiled_potato", "milk",
]);

const COMPLEX_FOOD_IDS = new Set([
  "chicken_karahi", "biryani", "pulao", "nihari", "haleem", "beef_karahi",
  "aloo_gosht", "chicken_sandwich",
]);

function fallbackPreferenceBonus(
  food: CatalogFood,
  filter: DietFilter,
  foodPreference: FoodPreference | null | undefined,
  slot: MealSlot
): number {
  let score = regionBonus(food, filter);
  if (filter.profileRegion && REGION_FALLBACK_IDS[filter.profileRegion]?.has(food.id)) score += 20;

  if (foodPreference === "budget" || foodPreference === "hostel_student") {
    if (SIMPLE_FOOD_IDS.has(food.id)) score += 14;
    if (COMPLEX_FOOD_IDS.has(food.id)) score -= 20;
  }

  if (slot === "breakfast" && food.tags.includes("egg")) score += 8;
  if (slot === "breakfast" && food.role === "dairy" && food.staple === "protein") score -= 3;
  if (slot === "breakfast" && food.id === "boiled_chickpeas") score -= 18;
  return score;
}

function foodForPlanItem(item: PlanMealItem, pool: CatalogFood[]): CatalogFood | undefined {
  return pool.find((f) => f.id === item.id) ?? CATALOG_BY_ID[item.id];
}

export function validateDietPlan(plan: DietPlan, pool: CatalogFood[] = FOOD_CATALOG): DietPlanValidation {
  const issues: DietPlanValidationIssue[] = [];

  if (!Number.isFinite(plan.calorieTarget) || plan.calorieTarget <= 0) {
    issues.push({ code: "invalid_target", message: "Plan is missing a valid calorie target." });
  } else {
    if (plan.totalCalories > plan.calorieTarget) {
      issues.push({
        code: "calories_over_target",
        message: "Plan calories exceed the daily target.",
        amount: plan.totalCalories,
        maxAmount: plan.calorieTarget,
      });
    }
    if (plan.totalCalories < plan.calorieTarget * SHORT_THRESHOLD) {
      issues.push({
        code: "calories_short",
        message: "Plan calories are below the target tolerance.",
        amount: plan.totalCalories,
        maxAmount: Math.round(plan.calorieTarget * SHORT_THRESHOLD),
      });
    }
  }

  if (plan.proteinTargetG > 0 && plan.totalProtein < plan.proteinTargetG * PROTEIN_SHORT_THRESHOLD) {
    issues.push({
      code: "protein_short",
      message: "Plan protein is below the daily target.",
      amount: plan.totalProtein,
      maxAmount: plan.proteinTargetG,
    });
  }
  if (plan.proteinTargetG > 0 && plan.totalProtein > plan.proteinTargetG * PROTEIN_MAX_THRESHOLD) {
    issues.push({
      code: "protein_over_target",
      message: "Plan protein exceeds the daily target tolerance.",
      amount: plan.totalProtein,
      maxAmount: Math.round(plan.proteinTargetG * PROTEIN_MAX_THRESHOLD),
    });
  }

  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const food = foodForPlanItem(item, pool);
      if (
        (!food && !item.approx) ||
        isUnsafeImportedPlannerFood(food ?? item) ||
        (food &&
          !allowedForPlanOperation(
            food,
            plan.filter,
            plan.allowProteinPowder === true,
            meal.slot,
            plan,
            true // day-level flexitarian cap is checked separately below
          ))
      ) {
        issues.push({
          code: "unsafe_food",
          message: "Plan contains a food that is not allowed for planner use.",
          slot: meal.slot,
          foodId: item.id,
          foodName: item.name,
        });
      }
      if (food && item.amount != null) {
        const constraint = plannerPortionConstraint(food, catalogSpec(food));
        if (item.amount > constraint.maxAmount) {
          issues.push({
            code: "portion_too_large",
            message: "Plan contains a portion above the food's realistic planner cap.",
            slot: meal.slot,
            foodId: item.id,
            foodName: item.name,
            amount: item.amount,
            maxAmount: constraint.maxAmount,
          });
        }
        if (item.amount < constraint.minAmount) {
          issues.push({
            code: "portion_too_small",
            message: "Plan contains less than a meaningful planner portion.",
            slot: meal.slot,
            foodId: item.id,
            foodName: item.name,
            amount: item.amount,
            minAmount: constraint.minAmount,
          });
        }
        if (!isPlannerAmountOnStep(item.amount, constraint)) {
          issues.push({
            code: "portion_step_invalid",
            message: "Plan portion is not on a realistic planner increment.",
            slot: meal.slot,
            foodId: item.id,
            foodName: item.name,
            amount: item.amount,
          });
        }
      }
      if (
        item.amount != null &&
        item.baseCalories != null &&
        (Math.abs(item.calories - Math.round(item.baseCalories * item.amount)) > 1 ||
          Math.abs(item.protein - Math.round((item.baseProtein ?? 0) * item.amount)) > 1)
      ) {
        issues.push({
          code: "quantity_mismatch",
          message: "Plan item totals do not match its stored quantity.",
          slot: meal.slot,
          foodId: item.id,
          foodName: item.name,
          amount: item.amount,
        });
      }
    }
  }

  if (effectiveDietMode(plan.filter) === "flexitarian") {
    // Flexitarian is "little meat": at most ONE meat/fish item per day, and only
    // in a lunch/dinner main meal. Counting items (not just meals) also catches a
    // single main meal that stacks two meat dishes.
    let animalMainItems = 0;
    for (const meal of plan.meals) {
      if (!FLEXITARIAN_MAIN_SLOTS.has(meal.slot)) continue;
      for (const item of meal.items) {
        const food = pool.find((candidate) => candidate.id === item.id) ?? CATALOG_BY_ID[item.id];
        if (food && isAnimalFood(food)) animalMainItems++;
      }
    }
    // Meat/fish in a non-main slot (breakfast/snack) is never allowed for flexitarian.
    const animalOffMainItems = plan.meals
      .filter((meal) => !FLEXITARIAN_MAIN_SLOTS.has(meal.slot))
      .flatMap((meal) => meal.items)
      .filter((item) => {
        const food = pool.find((candidate) => candidate.id === item.id) ?? CATALOG_BY_ID[item.id];
        return food ? isAnimalFood(food) : false;
      }).length;
    if (animalMainItems + animalOffMainItems > 1) {
      issues.push({
        code: "diet_mode_violation",
        message: "Flexitarian plans can include meat or fish in at most one main meal.",
        amount: animalMainItems + animalOffMainItems,
        maxAmount: 1,
      });
    }
  }

  const repeatCounts = new Map<string, number>();
  for (const item of plan.meals.flatMap((meal) => meal.items)) {
    repeatCounts.set(item.id, (repeatCounts.get(item.id) ?? 0) + 1);
  }
  for (const [foodId, count] of repeatCounts) {
    if (count <= 2) continue;
    const food = pool.find((candidate) => candidate.id === foodId) ?? CATALOG_BY_ID[foodId];
    if (!food || food.staple || (food.role !== "protein" && food.role !== "carb")) continue;
    issues.push({
      code: "excessive_repeat",
      message: "The same cooked food is repeated more than twice.",
      foodId,
      foodName: food.name,
      amount: count,
      maxAmount: 2,
    });
  }

  const targetOk = !issues.some((i) =>
    i.code === "invalid_target" ||
    i.code === "calories_over_target" ||
    i.code === "calories_short" ||
    i.code === "protein_short" ||
    i.code === "protein_over_target"
  );
  const portionsOk = !issues.some((i) =>
    i.code === "portion_too_large" ||
    i.code === "portion_too_small" ||
    i.code === "portion_step_invalid" ||
    i.code === "quantity_mismatch"
  );
  const foodsOk = !issues.some((i) =>
    i.code === "unsafe_food" ||
    i.code === "excessive_repeat" ||
    i.code === "diet_mode_violation"
  );
  return { ok: targetOk && portionsOk && foodsOk, targetOk, portionsOk, foodsOk, issues };
}

function withValidation(plan: DietPlan, pool: CatalogFood[] = FOOD_CATALOG): DietPlan {
  return { ...plan, validation: validateDietPlan(plan, pool) };
}

// Derive a quantity spec from a catalog food's friendly portion: "~250g"/"100g"
// → portion (per gram); "2 roti"/"1 piece" → count (per unit). Lets the user
// adjust grams or units on the plan, recomputing macros from this base.
function catalogSpec(f: Pick<CatalogFood, "name" | "portion" | "calories" | "protein" | "carbs" | "fat">): ItemQtySpec {
  const grams = f.portion.match(/(\d+)\s*g\b/);
  if (grams) {
    const g = Number(grams[1]);
    return {
      unitMode: "portion",
      servingGrams: g,
      amount: g,
      unit: "g",
      baseCalories: f.calories / g,
      baseProtein: f.protein / g,
      baseCarbs: f.carbs / g,
      baseFat: f.fat / g,
    };
  }
  const lead = f.portion.match(/^(\d+)/);
  const count = lead ? Math.max(1, Number(lead[1])) : 1;
  let noun = f.portion.replace(/^\d+\s*/, "").split(/[\s(]/)[0] || "";
  // Size adjectives make terrible units ("3 medium" for roti) — fall back to
  // the food name's last word ("roti", "potato", "paratha") for the label.
  if (/^(medium|large|small|stuffed)$/i.test(noun)) {
    const fromName = f.name.toLowerCase().replace(/\(.*?\)/g, "").trim().split(/\s+/).at(-1) ?? "";
    if (fromName.length >= 3) noun = fromName;
  }
  return {
    unitMode: "count",
    servingGrams: null,
    amount: count,
    unit: noun,
    baseCalories: f.calories / count,
    baseProtein: f.protein / count,
    baseCarbs: f.carbs / count,
    baseFat: f.fat / count,
  };
}

const toItem = (f: CatalogFood): PlanMealItem => {
  return toScaledItem(f, 1);
};

const proteinDensity = (f: CatalogFood) => f.protein / Math.max(1, f.calories);

/** Pick the highest-scoring of the top few candidates (rng adds safe variety). */
function chooseTop(
  cands: CatalogFood[],
  score: (f: CatalogFood) => number,
  rng: () => number,
  topN = 3
): CatalogFood | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  return sorted[Math.floor(rng() * Math.min(topN, sorted.length))];
}

// --- meal building (hard-capped, staple-anchored) ----------------------------
// Real-world simple (the diet rebuild): each main meal is ONE staple protein
// portion-scaled to its protein share, ONE staple carb scaled to fill the
// calories, and at most one simple side. Snacks are fruit. A few familiar foods
// done right and repeated — not a 15-dish rotating menu. Staple repetition
// across meals is deliberate (chicken at lunch AND dinner is how people eat).

/** A chosen food at a portion multiplier of its catalog serving. */
interface MealPick {
  food: CatalogFood;
  mult: number; // 0.5–3.0 in 0.25 steps
  isProtected: boolean; // usual-food seed (kept; may still be scaled up)
}

interface BuiltMeal {
  slot: MealSlot;
  title: string;
  budget: number;
  cands: CatalogFood[];
  picks: MealPick[];
}

const MULT_MIN = 0.5;
const MULT_MAX = 3;
const MULT_STEP = 0.25;

// Protein lives in the MAIN meals (30/35/35); snacks are fruit by design.
const PROTEIN_SHARE: Record<MealSlot, number> = { breakfast: 0.3, lunch: 0.35, dinner: 0.35, snack: 0 };

const pickCal = (p: MealPick) => p.food.calories * p.mult;
const pickPro = (p: MealPick) => p.food.protein * p.mult;
const mealCal = (picks: MealPick[]) => picks.reduce((s, p) => s + pickCal(p), 0);
const mealPro = (picks: MealPick[]) => picks.reduce((s, p) => s + pickPro(p), 0);

const snapMult = (m: number) => Math.round(m / MULT_STEP) * MULT_STEP;
const clampMult = (m: number) => Math.min(MULT_MAX, Math.max(MULT_MIN, snapMult(m)));

/**
 * Largest multiplier ≤ `desired` whose RENDERED calories (whole counts, 5g
 * steps — count foods round UP to at least one unit) keep the meal within
 * `budget`; null when even the smallest rendering doesn't fit. Sizing by
 * planned multipliers instead let a 0.5× roti render as a whole roti and
 * push a 1200-kcal day to 1305.
 */
function fitRenderedMult(f: CatalogFood, calSoFar: number, budget: number, desired: number): number | null {
  if (f.calories <= 0) return Math.min(MULT_MAX, Math.max(MULT_MIN, snapMult(desired)));
  const top = Math.min(MULT_MAX, Math.max(MULT_MIN, snapMult(desired)));
  for (let m = top; m >= MULT_MIN - 1e-9; m -= MULT_STEP) {
    const mult = snapMult(m);
    if (calSoFar + toScaledItem(f, mult).calories <= budget) return mult;
  }
  return null;
}

function buildSimpleMeal(
  budget: number,
  slotProtein: number,
  slot: MealSlot,
  cands: CatalogFood[],
  filter: DietFilter,
  rng: () => number,
  selectedIds: string[] | undefined,
  usualText: string | undefined,
  likeIds: Set<string>,
  usedCounts: Map<string, number>,
  foodPreference: FoodPreference | null | undefined
): MealPick[] {
  const picks: MealPick[] = [];
  // RENDERED calories so far — counts round to whole units, grams to 5g steps;
  // sizing must see what the user will actually see.
  const calSoFar = () => picks.reduce((s, p) => s + toScaledItem(p.food, p.mult).calories, 0);
  const has = (f: CatalogFood) => picks.some((p) => p.food.id === f.id);
  const likeBonus = (f: CatalogFood) => (likeIds.has(f.id) ? 8 : 0);
  const repeatPenalty = (f: CatalogFood) => {
    const used = usedCounts.get(f.id) ?? 0;
    if (!used) return 0;
    if (f.staple === "fruit" || f.staple === "side" || (slot === "dinner" && f.role === "protein")) {
      return used * 28;
    }
    return used * 8;
  };
  const preferenceBonus = (f: CatalogFood) =>
    fallbackPreferenceBonus(f, filter, foodPreference, slot) - repeatPenalty(f);
  // Exact upstream selections (Groq candidate ids) seed by id only. This path
  // never fuzzy-matches model output back onto a different catalog food.
  if (selectedIds?.length) {
    const selected = selectedIds
      .map((id) => cands.find((food) => food.id === id))
      .filter((food): food is CatalogFood => food != null);
    const seenCategory = new Set(picks.map((pick) => pick.food.staple ?? pick.food.role));
    for (const food of selected) {
      const category = food.staple ?? food.role;
      if (seenCategory.has(category) || has(food)) continue;
      seenCategory.add(category);
      const mult = fitRenderedMult(food, calSoFar(), budget, 1);
      if (mult != null) picks.push({ food, mult, isProtected: false });
    }
  }

  // 1) The user's usual foods (or the selector's picks) for this slot seed the
  //    meal first (kept as-is; the day-level scale pass may grow them later).
  //    One seed per food category (protein/carb/side/etc.) so a single mention
  //    like "eggs" seeds one egg dish, not three. This keeps plans simple and
  //    honors each distinct pick (for example, eggs + paratha).
  if (usualText) {
    const matched = cands
      .filter((f) => mentioned(f, usualText))
      .sort(
        (a, b) =>
          Number(!!b.staple) - Number(!!a.staple) || // simple staples before composite dishes
          b.protein - a.protein ||
          a.id.localeCompare(b.id)
      );
    const seenCategory = new Set<string>();
    const seeds: CatalogFood[] = [];
    for (const f of matched) {
      const category = f.staple ?? f.role; // protein / carb / fruit / side / role
      if (seenCategory.has(category)) continue;
      seenCategory.add(category);
      seeds.push(f);
      if (seeds.length >= 3) break;
    }
    for (const s of seeds) {
      if (has(s)) continue;
      const m = fitRenderedMult(s, calSoFar(), budget, 1);
      if (m != null) picks.push({ food: s, mult: m, isProtected: true });
    }
  }

  // SNACK: fruit (plus whatever the user's usual snack seeds brought, e.g. an
  // opted-in shake). Simple and small by design.
  if (slot === "snack") {
    if (!picks.some((p) => p.food.staple === "fruit")) {
      // Fruit is globally familiar and should rotate across the day. Applying
      // the regional shortlist here forced India plans into banana twice even
      // when apple, orange, mango, or dates were available.
      const fruits = cands.filter((f) => f.staple === "fruit" && !has(f));
      const unusedFruits = fruits.filter((f) => !usedCounts.has(f.id));
      const fruit = chooseTop(
        unusedFruits.length ? unusedFruits : fruits,
        (f) => likeBonus(f) + preferenceBonus(f) - Math.abs(budget - f.calories) / 20,
        rng,
        2
      );
      if (fruit) {
        const m = fitRenderedMult(fruit, calSoFar(), budget, 2);
        if (m != null) picks.push({ food: fruit, mult: m, isProtected: false });
      }
    }
    return picks;
  }

  // 2) PROTEIN FIRST: one staple protein (chicken/beef/eggs/daal…), scaled
  //    toward this meal's protein share. Anchors the meal.
  // An opted-in shake is an optional addition, not the meal's only protein
  // anchor. Keep a normal food protein in the meal so breakfast does not become
  // an implausible "shake + several rotis" combination.
  if (!picks.some((p) => p.food.role === "protein" && !p.food.tags.includes("supplement"))) {
    const staples = cands.filter((f) => f.staple === "protein" && !has(f));
    const fallback = cands.filter((f) => f.role === "protein" && !has(f));
    // Regional ids affect scoring, but never hide the broader allowed pool.
    const proteins = staples.length ? staples : fallback;
    const unusedProteins = proteins.filter((f) => !usedCounts.has(f.id));
    const anchor = chooseTop(
      unusedProteins.length ? unusedProteins : proteins,
      (f) =>
        proteinDensity(f) * (slotProtein / Math.max(budget, 1) >= 0.065 ? 100 : 35) +
        likeBonus(f) +
        preferenceBonus(f) -
        Math.abs(slotProtein - f.protein) / 2 -
        Math.abs(budget * 0.42 - f.calories) / 18,
      rng,
      2
    );
    if (anchor) {
      const need = Math.max(0, slotProtein - mealPro(picks));
      const ideal = anchor.protein > 0 ? clampMult(need / anchor.protein) : 1;
      // Leave enough room for a normal carb base instead of making the protein
      // anchor carry nearly the whole meal.
      const m = fitRenderedMult(anchor, calSoFar(), budget * 0.6, ideal);
      if (m != null) picks.push({ food: anchor, mult: m, isProtected: false });
    }
  }

  // 3) CARB BASE: one staple carb (rice/roti/oats…) scaled to fill the calories.
  if (!picks.some((p) => p.food.staple === "carb" || p.food.role === "carb")) {
    const carbs = cands.filter((f) => f.staple === "carb" && !has(f));
    const fallback = cands.filter((f) => f.role === "carb" && !has(f));
    const carbOptions = carbs.length ? carbs : fallback;
    const unusedCarbs = carbOptions.filter((f) => !usedCounts.has(f.id));
    const base = chooseTop(
      unusedCarbs.length ? unusedCarbs : carbOptions,
      (f) => likeBonus(f) + preferenceBonus(f) - Math.abs((budget - calSoFar()) * 0.75 - f.calories) / 15,
      rng,
      2
    );
    if (base) {
      const remaining = budget - calSoFar();
      const spec = catalogSpec(base);
      const preferredMax = preferredPlannerAmountMax(base, spec);
      const preferredMult = preferredMax / Math.max(spec.amount, 1);
      const ideal = base.calories > 0
        ? Math.min(preferredMult, clampMult((remaining * 0.65) / base.calories))
        : 1;
      const m = fitRenderedMult(base, calSoFar(), budget, ideal);
      if (m != null) picks.push({ food: base, mult: m, isProtected: false });
    }
  }

  // 4) At most ONE simple side (salad / sabzi / dahi / fruit) if real room remains.
  if (picks.length < 4 && budget - calSoFar() >= 90) {
    const sides = cands.filter((f) => (f.staple === "side" || f.staple === "fruit") && !has(f));
    const unusedSides = sides.filter((f) => !usedCounts.has(f.id));
    const side = chooseTop(
      unusedSides.length ? unusedSides : sides,
      (f) => likeBonus(f) + preferenceBonus(f) - Math.abs(budget - calSoFar() - f.calories) / 12,
      rng,
      2
    );
    if (side) {
      const m = fitRenderedMult(side, calSoFar(), budget, 1.5);
      if (m != null) picks.push({ food: side, mult: m, isProtected: false });
    }
  }

  return picks;
}

/**
 * Day pass: portion-scale what's already on the plate toward the targets
 * instead of adding more dishes. Protein first (grow the protein-densest pick),
 * then fill calories (grow carbs/sides). Every bump must fit its meal's hard
 * budget, so the day can never exceed the calorie target.
 */
function scaleDayToTargets(meals: BuiltMeal[], calorieTarget: number, proteinTargetG: number): void {
  // Per-meal budgets shape the day; the DAY total is the hard contract. A meal
  // may flex up to +10% over its own slot budget if (and only if) the whole
  // day still stays at or under the calorie target — otherwise coarse portion
  // steps (one more roti = 110 kcal) strand the day ~8% under target.
  const MEAL_FLEX = 1.1;
  // Totals as the plan will actually RENDER (amounts floor-snap to whole counts
  // / 5g steps). Driving the loops by planned multiplier totals instead left a
  // hidden gap: floored amounts can drop ~5-8% below the planned numbers.
  const rendered = () =>
    meals
      .flatMap((m) => m.picks)
      .map((p) => toScaledItem(p.food, p.mult))
      .reduce((acc, i) => ({ cal: acc.cal + i.calories, pro: acc.pro + i.protein }), { cal: 0, pro: 0 });
  const dayCal = () => rendered().cal;
  const dayPro = () => rendered().pro;

  const renderedMealCal = (m: BuiltMeal) =>
    m.picks.reduce((s, p) => s + toScaledItem(p.food, p.mult).calories, 0);

  const dailyGramAmount = (predicate: (food: CatalogFood) => boolean) =>
    meals
      .flatMap((meal) => meal.picks)
      .filter((pick) => predicate(pick.food))
      .reduce((sum, pick) => {
        const item = toScaledItem(pick.food, pick.mult);
        return sum + (item.unitMode === "portion" ? item.amount ?? 0 : 0);
      }, 0);

  // One +step bump of the best-scoring pick that (a) actually moves the metric
  // we're raising and (b) keeps its meal under the hard cap. Deltas are
  // computed on RENDERED items — count foods jump in WHOLE units (one more
  // egg), which can be far more than calories × step, so estimating would
  // either block valid bumps or blow the budget.
  // The smallest multiplier ABOVE p.mult whose rendered output actually
  // changes. Count foods snap to whole units (3 eggs stays 3 eggs from
  // mult 1.5 to 1.75), so a single fixed step can stall the ladder.
  const nextUsefulMult = (p: MealPick): number | null => {
    const cur = toScaledItem(p.food, p.mult);
    for (let m = p.mult + MULT_STEP; m <= MULT_MAX + 1e-9; m += MULT_STEP) {
      const next = toScaledItem(p.food, snapMult(m));
      if (next.calories !== cur.calories || next.protein !== cur.protein) return snapMult(m);
    }
    return null;
  };

  const previousUsefulMult = (p: MealPick): number | null => {
    const cur = toScaledItem(p.food, p.mult);
    for (let m = p.mult - MULT_STEP; m >= MULT_MIN - 1e-9; m -= MULT_STEP) {
      const previous = toScaledItem(p.food, snapMult(m));
      if (previous.calories !== cur.calories || previous.protein !== cur.protein) return snapMult(m);
    }
    return null;
  };

  const bump = (
    metric: (i: PlanMealItem) => number,
    score: (p: MealPick) => number,
    proteinCeiling?: number
  ): boolean => {
    const day = dayCal();
    let best: { pick: MealPick; mult: number; score: number } | null = null;
    for (const m of meals) {
      const cal = renderedMealCal(m);
      for (const p of m.picks) {
        // Supplements stay at ONE serving — the scaler must never decide the
        // user should drink more whey; food anchors grow instead.
        if (p.food.tags.includes("supplement")) continue;
        const mult = nextUsefulMult(p);
        if (mult == null) continue;
        const cur = toScaledItem(p.food, p.mult);
        const next = toScaledItem(p.food, mult);
        const delta = next.calories - cur.calories;
        if (metric(next) - metric(cur) <= 0) continue; // no progress on this metric
        if (cal + delta > m.budget * MEAL_FLEX) continue; // soft per-meal shape
        if (day + delta > calorieTarget) continue; // HARD day cap
        if (proteinCeiling != null && dayPro() + next.protein - cur.protein > proteinCeiling) continue;
        if (
          cur.unitMode === "portion" &&
          p.food.role === "dairy" &&
          dailyGramAmount((food) => food.role === "dairy") + ((next.amount ?? 0) - (cur.amount ?? 0)) > 400
        ) continue;
        const preferredMax = preferredPlannerAmountMax(p.food, catalogSpec(p.food));
        const saturation = Math.max(0, (next.amount ?? 0) / Math.max(preferredMax, 1) - 0.8);
        const adjustedScore = score(p) - saturation * 30;
        if (!best || adjustedScore > best.score) best = { pick: p, mult, score: adjustedScore };
      }
    }
    if (!best) return false;
    best.pick.mult = best.mult;
    return true;
  };

  let guard = 0;
  while (dayPro() < proteinTargetG && guard < 80) {
    guard++;
    if (!bump((i) => i.protein, (p) => proteinDensity(p.food))) break;
  }
  guard = 0;
  while (dayCal() < calorieTarget * SHORT_THRESHOLD && guard < 80) {
    guard++;
    // Prefer carbs/sides for pure calorie filling (protein already handled).
    if (!bump((i) => i.calories, (p) => -proteinDensity(p.food))) break;
  }

  // Coarse count steps and calorie filling can overshoot protein. Reduce a
  // dense item when the day can stay above the lower tolerance, then refill
  // calories from lower-protein foods.
  guard = 0;
  while (dayPro() > proteinTargetG * PROTEIN_MAX_THRESHOLD && guard < 40) {
    guard++;
    let best: { pick: MealPick; mult: number; proteinDrop: number } | null = null;
    for (const meal of meals) {
      for (const pick of meal.picks) {
        if (pick.isProtected || pick.food.tags.includes("supplement")) continue;
        const mult = previousUsefulMult(pick);
        if (mult == null) continue;
        const cur = toScaledItem(pick.food, pick.mult);
        const previous = toScaledItem(pick.food, mult);
        if ((previous.amount ?? 0) < catalogSpec(pick.food).amount) continue;
        const proteinDrop = cur.protein - previous.protein;
        if (proteinDrop <= 0 || dayPro() - proteinDrop < proteinTargetG * PROTEIN_SHORT_THRESHOLD) continue;
        if (!best || proteinDrop > best.proteinDrop) best = { pick, mult, proteinDrop };
      }
    }
    if (!best) break;
    best.pick.mult = best.mult;
  }

  guard = 0;
  while (dayCal() < calorieTarget * SHORT_THRESHOLD && guard < 80) {
    guard++;
    if (!bump(
      (i) => i.calories,
      (p) => -proteinDensity(p.food) - (p.food.role === "protein" ? 20 : 0),
      proteinTargetG * PROTEIN_MAX_THRESHOLD
    )) break;
  }
}

function cloneBuiltMeals(meals: BuiltMeal[]): BuiltMeal[] {
  return meals.map((meal) => ({
    ...meal,
    cands: [...meal.cands],
    picks: meal.picks.map((pick) => ({ ...pick })),
  }));
}

function builtTotals(meals: BuiltMeal[]): { calories: number; protein: number } {
  return meals
    .flatMap((meal) => meal.picks)
    .map((pick) => toScaledItem(pick.food, pick.mult))
    .reduce(
      (total, item) => ({
        calories: total.calories + item.calories,
        protein: total.protein + item.protein,
      }),
      { calories: 0, protein: 0 }
    );
}

function previousRenderedMult(pick: MealPick): number | null {
  const current = toScaledItem(pick.food, pick.mult);
  const basis = catalogSpec(pick.food);
  for (let mult = pick.mult - MULT_STEP; mult >= MULT_MIN - 1e-9; mult -= MULT_STEP) {
    const snapped = snapMult(mult);
    const previous = toScaledItem(pick.food, snapped);
    if (previous.calories === current.calories && previous.protein === current.protein) continue;
    if ((previous.amount ?? 0) < basis.amount) return null;
    return snapped;
  }
  return null;
}

const EXTRA_ITEM_FAMILY_TAGS = [
  "egg",
  "chicken",
  "beef",
  "fish",
  "turkey",
  "soya",
  "lentil",
  "beans",
  "dairy",
  "nuts",
] as const;

function extraItemFamily(food: CatalogFood): string {
  const tag = EXTRA_ITEM_FAMILY_TAGS.find((candidate) => food.tags.includes(candidate));
  if (tag) return tag;
  if (food.role === "fruit") return "fruit";
  return food.staple ?? food.role;
}

function targetFailureCount(
  totals: { calories: number; protein: number },
  calorieTarget: number,
  proteinTargetG: number
): number {
  return Number(totals.calories < calorieTarget * SHORT_THRESHOLD) +
    Number(totals.calories > calorieTarget) +
    Number(totals.protein < proteinTargetG * PROTEIN_SHORT_THRESHOLD) +
    Number(totals.protein > proteinTargetG * PROTEIN_MAX_THRESHOLD);
}

function targetDistance(
  totals: { calories: number; protein: number },
  calorieTarget: number,
  proteinTargetG: number
): number {
  const calorieDistance = Math.abs(calorieTarget - totals.calories) / Math.max(calorieTarget, 1);
  const proteinDistance = Math.abs(proteinTargetG - totals.protein) / Math.max(proteinTargetG, 1);
  return calorieDistance + proteinDistance;
}

function dailyDairyGrams(meals: BuiltMeal[]): number {
  return meals
    .flatMap((meal) => meal.picks)
    .filter((pick) => pick.food.role === "dairy")
    .reduce((sum, pick) => {
      const item = toScaledItem(pick.food, pick.mult);
      return sum + (item.unitMode === "portion" ? item.amount ?? 0 : 0);
    }, 0);
}

/**
 * Make room for one repair item by reducing already-scaled, unprotected foods.
 * Prefer trimming low-protein carbs/sides, and first fix the meal that exceeds
 * its shape budget. Catalog serving floors remain intact.
 */
function rebalanceForExtraItem(
  meals: BuiltMeal[],
  extraPick: MealPick,
  calorieTarget: number
): boolean {
  const MEAL_FLEX = 1.1;
  let guard = 0;
  while (guard < 80) {
    guard++;
    const totals = builtTotals(meals);
    const overMeal = meals.find(
      (meal) =>
        meal.picks.reduce((sum, pick) => sum + toScaledItem(pick.food, pick.mult).calories, 0) >
        meal.budget * MEAL_FLEX
    );
    if (!overMeal && totals.calories <= calorieTarget) return true;

    const eligibleMeals = overMeal ? [overMeal] : meals;
    let best: { pick: MealPick; mult: number; score: number } | null = null;
    for (const meal of eligibleMeals) {
      for (const pick of meal.picks) {
        if (pick === extraPick || pick.isProtected || pick.food.tags.includes("supplement")) continue;
        const mult = previousRenderedMult(pick);
        if (mult == null) continue;
        const current = toScaledItem(pick.food, pick.mult);
        const previous = toScaledItem(pick.food, mult);
        const calorieDrop = current.calories - previous.calories;
        if (calorieDrop <= 0) continue;
        const proteinDrop = current.protein - previous.protein;
        const score =
          calorieDrop -
          proteinDrop * 12 +
          (pick.food.role === "carb" || pick.food.role === "fruit" || pick.food.role === "snack" ? 20 : 0);
        if (!best || score > best.score) best = { pick, mult, score };
      }
    }
    if (!best) return false;
    best.pick.mult = best.mult;
  }
  return false;
}

/**
 * A single composition repair after normal scaling. It trials one extra
 * curated candidate and keeps it only when the final target validation has
 * fewer failures. This avoids hiding genuinely infeasible plans with oversized
 * portions or unnecessary fourth dishes.
 */
function repairWithOneExtraItem(
  meals: BuiltMeal[],
  calorieTarget: number,
  proteinTargetG: number,
  filter: DietFilter,
  foodPreference: FoodPreference | null | undefined
): boolean {
  const baselineTotals = builtTotals(meals);
  const baselineFailures = targetFailureCount(baselineTotals, calorieTarget, proteinTargetG);
  if (baselineFailures === 0) return false;

  const proteinShort = baselineTotals.protein < proteinTargetG * PROTEIN_SHORT_THRESHOLD;
  const caloriesShort = baselineTotals.calories < calorieTarget * SHORT_THRESHOLD;
  if (!proteinShort && !caloriesShort) return false;

  const usedIds = new Set(meals.flatMap((meal) => meal.picks.map((pick) => pick.food.id)));
  const usedFamilies = new Set(meals.flatMap((meal) => meal.picks.map((pick) => extraItemFamily(pick.food))));
  // Flexitarian is capped at ONE meat/fish item per day across the main meals.
  // If the day already spent that allowance (anywhere, including the meal we are
  // repairing), no extra animal item may be added — only vegetarian proteins.
  const animalMainAlreadyUsed = meals.some(
    (meal) => FLEXITARIAN_MAIN_SLOTS.has(meal.slot) && builtMealHasAnimalFood(meal)
  );
  const candidates = meals.flatMap((meal, mealIndex) =>
    meal.picks.length >= 4
      ? []
      : meal.cands
          .filter((food) => !usedIds.has(food.id))
          .filter((food) => flexitarianFoodAllowed(food, filter, meal.slot, animalMainAlreadyUsed))
          .filter((food) => {
            if (proteinShort) {
              return food.role === "protein" || food.staple === "protein" || proteinDensity(food) >= 0.08;
            }
            return food.role === "carb" || food.role === "snack" || food.role === "fruit" || food.role === "dairy";
          })
          .map((food) => ({ mealIndex, food }))
  );

  candidates.sort((a, b) => {
    const duplicateA = usedFamilies.has(extraItemFamily(a.food)) ? 1 : 0;
    const duplicateB = usedFamilies.has(extraItemFamily(b.food)) ? 1 : 0;
    if (duplicateA !== duplicateB) return duplicateA - duplicateB;
    const preferenceA = fallbackPreferenceBonus(a.food, filter, foodPreference, meals[a.mealIndex].slot);
    const preferenceB = fallbackPreferenceBonus(b.food, filter, foodPreference, meals[b.mealIndex].slot);
    const utilityA = proteinShort ? proteinDensity(a.food) * 100 : a.food.calories / 20 - proteinDensity(a.food) * 10;
    const utilityB = proteinShort ? proteinDensity(b.food) * 100 : b.food.calories / 20 - proteinDensity(b.food) * 10;
    return preferenceB + utilityB - (preferenceA + utilityA) || a.food.id.localeCompare(b.food.id);
  });

  let best:
    | {
        meals: BuiltMeal[];
        failures: number;
        distance: number;
        duplicateFamily: boolean;
        addedCalories: number;
      }
    | null = null;

  for (const candidate of candidates) {
    const renderedAmounts = new Set<number>();
    const basis = catalogSpec(candidate.food);
    const constraint = plannerPortionConstraint(candidate.food, basis);
    const maxMult = Math.max(MULT_MAX, constraint.maxAmount / Math.max(basis.amount, 1));
    for (let mult = MULT_MIN; mult <= maxMult + 1e-9; mult += MULT_STEP) {
      const item = toScaledItem(candidate.food, snapMult(mult));
      const amount = item.amount ?? 0;
      if (renderedAmounts.has(amount)) continue;
      renderedAmounts.add(amount);

      const trial = cloneBuiltMeals(meals);
      const extraPick: MealPick = {
        food: candidate.food,
        mult: snapMult(mult),
        isProtected: false,
      };
      trial[candidate.mealIndex].picks.push(extraPick);
      if (dailyDairyGrams(trial) > 400) continue;
      if (!rebalanceForExtraItem(trial, extraPick, calorieTarget)) continue;

      scaleDayToTargets(trial, calorieTarget, proteinTargetG);
      if (dailyDairyGrams(trial) > 400) continue;
      const totals = builtTotals(trial);
      const failures = targetFailureCount(totals, calorieTarget, proteinTargetG);
      // Whey is the user's opted-in protein lever (it only reaches `candidates`
      // when protein powder is explicitly enabled). When protein is short, accept
      // a single shake that RAISES protein even if one serving can't fully clear
      // the threshold — but never when it would worsen the overall failure count
      // (e.g. tipping calories over). Non-whey items still must strictly reduce
      // failures, so we don't bloat meals with extra dishes that only narrow a gap.
      const wheyProteinBoost =
        proteinShort &&
        candidate.food.tags.includes("supplement") &&
        failures <= baselineFailures &&
        totals.protein > baselineTotals.protein;
      if (failures >= baselineFailures && !wheyProteinBoost) continue;

      const result = {
        meals: trial,
        failures,
        distance: targetDistance(totals, calorieTarget, proteinTargetG),
        duplicateFamily: usedFamilies.has(extraItemFamily(candidate.food)),
        addedCalories: item.calories,
      };
      if (
        !best ||
        result.failures < best.failures ||
        (result.failures === best.failures && Number(result.duplicateFamily) < Number(best.duplicateFamily)) ||
        (result.failures === best.failures &&
          result.duplicateFamily === best.duplicateFamily &&
          result.distance < best.distance - 1e-9) ||
        (result.failures === best.failures &&
          result.duplicateFamily === best.duplicateFamily &&
          Math.abs(result.distance - best.distance) < 1e-9 &&
          result.addedCalories < best.addedCalories)
      ) {
        best = result;
      }
    }
  }

  if (!best) return false;
  for (let index = 0; index < meals.length; index++) {
    meals[index].picks = best.meals[index].picks;
  }
  return true;
}

/** Slot calorie budgets that sum to EXACTLY the daily target (snack absorbs rounding). */
function slotBudgets(calorieTarget: number): { slot: MealSlot; title: string; cal: number }[] {
  const b = Math.round(calorieTarget * SLOT_META[0].pct);
  const l = Math.round(calorieTarget * SLOT_META[1].pct);
  const d = Math.round(calorieTarget * SLOT_META[2].pct);
  const s = Math.max(0, calorieTarget - b - l - d);
  return [
    { slot: "breakfast", title: "Breakfast", cal: b },
    { slot: "lunch", title: "Lunch", cal: l },
    { slot: "dinner", title: "Dinner", cal: d },
    { slot: "snack", title: "Snack", cal: s },
  ];
}

/**
 * A plan item from a catalog food at a portion multiplier. Amounts snap to
 * real-world units — whole counts (3 eggs, 2 roti) and 5g gram steps — and
 * always FLOOR, so rendered totals can never exceed what the builder budgeted.
 */
function toScaledItem(f: CatalogFood, mult: number): PlanMealItem {
  const s = catalogSpec(f);
  const constraint = plannerPortionConstraint(f, s);
  const amount = clampPlannerAmount(s.amount * mult, constraint);
  return {
    id: f.id,
    name: f.name,
    portion: f.portion,
    calories: Math.round(s.baseCalories * amount),
    protein: Math.round(s.baseProtein * amount),
    carbs: Math.round(s.baseCarbs * amount),
    fat: Math.round(s.baseFat * amount),
    unitMode: s.unitMode,
    baseCalories: s.baseCalories,
    baseProtein: s.baseProtein,
    baseCarbs: s.baseCarbs,
    baseFat: s.baseFat,
    amount,
    servingGrams: s.servingGrams,
    unit: s.unit,
  };
}

function finalizeMeal(b: BuiltMeal): PlanMeal {
  const items = b.picks.map((p) => toScaledItem(p.food, p.mult));
  return {
    slot: b.slot,
    title: b.title,
    items,
    calories: items.reduce((s, i) => s + i.calories, 0),
    protein: items.reduce((s, i) => s + i.protein, 0),
    budget: b.budget,
  };
}

/** Build a full day's plan that fits the targets. Deterministic for a given seed. */
export function buildPlan(input: {
  calorieTarget: number;
  proteinTargetG: number;
  filter: DietFilter;
  usual?: UsualMeals;
  seed?: number;
  // The food pool to build from. Diet Plan callers pass the curated pool.
  pool?: CatalogFood[];
  // Pool food ids the user actually logs a lot (learned from their food log).
  // Treated exactly like a "like" — a fill-time bonus that biases selection
  // toward familiar foods. Stacks with the typed "usual eating" likes.
  preferIds?: Set<string>;
  selectedIds?: Partial<Record<MealSlot, string[]>>;
  allowProteinPowder?: boolean;
  foodPreference?: FoodPreference | null;
}): DietPlan {
  const pool = input.pool ?? FOOD_CATALOG;
  const seed = input.seed ?? 1;
  const rng = mulberry32(seed);

  // Degenerate guard: without a positive calorie target there is nothing to
  // build — return an honest empty plan instead of four hollow meals with no
  // flags (the action layer refuses earlier; this protects the pure API).
  if (!Number.isFinite(input.calorieTarget) || input.calorieTarget <= 0) {
    return withValidation({
      meals: slotBudgets(0).map((s) => ({ slot: s.slot, title: s.title, items: [], calories: 0, protein: 0, budget: 0 })),
      calorieTarget: input.calorieTarget,
      proteinTargetG: input.proteinTargetG,
      totalCalories: 0,
      totalProtein: 0,
      filter: input.filter,
      proteinShort: input.proteinTargetG > 0,
      caloriesShort: true,
      seed,
      foodPreference: input.foodPreference ?? null,
      allowProteinPowder: input.allowProteinPowder === true,
    }, pool);
  }

  // Likes (a fill-time bonus) come from go-to foods AND keep foods, PLUS the
  // foods the user logs most (preferIds, learned from their food log).
  const likeText = [input.usual?.foods, input.usual?.keep].filter(Boolean).join(" ");
  const likeIds = new Set(
    likeText ? pool.filter((f) => mentioned(f, likeText)).map((f) => f.id) : []
  );
  for (const id of input.preferIds ?? []) likeIds.add(id);

  // Whey/supplements are auto-plannable ONLY when the user's usual diet
  // mentions them (e.g. "whey shake after gym") — and stay swappable like any
  // item. Otherwise they never enter a generated plan.
  const usualAll = [
    input.usual?.breakfast,
    input.usual?.lunch,
    input.usual?.dinner,
    input.usual?.foods,
    input.usual?.keep,
  ]
    .filter(Boolean)
    .join(" ");
  const allowProteinPowder =
    input.allowProteinPowder ?? explicitProteinPowderOptIn(usualAll);

  const usedCounts = new Map<string, number>();
  let animalMainUsed = false;
  const built: BuiltMeal[] = slotBudgets(input.calorieTarget).map((s) => {
    const slotProtein = input.proteinTargetG * PROTEIN_SHARE[s.slot];
    const cands = pool.filter(
      (f) =>
        f.slots.includes(s.slot) &&
        (allowedForAutoPlan(f, input.filter) ||
          (f.tags.includes("supplement") &&
            allowed(f, input.filter) &&
            allowProteinPowder)) &&
        flexitarianFoodAllowed(f, input.filter, s.slot, animalMainUsed)
    );
    // Seed from this slot's usual meal PLUS any "keep" foods (keep applies to
    // every slot the food fits).
    const usualText =
      [usualForSlot(input.usual, s.slot), input.usual?.keep].filter(Boolean).join(" ") || undefined;
    const picks = buildSimpleMeal(
      s.cal,
      slotProtein,
      s.slot,
      cands,
      input.filter,
      rng,
      input.selectedIds?.[s.slot],
      usualText,
      likeIds,
      usedCounts,
      input.foodPreference
    );
    for (const pick of picks) {
      usedCounts.set(pick.food.id, (usedCounts.get(pick.food.id) ?? 0) + 1);
    }
    if (FLEXITARIAN_MAIN_SLOTS.has(s.slot) && picks.some((pick) => isAnimalFood(pick.food))) {
      animalMainUsed = true;
    }
    return { slot: s.slot, title: s.title, budget: s.cal, cands, picks };
  });

  // The user's "keep" text applies to every slot, which would put an opted-in
  // whey shake in several meals. One scoop a day is the sensible read: keep the
  // FIRST occurrence, drop the rest (still swappable/addable like any item).
  let supplementSeen = false;
  for (const m of built) {
    m.picks = m.picks.filter((p) => {
      if (!p.food.tags.includes("supplement")) return true;
      if (supplementSeen) return false;
      supplementSeen = true;
      return true;
    });
  }

  // Scale portions toward the targets (protein first, then calories) — grow
  // resizing the simple plate first; a bounded repair may then add one item.
  scaleDayToTargets(built, input.calorieTarget, input.proteinTargetG);
  repairWithOneExtraItem(
    built,
    input.calorieTarget,
    input.proteinTargetG,
    input.filter,
    input.foodPreference
  );

  const meals = built.map(finalizeMeal);
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return withValidation({
    meals,
    calorieTarget: input.calorieTarget,
    proteinTargetG: input.proteinTargetG,
    totalCalories,
    totalProtein,
    filter: input.filter,
    proteinShort: totalProtein < input.proteinTargetG * PROTEIN_SHORT_THRESHOLD,
    caloriesShort: totalCalories < input.calorieTarget * SHORT_THRESHOLD,
    seed,
    foodPreference: input.foodPreference ?? null,
    allowProteinPowder,
  }, pool);
}

/**
 * Legacy name-selection bridge: build a day from a per-slot list of food names.
 * The names are fed into the SAME
 * deterministic engine as buildPlan — they SEED each meal (matched to real
 * catalog foods via `mentioned`; an avoided food can never slip in), then the
 * math layer sizes portions to hit the targets within tolerance. Unmatched names
 * simply don't seed and the deterministic builder fills the gap (protein + carb +
 * side), so the plan is always complete, accurate (DB macros — never the
 * selector's), and within the calorie cap.
 *
 * The user's real `usual`/`keep` foods are MERGED in (and keep stays protected),
 * so Groq's picks never erase the comfort foods the user asked to keep.
 * Pure + deterministic.
 */
export type SelectedNames = Partial<Record<MealSlot, string[]>>;
export type SelectedIds = Partial<Record<MealSlot, string[]>>;

/** Build from already-validated catalog ids without fuzzy name matching. */
export function buildPlanFromSelectionIds(
  ids: SelectedIds,
  input: {
    calorieTarget: number;
    proteinTargetG: number;
    filter: DietFilter;
    usual?: UsualMeals;
    pool?: CatalogFood[];
    seed?: number;
    preferIds?: Set<string>;
    allowProteinPowder?: boolean;
    foodPreference?: FoodPreference | null;
  }
): DietPlan {
  return buildPlan({
    ...input,
    selectedIds: ids,
  });
}

export function buildPlanFromSelection(
  names: SelectedNames,
  input: {
    calorieTarget: number;
    proteinTargetG: number;
    filter: DietFilter;
    usual?: UsualMeals; // the user's real usual/keep — merged with the selection
    pool?: CatalogFood[];
    seed?: number;
    preferIds?: Set<string>;
    allowProteinPowder?: boolean;
    foodPreference?: FoodPreference | null;
  }
): DietPlan {
  const base = input.usual ?? {};
  // Combine the user's existing slot text with the selector's names for that slot.
  const merge = (existing: string | undefined, picks: string[] | undefined): string | undefined =>
    [existing, picks?.length ? picks.join(", ") : undefined].filter(Boolean).join(", ") || undefined;
  const allNames = (["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).flatMap((s) => names[s] ?? []);

  const usual: UsualMeals = {
    breakfast: merge(base.breakfast, names.breakfast),
    lunch: merge(base.lunch, names.lunch),
    dinner: merge(base.dinner, names.dinner),
    // Snacks are fruit by design (buildPlan ignores a "usual" snack); every name
    // also goes into `foods` so the fill-time like-bonus leans toward them.
    foods: merge(base.foods, allNames),
    keep: base.keep, // preserved + protected (never swapped out)
  };

  return buildPlan({
    calorieTarget: input.calorieTarget,
    proteinTargetG: input.proteinTargetG,
    filter: input.filter,
    usual,
    pool: input.pool,
    seed: input.seed,
    preferIds: input.preferIds,
    allowProteinPowder: input.allowProteinPowder,
    foodPreference: input.foodPreference,
  });
}

/** Re-select a single meal (used by "swap this meal"). No usual-food seed, so it varies. */
export function swapMeal(
  plan: DietPlan,
  slot: MealSlot,
  newSeed: number,
  pool: CatalogFood[] = FOOD_CATALOG,
  preferIds: Set<string> = new Set()
): DietPlan {
  const target = plan.meals.find((m) => m.slot === slot);
  if (!target) return plan;
  const meta = SLOT_META.find((x) => x.slot === slot)!;
  const rng = mulberry32(newSeed);
  const budget = target.budget;
  const slotProtein = plan.proteinTargetG * PROTEIN_SHARE[slot];
  const cands = pool.filter(
    (f) =>
      f.slots.includes(slot) &&
      (allowedForAutoPlan(f, plan.filter) ||
        (plan.allowProteinPowder === true &&
          f.tags.includes("supplement") &&
          allowed(f, plan.filter))) &&
      flexitarianFoodAllowed(
        f,
        plan.filter,
        slot,
        plan.meals.some(
          (meal) =>
            meal.slot !== slot &&
            FLEXITARIAN_MAIN_SLOTS.has(meal.slot) &&
            mealHasAnimalFood(meal, pool)
        )
      )
  );
  const usedCounts = new Map<string, number>();
  for (const meal of plan.meals) {
    if (meal.slot === slot) continue;
    for (const item of meal.items) {
      usedCounts.set(item.id, (usedCounts.get(item.id) ?? 0) + 1);
    }
  }
  // Bias the fresh selection toward the foods the user logs most.
  const picks = buildSimpleMeal(
    budget,
    slotProtein,
    slot,
    cands,
    plan.filter,
    rng,
    undefined,
    undefined,
    preferIds,
    usedCounts,
    plan.foodPreference
  );

  const meal = finalizeMeal({ slot, title: meta.title, budget, cands, picks });
  const meals = plan.meals.map((m) => (m.slot === slot ? meal : m));
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return withValidation({
    ...plan,
    meals,
    totalCalories,
    totalProtein,
    proteinShort: totalProtein < plan.proteinTargetG * PROTEIN_SHORT_THRESHOLD,
    caloriesShort: totalCalories < plan.calorieTarget * SHORT_THRESHOLD,
  }, pool);
}

/**
 * "Fit to what's left": rebuild ONLY the meals the user hasn't eaten yet so they
 * fit today's REMAINING calories/protein. Eaten slots are frozen; the un-eaten
 * slots get fresh budgets (their day-shares re-normalised to sum to the remaining
 * calories) and are rebuilt + portion-scaled toward the remaining targets, never
 * exceeding them (the scaler's hard cap becomes the remaining-calorie cap over
 * this subset). Deterministic for a seed. Pure (no DB/AI).
 *
 * No-op when there's nothing left to plan (every meal eaten) or no room left
 * (remaining calories ≤ 0) — the UI says "you've hit your target" instead.
 */
export function replanRemaining(
  plan: DietPlan,
  remaining: { calories: number; proteinG: number },
  eatenSlots: MealSlot[],
  pool: CatalogFood[] = FOOD_CATALOG,
  seed = 1,
  preferIds: Set<string> = new Set()
): DietPlan {
  const eaten = new Set(eatenSlots);
  const remCal = Math.max(0, Math.round(remaining.calories));
  const remPro = Math.max(0, Math.round(remaining.proteinG));
  const openMeta = SLOT_META.filter((m) => !eaten.has(m.slot));
  if (openMeta.length === 0 || remCal <= 0) return plan;

  const rng = mulberry32(seed);

  // Re-normalise the day-share % of the un-eaten slots so their new budgets sum
  // to EXACTLY the remaining calories (last open slot absorbs rounding).
  const pctSum = openMeta.reduce((s, m) => s + m.pct, 0) || 1;
  let acc = 0;
  const budgets = openMeta.map((m, i) => {
    const cal = i === openMeta.length - 1 ? Math.max(0, remCal - acc) : Math.round(remCal * (m.pct / pctSum));
    acc += cal;
    return { slot: m.slot, title: m.title, cal };
  });

  // Split remaining protein across the open slots by their protein shares. If
  // only zero-protein slots remain (e.g. just snack), every slot targets 0 and
  // we just fill calories.
  const proShareSum = openMeta.reduce((s, m) => s + PROTEIN_SHARE[m.slot], 0);

  const usedCounts = new Map<string, number>();
  let animalMainUsed = plan.meals.some(
    (meal) =>
      eaten.has(meal.slot) &&
      FLEXITARIAN_MAIN_SLOTS.has(meal.slot) &&
      mealHasAnimalFood(meal, pool)
  );
  for (const meal of plan.meals) {
    if (!eaten.has(meal.slot)) continue;
    for (const item of meal.items) {
      usedCounts.set(item.id, (usedCounts.get(item.id) ?? 0) + 1);
    }
  }
  const built: BuiltMeal[] = budgets.map((b) => {
    const slotProtein = proShareSum > 0 ? remPro * (PROTEIN_SHARE[b.slot] / proShareSum) : 0;
    const cands = pool.filter(
      (f) =>
        f.slots.includes(b.slot) &&
        (allowedForAutoPlan(f, plan.filter) ||
          (plan.allowProteinPowder === true &&
            f.tags.includes("supplement") &&
            allowed(f, plan.filter))) &&
        flexitarianFoodAllowed(f, plan.filter, b.slot, animalMainUsed)
    );
    const picks = buildSimpleMeal(
      b.cal,
      slotProtein,
      b.slot,
      cands,
      plan.filter,
      rng,
      undefined,
      undefined,
      preferIds,
      usedCounts,
      plan.foodPreference
    );
    for (const pick of picks) {
      usedCounts.set(pick.food.id, (usedCounts.get(pick.food.id) ?? 0) + 1);
    }
    if (FLEXITARIAN_MAIN_SLOTS.has(b.slot) && picks.some((pick) => isAnimalFood(pick.food))) {
      animalMainUsed = true;
    }
    return { slot: b.slot, title: b.title, budget: b.cal, cands, picks };
  });

  scaleDayToTargets(built, remCal, remPro);
  repairWithOneExtraItem(built, remCal, remPro, plan.filter, plan.foodPreference);

  const rebuilt = new Map(built.map((b) => [b.slot, finalizeMeal(b)]));
  const meals = plan.meals.map((m) => (eaten.has(m.slot) ? m : rebuilt.get(m.slot) ?? m));
  return recompute({ ...plan, meals }, pool);
}

/** Validate a swap target id belongs to the catalog (defensive for stored data). */
export function isKnownFood(id: string): boolean {
  return id in CATALOG_BY_ID;
}

// --- per-item editing (Phase 3) --------------------------------------------
// All pure + deterministic. Adds may push the day OVER target (a deliberate user
// choice) — totals/flags are recomputed honestly so the UI can surface it.

/** Recompute every meal's + the day's totals/flags from the current items. */
function recompute(plan: DietPlan, pool: CatalogFood[] = FOOD_CATALOG): DietPlan {
  const meals = plan.meals.map((m) => ({
    ...m,
    calories: sumItemsCal(m.items),
    protein: sumItemsPro(m.items),
  }));
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return withValidation({
    ...plan,
    meals,
    totalCalories,
    totalProtein,
    proteinShort: totalProtein < plan.proteinTargetG * PROTEIN_SHORT_THRESHOLD,
    caloriesShort: totalCalories < plan.calorieTarget * SHORT_THRESHOLD,
  }, pool);
}

/**
 * Apply the current profile preference to a saved plan. Disabling powder strips
 * any legacy whey row immediately and recomputes totals/validation.
 */
export function setPlanProteinPowderAccess(
  plan: DietPlan,
  allowProteinPowder: boolean,
  pool: CatalogFood[] = FOOD_CATALOG
): DietPlan {
  const meals = allowProteinPowder
    ? plan.meals
    : plan.meals.map((meal) => ({
        ...meal,
        items: meal.items.filter((item) => {
          const food = pool.find((candidate) => candidate.id === item.id) ?? CATALOG_BY_ID[item.id];
          return !food?.tags.includes("supplement");
        }),
      }));
  return recompute({ ...plan, meals, allowProteinPowder }, pool);
}

/**
 * Apply the profile diet mode to a saved plan. Explicit modes are authoritative;
 * legacy unknown users keep any stricter saved vegetarian override.
 */
export function setPlanDietMode(
  plan: DietPlan,
  dietMode: ResolvedDietMode,
  pool: CatalogFood[] = FOOD_CATALOG,
  authoritative = true
): DietPlan {
  const vegetarian =
    dietMode === "vegetarian" ||
    (!authoritative && plan.filter.vegetarian);
  // Flexitarian keeps the day's single allowed meat/fish ITEM (the first one in a
  // main meal) and strips every other animal item — including a second item that a
  // legacy non-veg plan stacked in the same meal.
  let animalItemKept = false;
  const meals = plan.meals.map((meal) => {
    if (dietMode === "non_veg" && !vegetarian) return meal;
    const mainSlot = FLEXITARIAN_MAIN_SLOTS.has(meal.slot);
    const items = meal.items.filter((item) => {
      const food = pool.find((candidate) => candidate.id === item.id) ?? CATALOG_BY_ID[item.id];
      if (!food || !isAnimalFood(food)) return true; // non-animal items always stay
      if (vegetarian) return false; // vegetarian: drop all meat/fish
      // flexitarian: keep only the first animal item, and only in a main slot
      if (dietMode === "flexitarian" && mainSlot && !animalItemKept) {
        animalItemKept = true;
        return true;
      }
      return false;
    });
    return items.length === meal.items.length ? meal : { ...meal, items };
  });
  return recompute({
    ...plan,
    meals,
    filter: {
      ...plan.filter,
      vegetarian,
      dietMode,
    },
  }, pool);
}

const sumItemsCal = (items: PlanMealItem[]) => items.reduce((s, i) => s + i.calories, 0);
const sumItemsPro = (items: PlanMealItem[]) => items.reduce((s, i) => s + i.protein, 0);
const mealAt = (plan: DietPlan, slot: MealSlot) => plan.meals.find((m) => m.slot === slot);
const withMeal = (plan: DietPlan, slot: MealSlot, items: PlanMealItem[], pool: CatalogFood[] = FOOD_CATALOG): DietPlan =>
  recompute({ ...plan, meals: plan.meals.map((m) => (m.slot === slot ? { ...m, items } : m)) }, pool);

/** Remove one item (by index) from a meal. */
export function removePlanItem(plan: DietPlan, slot: MealSlot, index: number): DietPlan {
  const meal = mealAt(plan, slot);
  if (!meal || index < 0 || index >= meal.items.length) return plan;
  return withMeal(plan, slot, meal.items.filter((_, i) => i !== index));
}

/** Insert one item back into a meal (used by remove undo). */
export function insertPlanItem(plan: DietPlan, slot: MealSlot, index: number, item: PlanMealItem): DietPlan {
  const meal = mealAt(plan, slot);
  if (!meal) return plan;
  const food = CATALOG_BY_ID[item.id];
  if (
    food &&
    !allowedForPlanOperation(
      food,
      plan.filter,
      plan.allowProteinPowder === true,
      slot,
      plan
    )
  ) return plan;
  const safeIndex = Math.max(0, Math.min(index, meal.items.length));
  return withMeal(plan, slot, [
    ...meal.items.slice(0, safeIndex),
    item,
    ...meal.items.slice(safeIndex),
  ]);
}

/** Add a pool food to a meal. Never adds an avoided food. */
export function addPlanItem(plan: DietPlan, slot: MealSlot, foodId: string, pool: CatalogFood[] = FOOD_CATALOG): DietPlan {
  const food = pool.find((f) => f.id === foodId) ?? CATALOG_BY_ID[foodId];
  const meal = mealAt(plan, slot);
  if (
    !food ||
    !meal ||
    !allowedForPlanOperation(
      food,
      plan.filter,
      plan.allowProteinPowder === true,
      slot,
      plan
    )
  ) return plan;
  return withMeal(plan, slot, [...meal.items, toItem(food)], pool);
}

/** Resolve a quantity spec for any plan item: stored fields → catalog → custom. */
export function planItemSpec(item: PlanMealItem): ItemQtySpec {
  if (item.unitMode && item.baseCalories != null && item.amount != null) {
    return {
      unitMode: item.unitMode,
      baseCalories: item.baseCalories,
      baseProtein: item.baseProtein ?? 0,
      baseCarbs: item.baseCarbs ?? 0,
      baseFat: item.baseFat ?? 0,
      amount: item.amount,
      servingGrams: item.servingGrams ?? null,
      unit: item.unit ?? "",
    };
  }
  const cat = CATALOG_BY_ID[item.id];
  if (cat) return catalogSpec(cat);
  if (item.portion && item.portion !== "as entered") {
    return catalogSpec({
      name: item.name,
      portion: item.portion,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
  }
  // Custom/approx item with no catalog grounding — treat its macros as one unit.
  return {
    unitMode: "count",
    baseCalories: item.calories,
    baseProtein: item.protein,
    baseCarbs: item.carbs,
    baseFat: item.fat,
    amount: 1,
    servingGrams: null,
    unit: "",
  };
}

/** Set how much of a plan item — recompute its macros (base × amount) + totals. */
export function setPlanItemAmount(plan: DietPlan, slot: MealSlot, index: number, amount: number): DietPlan {
  const meal = mealAt(plan, slot);
  const item = meal?.items[index];
  if (!meal || !item) return plan;
  const a = Math.max(1, Math.round(amount)); // grams or units, ≥ 1
  const s = planItemSpec(item);
  const next: PlanMealItem = {
    ...item,
    unitMode: s.unitMode,
    baseCalories: s.baseCalories,
    baseProtein: s.baseProtein,
    baseCarbs: s.baseCarbs,
    baseFat: s.baseFat,
    servingGrams: s.servingGrams,
    unit: s.unit,
    amount: a,
    calories: Math.round(s.baseCalories * a),
    protein: Math.round(s.baseProtein * a),
    carbs: Math.round(s.baseCarbs * a),
    fat: Math.round(s.baseFat * a),
  };
  const items = meal.items.map((it, i) => (i === index ? next : it));
  return withMeal(plan, slot, items);
}

/**
 * Override a plan item's exact calories/protein (stored as per-unit base at the
 * current amount, like the food log) — recomputes item + meal + day totals.
 */
export function setPlanItemMacros(
  plan: DietPlan,
  slot: MealSlot,
  index: number,
  patch: { calories: number; protein_g: number }
): DietPlan {
  const meal = mealAt(plan, slot);
  const item = meal?.items[index];
  if (!meal || !item) return plan;
  const s = planItemSpec(item);
  const amount = s.amount > 0 ? s.amount : 1;
  const cal = Math.max(0, Math.round(patch.calories));
  const pro = Math.max(0, Math.round(patch.protein_g));
  const next: PlanMealItem = {
    ...item,
    unitMode: s.unitMode,
    baseCalories: cal / amount,
    baseProtein: pro / amount,
    baseCarbs: s.baseCarbs,
    baseFat: s.baseFat,
    servingGrams: s.servingGrams,
    unit: s.unit,
    amount,
    calories: cal,
    protein: pro,
    carbs: Math.round(s.baseCarbs * amount),
    fat: Math.round(s.baseFat * amount),
  };
  return withMeal(plan, slot, meal.items.map((it, i) => (i === index ? next : it)));
}

/** Append a pre-built item (e.g. an AI-estimated, approximate free-typed food). */
export function appendPlanItem(plan: DietPlan, slot: MealSlot, item: PlanMealItem): DietPlan {
  const meal = mealAt(plan, slot);
  if (!meal) return plan;
  return withMeal(plan, slot, [...meal.items, item]);
}

/**
 * Swap one item for a SIMILAR catalog food (same role + closest calories) that
 * fits the slot budget and the avoid filter, never duplicating the meal's items.
 * Deterministic for a seed. No-op for a custom item, or when nothing fits.
 */
export function swapPlanItem(
  plan: DietPlan,
  slot: MealSlot,
  index: number,
  newSeed: number,
  pool: CatalogFood[] = FOOD_CATALOG,
  preferIds: Set<string> = new Set()
): DietPlan {
  const meal = mealAt(plan, slot);
  const item = meal?.items[index];
  if (!meal || !item) return plan;
  const current = pool.find((f) => f.id === item.id) ?? CATALOG_BY_ID[item.id];
  if (!current) return plan; // custom/approx item — can't ground a swap

  const rng = mulberry32(newSeed);
  const otherCal = meal.calories - item.calories;
  const used = new Set(meal.items.map((i) => i.id));
  const base = (extra: (f: CatalogFood) => boolean) =>
    pool.filter(
      (f) =>
        f.slots.includes(slot) &&
        allowedForPlanOperation(
          f,
          plan.filter,
          plan.allowProteinPowder === true,
          slot,
          plan
        ) &&
        !used.has(f.id) &&
        otherCal + f.calories <= meal.budget && // keep the meal within its budget
        extra(f)
    );
  const rolePool = base((f) => f.role === current.role);
  const finalPool = rolePool.length ? rolePool : base(() => true);
  if (finalPool.length === 0) return plan;

  // Closeness to the current calories + protein density, plus a nudge toward
  // foods the user logs a lot (preferIds). Higher is better.
  const score = (f: CatalogFood) =>
    -Math.abs(f.calories - item.calories) / 10 +
    proteinDensity(f) * 40 +
    (preferIds.has(f.id) ? 15 : 0) +
    regionBonus(f, plan.filter);

  // Rotate WIDELY: sort by score, then let the seed pick anywhere in the top 25
  // (not always the same best 3) — repeated swaps walk through many options.
  const sorted = [...finalPool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const pick = sorted[Math.floor(rng() * Math.min(sorted.length, 25))];
  if (!pick) return plan;
  return withMeal(plan, slot, meal.items.map((it, i) => (i === index ? toItem(pick) : it)), pool);
}

/** Deterministic pool search for the "add food" picker (respects the filter). */
export function searchCatalog(
  query: string,
  filter: DietFilter,
  slot?: MealSlot,
  pool: CatalogFood[] = FOOD_CATALOG,
  allowProteinPowder = false,
  plan?: Pick<DietPlan, "meals">
): CatalogFood[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return pool.filter((f) => {
    if (!allowedForPlanOperation(f, filter, allowProteinPowder, slot, plan)) return false;
    if (slot && !f.slots.includes(slot)) return false;
    const hay = `${f.name} ${f.tags.join(" ")} ${(f.aliases ?? []).join(" ")}`.toLowerCase();
    return tokens.every((tok) => hay.includes(tok));
  }).slice(0, 12);
}

/** Best deterministic pool match for free-typed text, or null if none. */
export function bestCatalogMatch(
  text: string,
  filter: DietFilter,
  slot?: MealSlot,
  pool: CatalogFood[] = FOOD_CATALOG,
  allowProteinPowder = false,
  plan?: Pick<DietPlan, "meals">
): CatalogFood | null {
  if (!allowProteinPowder && explicitProteinPowderOptIn(text)) return null;
  const fitsSlot = (f: CatalogFood) => !slot || f.slots.includes(slot);
  const match =
    pool.find(
      (f) =>
        fitsSlot(f) &&
        allowedForPlanOperation(f, filter, allowProteinPowder, slot, plan) &&
        mentioned(f, text)
    ) ?? null;

  // Anti-substitution guard: if the user clearly typed a meat/fish dish that the
  // diet mode blocks (vegetarian, or a flexitarian day that already used its one
  // meat/fish main), do NOT silently swap in a vegetarian food that merely shares
  // a generic token ("curry", "aloo"). Reject so the caller shows "not available".
  const matchScore = match ? mentionScore(match, text) : 0;
  const namesBlockedAnimal = pool.some(
    (f) =>
      isAnimalFood(f) &&
      fitsSlot(f) &&
      mentioned(f, text) &&
      allowedIgnoringDietAnimal(f, filter, allowProteinPowder) &&
      !allowedForPlanOperation(f, filter, allowProteinPowder, slot, plan) &&
      mentionScore(f, text) > matchScore
  );
  if (namesBlockedAnimal) return null;
  return match;
}

// --- helpers ----------------------------------------------------------------

function usualForSlot(usual: UsualMeals | undefined, slot: MealSlot): string | undefined {
  if (!usual) return undefined;
  if (slot === "breakfast") return usual.breakfast;
  if (slot === "lunch") return usual.lunch;
  if (slot === "dinner") return usual.dinner;
  return undefined; // snack has no "usual" capture
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// Small deterministic PRNG (mulberry32) so seeds reproduce plans exactly.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
