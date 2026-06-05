import type { FoodPreference } from "@/lib/database.types";
import { FOOD_CATALOG, CATALOG_BY_ID, type CatalogFood, type MealSlot } from "./foodCatalog.ts";

/**
 * Deterministic diet-plan generator (Phase 4).
 *
 * Pure functions (no DB, no AI). Splits the daily calorie target across meals,
 * then greedily SELECTS foods from the owned catalog to fill each meal's slot
 * while pushing toward the protein target and respecting preferences (veg,
 * excluded foods, a soft cuisine lean). A seed makes it deterministic but lets
 * "regenerate" / "swap" produce variety. No hardcoded menus — plans are built.
 *
 * Budget/cost is intentionally out of scope for now (deferred), so selection
 * optimises protein + calorie-fit, not protein-per-rupee.
 */

export interface DietFilter {
  vegetarian: boolean;
  excludeTags: string[]; // foods carrying ANY of these tags are removed (e.g. "beef")
  regionFocus: "desi" | "western" | null; // soft lean, not a hard filter
}

export interface PlanMealItem {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PlanMeal {
  slot: MealSlot;
  title: string;
  items: PlanMealItem[];
  calories: number;
  protein: number;
}

export interface DietPlan {
  meals: PlanMeal[];
  calorieTarget: number;
  proteinTargetG: number;
  totalCalories: number;
  totalProtein: number;
  filter: DietFilter;
  seed: number;
}

const SLOTS: { slot: MealSlot; title: string; pct: number }[] = [
  { slot: "breakfast", title: "Breakfast", pct: 0.25 },
  { slot: "lunch", title: "Lunch", pct: 0.35 },
  { slot: "dinner", title: "Dinner", pct: 0.3 },
  { slot: "snack", title: "Snack", pct: 0.1 },
];

// --- preferences ------------------------------------------------------------

/** Build a filter from the saved food preference + any AI-parsed extras. */
export function filterFromPreference(
  pref: FoodPreference | null,
  extra?: Partial<DietFilter>
): DietFilter {
  const base: DietFilter = { vegetarian: pref === "veg_limited", excludeTags: [], regionFocus: null };
  return {
    vegetarian: extra?.vegetarian ?? base.vegetarian,
    regionFocus: extra?.regionFocus ?? base.regionFocus,
    excludeTags: dedupe([...base.excludeTags, ...(extra?.excludeTags ?? [])]),
  };
}

// --- core -------------------------------------------------------------------

function allowed(food: CatalogFood, filter: DietFilter): boolean {
  if (filter.vegetarian && !food.vegetarian) return false;
  if (food.tags.some((t) => filter.excludeTags.includes(t))) return false;
  return true;
}

const toItem = (f: CatalogFood): PlanMealItem => ({
  id: f.id,
  name: f.name,
  portion: f.portion,
  calories: f.calories,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
});

/** Pick the highest-scoring of the top few candidates (rng adds safe variety). */
function chooseTop(
  cands: CatalogFood[],
  score: (f: CatalogFood) => number,
  rng: () => number,
  topN = 3
): CatalogFood | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const n = Math.min(topN, sorted.length);
  return sorted[Math.floor(rng() * n)];
}

function buildMeal(
  slot: MealSlot,
  title: string,
  slotCal: number,
  slotProtein: number,
  filter: DietFilter,
  rng: () => number
): PlanMeal {
  const cands = FOOD_CATALOG.filter((f) => f.slots.includes(slot) && allowed(f, filter));
  const chosen: CatalogFood[] = [];
  let cal = 0;
  let pro = 0;

  const regionBonus = (f: CatalogFood) => (filter.regionFocus && f.region === filter.regionFocus ? 3 : 0);

  // 1) Anchor a real meal with a protein source (snacks skip this).
  if (slot !== "snack") {
    const proteins = cands.filter((f) => f.role === "protein");
    const anchor = chooseTop(
      proteins,
      (f) => f.protein + regionBonus(f) - overshoot(f.calories, slotCal * 0.75),
      rng
    );
    if (anchor) {
      chosen.push(anchor);
      cal += anchor.calories;
      pro += anchor.protein;
    }
  }

  // 2) Fill toward the slot's calorie target, adding protein where still short.
  const maxItems = slot === "snack" ? 2 : 4;
  let guard = 0;
  while (cal < slotCal * 0.9 && chosen.length < maxItems && guard < 20) {
    guard++;
    const remaining = slotCal - cal;
    const pool = cands.filter((f) => !chosen.includes(f) && f.calories <= remaining * 1.35);
    if (pool.length === 0) break;
    const needProtein = pro < slotProtein;
    const pick = chooseTop(
      pool,
      (f) => -Math.abs(remaining - f.calories) / 20 + (needProtein ? f.protein * 0.6 : 0) + regionBonus(f),
      rng
    );
    if (!pick) break;
    chosen.push(pick);
    cal += pick.calories;
    pro += pick.protein;
  }

  return { slot, title, items: chosen.map(toItem), calories: Math.round(cal), protein: Math.round(pro) };
}

/** Build a full day's plan. Deterministic for a given seed. */
export function buildPlan(input: {
  calorieTarget: number;
  proteinTargetG: number;
  filter: DietFilter;
  seed?: number;
}): DietPlan {
  const seed = input.seed ?? 1;
  const rng = mulberry32(seed);
  const meals = SLOTS.map((s) =>
    buildMeal(s.slot, s.title, input.calorieTarget * s.pct, input.proteinTargetG * s.pct, input.filter, rng)
  );
  return {
    meals,
    calorieTarget: input.calorieTarget,
    proteinTargetG: input.proteinTargetG,
    totalCalories: meals.reduce((s, m) => s + m.calories, 0),
    totalProtein: meals.reduce((s, m) => s + m.protein, 0),
    filter: input.filter,
    seed,
  };
}

/** Re-select a single meal (used by "swap this meal"). */
export function swapMeal(plan: DietPlan, slot: MealSlot, newSeed: number): DietPlan {
  const s = SLOTS.find((x) => x.slot === slot);
  if (!s) return plan;
  const rng = mulberry32(newSeed);
  const meal = buildMeal(s.slot, s.title, plan.calorieTarget * s.pct, plan.proteinTargetG * s.pct, plan.filter, rng);
  const meals = plan.meals.map((m) => (m.slot === slot ? meal : m));
  return {
    ...plan,
    meals,
    totalCalories: meals.reduce((acc, m) => acc + m.calories, 0),
    totalProtein: meals.reduce((acc, m) => acc + m.protein, 0),
  };
}

/** Validate a swap target id belongs to the catalog (defensive for stored data). */
export function isKnownFood(id: string): boolean {
  return id in CATALOG_BY_ID;
}

// --- helpers ----------------------------------------------------------------

function overshoot(cal: number, target: number): number {
  return cal > target ? (cal - target) / 50 : 0;
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
