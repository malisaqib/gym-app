import { planItemSpec, type PlanMealItem } from "./planner.ts";
import { totalsFor, MAX_AMOUNT_GRAMS, MAX_AMOUNT_UNITS } from "../food/quantity.ts";
import type { NutritionSource } from "../database.types.ts";

/**
 * Plan → log bridge ("I ate this"). Maps a diet-plan item to a food_logs row
 * using the SAME live-quantity model as every other logging path (per-unit /
 * per-gram base + amount, totals as the synced cache), so a logged plan meal
 * scales, edits and aggregates exactly like any other logged food.
 *
 * Pure and deterministic — the server action attaches user_id/logged_on and
 * inserts. Provenance: catalog items log as VERIFIED (they are the hand-checked
 * pool), db:* items as IMPORTED (USDA/FNDDS), free-typed approx items as
 * ESTIMATED with no matched id.
 */
export interface PlanLogRow {
  raw_text: string;
  food_name: string;
  quantity: number;
  unit: string;
  unit_mode: "count" | "portion";
  base_calories: number;
  base_protein_g: number;
  base_carbs_g: number;
  base_fat_g: number;
  amount: number;
  serving_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "manual";
  matched_food_id: string | null;
  match_confidence: number | null;
  nutrition_source: NutritionSource;
}

export function planItemToLogRow(item: PlanMealItem): PlanLogRow {
  const s = planItemSpec(item);
  const cap = s.unitMode === "portion" ? MAX_AMOUNT_GRAMS : MAX_AMOUNT_UNITS;
  const amount = Math.min(s.amount > 0 ? s.amount : 1, cap);
  const totals = totalsFor({
    base_calories: s.baseCalories,
    base_protein_g: s.baseProtein,
    base_carbs_g: s.baseCarbs,
    base_fat_g: s.baseFat,
    amount,
  });

  const isDb = item.id.startsWith("db:");
  const matched = item.approx ? null : isDb ? item.id : `catalog:${item.id}`;
  const nutrition_source: NutritionSource = item.approx ? "estimated" : isDb ? "imported" : "verified";

  return {
    raw_text: item.name,
    food_name: item.name,
    // Display convention matches search-logging: portion foods show their
    // friendly portion label; countable foods show "<n> <unit>".
    quantity: s.unitMode === "count" ? amount : 1,
    unit: s.unitMode === "count" ? s.unit || "serving" : item.portion,
    unit_mode: s.unitMode,
    base_calories: s.baseCalories,
    base_protein_g: s.baseProtein,
    base_carbs_g: s.baseCarbs,
    base_fat_g: s.baseFat,
    amount,
    serving_grams: s.servingGrams,
    calories: totals.calories,
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fat_g: totals.fat_g,
    source: "manual",
    matched_food_id: matched,
    match_confidence: matched ? 1 : null,
    nutrition_source,
  };
}
