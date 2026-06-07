import type { FoodPreference } from "@/lib/database.types";
import { FOOD_CATALOG, CATALOG_BY_ID, type CatalogFood, type MealSlot } from "./foodCatalog.ts";

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
  excludeTags: string[]; // whole categories to remove (e.g. "beef") — matched on tags
  excludeFoods: string[]; // SPECIFIC foods to avoid, free text (e.g. "whey protein shake")
  regionFocus: "desi" | "western" | null; // soft lean, not a hard filter
}

/** The user's usual meals (free text), used to seed the plan. */
export interface UsualMeals {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  foods?: string; // foods they eat a lot (likes) — preferred when filling
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
  budget: number; // this meal's calorie budget (so the UI can show fit)
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
}

// Below this fraction of the calorie target, the plan is "unbuildable" with the
// current restrictions (normal plans land ≥90%). Used to surface a clear nudge.
const SHORT_THRESHOLD = 0.85;

const SLOT_META: { slot: MealSlot; title: string; pct: number }[] = [
  { slot: "breakfast", title: "Breakfast", pct: 0.25 },
  { slot: "lunch", title: "Lunch", pct: 0.35 },
  { slot: "dinner", title: "Dinner", pct: 0.3 },
  { slot: "snack", title: "Snack", pct: 0.1 },
];

const FILL_TO = 0.95; // try to fill at least 95% of each slot (lands within ±5%)
const MAX_ITEMS: Record<MealSlot, number> = { breakfast: 5, lunch: 5, dinner: 5, snack: 3 };

// --- preferences ------------------------------------------------------------

/** Build a filter from the saved food preference + any AI-parsed extras. */
export function filterFromPreference(
  pref: FoodPreference | null,
  extra?: Partial<DietFilter>
): DietFilter {
  const base: DietFilter = {
    vegetarian: pref === "veg_limited",
    excludeTags: [],
    excludeFoods: [],
    regionFocus: null,
  };
  return {
    vegetarian: extra?.vegetarian ?? base.vegetarian,
    regionFocus: extra?.regionFocus ?? base.regionFocus,
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
  let regionFocus: DietFilter["regionFocus"] = null;
  const tags = new Set<string>();
  const foods = new Set<string>();
  for (const p of parts) {
    if (p.vegetarian) vegetarian = true;
    if (p.regionFocus) regionFocus = p.regionFocus;
    (p.excludeTags ?? []).forEach((t) => tags.add(t));
    (p.excludeFoods ?? []).forEach((f) => foods.add(f.toLowerCase().trim()));
  }
  return { vegetarian, regionFocus, excludeTags: [...tags], excludeFoods: [...foods].filter(Boolean) };
}

// --- matching ---------------------------------------------------------------

// Does a free-text "avoid" term refer to this food? Tolerant both ways.
function matchesAvoidedFood(food: CatalogFood, terms: string[]): boolean {
  if (!terms?.length) return false;
  const name = food.name.toLowerCase();
  return terms.some((raw) => {
    const term = raw.toLowerCase().trim();
    if (term.length < 3) return false;
    return name.includes(term) || term.includes(name) || food.tags.some((tag) => term.includes(tag));
  });
}

// Is this food mentioned in a free-text meal description ("paratha + egg")?
function mentioned(food: CatalogFood, text: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return false;
  const name = food.name.toLowerCase();
  if (t.includes(name)) return true;
  if (food.tags.some((tag) => tag.length >= 3 && t.includes(tag))) return true;
  const tokens = name.replace(/[^a-z]+/g, " ").split(" ").filter((w) => w.length >= 4);
  return tokens.some((tok) => t.includes(tok));
}

function allowed(food: CatalogFood, filter: DietFilter): boolean {
  if (filter.vegetarian && !food.vegetarian) return false;
  if (food.tags.some((t) => filter.excludeTags.includes(t))) return false;
  if (matchesAvoidedFood(food, filter.excludeFoods ?? [])) return false;
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

// --- meal building (hard-capped) --------------------------------------------

interface BuiltMeal {
  slot: MealSlot;
  title: string;
  budget: number;
  cands: CatalogFood[]; // allowed, slot-suitable (reused by the protein-swap pass)
  chosen: CatalogFood[];
  protectedIds: Set<string>; // usual-food seeds — never swapped out for protein
}

const sumCal = (items: CatalogFood[]) => items.reduce((s, f) => s + f.calories, 0);
const sumPro = (items: CatalogFood[]) => items.reduce((s, f) => s + f.protein, 0);

function buildMealItems(
  budget: number,
  slotProtein: number,
  slot: MealSlot,
  cands: CatalogFood[],
  rng: () => number,
  usualText: string | undefined,
  likeIds: Set<string>
): CatalogFood[] {
  const chosen: CatalogFood[] = [];
  const fits = (f: CatalogFood) => sumCal(chosen) + f.calories <= budget; // HARD cap
  const likeBonus = (f: CatalogFood) => (likeIds.has(f.id) ? 6 : 0);
  const regionBonus = (f: CatalogFood) => 0; // region handled by likes/usual now; kept neutral
  const maxItems = MAX_ITEMS[slot];

  // 1) Seed with the user's usual foods for this slot (highest priority).
  if (usualText) {
    const seeds = cands
      .filter((f) => mentioned(f, usualText))
      .sort((a, b) => b.protein - a.protein || a.id.localeCompare(b.id));
    for (const s of seeds) {
      if (chosen.length >= maxItems) break;
      if (!chosen.includes(s) && fits(s)) chosen.push(s);
    }
  }

  // 2) Anchor a protein if none yet (real meals only).
  if (slot !== "snack" && !chosen.some((f) => f.role === "protein")) {
    const proteins = cands.filter((f) => f.role === "protein" && !chosen.includes(f) && fits(f));
    const anchor = chooseTop(proteins, (f) => proteinDensity(f) * 100 + likeBonus(f) + regionBonus(f), rng);
    if (anchor) chosen.push(anchor);
  }

  // 3) Fill toward FILL_TO of the budget — never exceeding it.
  let guard = 0;
  while (sumCal(chosen) < budget * FILL_TO && chosen.length < maxItems && guard < 30) {
    guard++;
    const remaining = budget - sumCal(chosen);
    const pool = cands.filter((f) => !chosen.includes(f) && f.calories <= remaining);
    if (pool.length === 0) break;
    const needProtein = sumPro(chosen) < slotProtein;
    const pick = chooseTop(
      pool,
      (f) =>
        -(remaining - f.calories) / 12 + // close the calorie gap (never over)
        proteinDensity(f) * (needProtein ? 60 : 25) + // protein-per-calorie
        likeBonus(f) +
        regionBonus(f),
      rng
    );
    if (!pick) break;
    chosen.push(pick);
  }

  return chosen;
}

/**
 * Day-level pass: while under the protein target, SWAP one chosen item for a
 * higher-protein candidate that still fits its slot budget. Never adds calories
 * beyond the caps. Deterministic (picks the largest protein gain each round).
 */
interface Swap {
  meal: BuiltMeal;
  outIdx: number;
  inFood: CatalogFood;
  gain: number;
}

function improveProtein(meals: BuiltMeal[], proteinTargetG: number): void {
  const totalProtein = () => meals.reduce((s, m) => s + sumPro(m.chosen), 0);
  let guard = 0;
  while (totalProtein() < proteinTargetG && guard < 25) {
    guard++;
    let best: Swap | null = null;
    for (const m of meals) {
      const calNow = sumCal(m.chosen);
      for (let xi = 0; xi < m.chosen.length; xi++) {
        const x = m.chosen[xi];
        if (m.protectedIds.has(x.id)) continue; // keep the user's usual foods in place
        for (const y of m.cands) {
          if (m.chosen.includes(y)) continue;
          if (calNow - x.calories + y.calories > m.budget) continue; // stay under the cap
          const gain = y.protein - x.protein;
          if (gain > 0 && (best === null || gain > best.gain)) {
            best = { meal: m, outIdx: xi, inFood: y, gain };
          }
        }
      }
    }
    if (best === null) break;
    best.meal.chosen[best.outIdx] = best.inFood;
  }
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

function finalizeMeal(b: { slot: MealSlot; title: string; budget: number; chosen: CatalogFood[] }): PlanMeal {
  return {
    slot: b.slot,
    title: b.title,
    items: b.chosen.map(toItem),
    calories: sumCal(b.chosen),
    protein: sumPro(b.chosen),
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
}): DietPlan {
  const seed = input.seed ?? 1;
  const rng = mulberry32(seed);
  const likeIds = new Set(
    input.usual?.foods ? FOOD_CATALOG.filter((f) => mentioned(f, input.usual!.foods!)).map((f) => f.id) : []
  );

  const built: BuiltMeal[] = slotBudgets(input.calorieTarget).map((s) => {
    const slotProtein = input.proteinTargetG * (input.calorieTarget > 0 ? s.cal / input.calorieTarget : 0);
    const cands = FOOD_CATALOG.filter((f) => f.slots.includes(s.slot) && allowed(f, input.filter));
    const usualText = usualForSlot(input.usual, s.slot);
    const chosen = buildMealItems(s.cal, slotProtein, s.slot, cands, rng, usualText, likeIds);
    const protectedIds = new Set(
      usualText ? chosen.filter((f) => mentioned(f, usualText)).map((f) => f.id) : []
    );
    return { slot: s.slot, title: s.title, budget: s.cal, cands, chosen, protectedIds };
  });

  improveProtein(built, input.proteinTargetG);

  const meals = built.map(finalizeMeal);
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return {
    meals,
    calorieTarget: input.calorieTarget,
    proteinTargetG: input.proteinTargetG,
    totalCalories,
    totalProtein,
    filter: input.filter,
    proteinShort: totalProtein < input.proteinTargetG,
    caloriesShort: totalCalories < input.calorieTarget * SHORT_THRESHOLD,
    seed,
  };
}

/** Re-select a single meal (used by "swap this meal"). No usual-food seed, so it varies. */
export function swapMeal(plan: DietPlan, slot: MealSlot, newSeed: number): DietPlan {
  const target = plan.meals.find((m) => m.slot === slot);
  if (!target) return plan;
  const meta = SLOT_META.find((x) => x.slot === slot)!;
  const rng = mulberry32(newSeed);
  const budget = target.budget;
  const slotProtein = plan.proteinTargetG * (plan.calorieTarget > 0 ? budget / plan.calorieTarget : 0);
  const cands = FOOD_CATALOG.filter((f) => f.slots.includes(slot) && allowed(f, plan.filter));
  const chosen = buildMealItems(budget, slotProtein, slot, cands, rng, undefined, new Set());

  const meal = finalizeMeal({ slot, title: meta.title, budget, chosen });
  const meals = plan.meals.map((m) => (m.slot === slot ? meal : m));
  const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  return {
    ...plan,
    meals,
    totalCalories,
    totalProtein,
    proteinShort: totalProtein < plan.proteinTargetG,
    caloriesShort: totalCalories < plan.calorieTarget * SHORT_THRESHOLD,
  };
}

/** Validate a swap target id belongs to the catalog (defensive for stored data). */
export function isKnownFood(id: string): boolean {
  return id in CATALOG_BY_ID;
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
