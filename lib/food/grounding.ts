import { FOOD_CATALOG } from "../diet/foodCatalog.ts";
import type { ParsedFoodItem } from "./parse.ts";
import type { RetrievedFood } from "./retrieve.ts";
import { foodSearchScore, normalizeFoodText } from "./searchRank.ts";
import { gramsForServingUnit, isGramUnit } from "./quantity.ts";
import type { NutritionSource } from "../database.types.ts";

interface GroundingFood {
  id: string;
  name: string;
  aliases: string[];
  portion: string;
  portion_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
}

interface Match {
  food: GroundingFood;
  score: number;
}

const MATCH_THRESHOLD = 70;
const AMBIGUOUS_SINGLE_WORDS = new Set(["shake", "drink", "curry", "salan", "sabzi", "snack"]);

const TRUSTED_CATALOG: GroundingFood[] = FOOD_CATALOG.map((food) => ({
  id: `catalog:${food.id}`,
  name: food.name,
  aliases: food.aliases ?? [],
  portion: food.portion,
  portion_grams: gramsFromPortion(food.portion),
  calories: food.calories,
  protein_g: food.protein,
  carbs_g: food.carbs,
  fat_g: food.fat,
  source: "curated",
}));

function toGroundingFood(food: RetrievedFood): GroundingFood {
  return {
    id: `db:${food.id}`,
    name: food.name,
    aliases: food.aliases ?? [],
    portion: food.portion,
    portion_grams: food.portion_grams,
    calories: Number(food.calories) || 0,
    protein_g: Number(food.protein_g) || 0,
    carbs_g: Number(food.carbs_g) || 0,
    fat_g: Number(food.fat_g) || 0,
    source: food.source,
  };
}

function words(value: string): string[] {
  return normalizeFoodText(value).split(/\s+/).filter(Boolean);
}

function gramsFromPortion(portion: string): number | null {
  const explicit = portion.match(/(?:~|\(|\s|^)(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b/i);
  if (explicit) return Number(explicit[1]);

  const leadingUnit = portion.trim().match(/^(?:\d+(?:\.\d+)?|one|a|an)\s+([a-z]+)/i)?.[1];
  return leadingUnit ? gramsForServingUnit(leadingUnit) : null;
}

function leadingCount(portion: string): number {
  const text = portion.trim().toLowerCase();
  const n = text.match(/^(\d+(?:\.\d+)?)/)?.[1];
  if (n) return Math.max(0.1, Number(n));
  if (text.startsWith("half ")) return 0.5;
  return 1;
}

function dedupeFoods(foods: GroundingFood[]): GroundingFood[] {
  const seen = new Set<string>();
  const out: GroundingFood[] = [];
  for (const food of foods) {
    const key = normalizeFoodText([food.name, ...food.aliases].join(" "));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(food);
  }
  return out;
}

function bestMatch(query: string, foods: GroundingFood[]): Match | null {
  const queryWords = words(query);
  if (queryWords.length === 0) return null;
  if (queryWords.length === 1 && AMBIGUOUS_SINGLE_WORDS.has(queryWords[0])) return null;

  const ranked = foods
    .map((food, index) => ({
      food,
      index,
      score: foodSearchScore(query, food),
    }))
    .filter((match) => match.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const best = ranked[0];
  return best ? { food: best.food, score: best.score } : null;
}

function scaleForItem(item: ParsedFoodItem, food: GroundingFood): number {
  const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
  const unit = item.unit.trim().toLowerCase();
  const portionGrams = food.portion_grams ?? gramsFromPortion(food.portion);

  if (isGramUnit(unit) && portionGrams && portionGrams > 0) {
    return quantity / portionGrams;
  }

  const servingGrams = gramsForServingUnit(unit);
  if (servingGrams != null && portionGrams && portionGrams > 0) {
    return (quantity * servingGrams) / portionGrams;
  }

  return quantity / leadingCount(food.portion);
}

function roundScaled(value: number, scale: number, max: number): number {
  const n = Math.round(value * scale);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

function confidenceForScore(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score / 120)) * 100) / 100;
}

function nutritionSourceForFood(food: GroundingFood): NutritionSource {
  if (food.source === "curated") return "verified";
  if (food.source === "user_estimate") return "estimated";
  return "imported";
}

function applyFood(item: ParsedFoodItem, match: Match): ParsedFoodItem {
  const food = match.food;
  const scale = Math.max(0.01, Math.min(scaleForItem(item, food), 100));
  return {
    ...item,
    calories: roundScaled(food.calories, scale, 5000),
    protein_g: roundScaled(food.protein_g, scale, 1000),
    carbs_g: roundScaled(food.carbs_g, scale, 1000),
    fat_g: roundScaled(food.fat_g, scale, 1000),
    matched_food_id: food.id,
    match_confidence: confidenceForScore(match.score),
    nutrition_source: nutritionSourceForFood(food),
  };
}

function hasMissingNutrition(item: ParsedFoodItem): boolean {
  return item.calories <= 0 && item.protein_g <= 0 && item.carbs_g <= 0 && item.fat_g <= 0;
}

export function groundParsedFoodItems(
  items: ParsedFoodItem[],
  options: { candidates?: RetrievedFood[]; rawText?: string } = {}
): ParsedFoodItem[] {
  const foods = dedupeFoods([...(options.candidates ?? []).map(toGroundingFood), ...TRUSTED_CATALOG]);

  return items.map((item) => {
    const direct = bestMatch(item.food_name, foods);
    const rawFallback =
      !direct && items.length === 1 && options.rawText ? bestMatch(options.rawText, foods) : null;
    const match = direct ?? rawFallback;
    if (!match) return item;

    // Strong catalog matches should be the macro source. This also repairs the
    // model's occasional "0 kcal / 0g protein" output for known foods.
    if (hasMissingNutrition(item) || match.score >= 90) {
      return applyFood(item, match);
    }
    return item;
  });
}
