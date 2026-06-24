import type { FoodPreference, Region } from "@/lib/database.types";
import type { DietFilter } from "./planner.ts";
import { isDietPlanFoodAllowed } from "./planner.ts";
import { DIET_PLAN_POOL } from "./planPool.ts";
import { explicitProteinPowderOptIn } from "./proteinPowder.ts";
import type { CatalogFood, MealSlot } from "./foodCatalog.ts";

export { explicitProteinPowderOptIn } from "./proteinPowder.ts";

export interface MealCandidate {
  id: string;
  name: string;
  role: CatalogFood["role"];
  slots: MealSlot[];
  region: CatalogFood["region"];
  vegetarian: boolean;
  whey: boolean;
  common: boolean;
  aliases?: string[];
}

export type MealCandidateLists = Record<MealSlot, MealCandidate[]>;

export interface MealCandidateProfile {
  filter: DietFilter;
  region: Region | null;
  foodPreference: FoodPreference | null;
  allowProteinPowder: boolean;
}

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function regionAllowed(food: CatalogFood, region: Region | null): boolean {
  if (region === "pakistan" || region === "india") {
    return food.region === "desi" || food.region === "global";
  }
  if (region === "us_canada" || region === "uk_europe") {
    return food.region === "western" || food.region === "global";
  }
  // Middle East and Other do not yet have reliable catalog tags. Keep the full
  // curated pool available and let the prompt use region as a soft preference.
  return true;
}

function candidateAllowed(food: CatalogFood, profile: MealCandidateProfile): boolean {
  if (!isDietPlanFoodAllowed(food, profile.filter)) return false;
  if (!regionAllowed(food, profile.region)) return false;
  if (food.tags.includes("fastfood")) return false;
  if (food.tags.includes("supplement") && !profile.allowProteinPowder) return false;
  if (food.role === "drink" && (food.tags.includes("sweet") || /\bshake\b/i.test(food.name))) {
    return false;
  }
  return true;
}

function toCandidate(food: CatalogFood): MealCandidate {
  return {
    id: food.id,
    name: food.name,
    role: food.role,
    slots: food.slots,
    region: food.region,
    vegetarian: food.vegetarian,
    whey: food.tags.includes("supplement"),
    common: food.staple != null,
    ...(food.aliases?.length ? { aliases: food.aliases } : {}),
  };
}

/** Curated, profile-filtered candidates exposed to Groq for each meal slot. */
export function buildMealCandidateLists(
  profile: MealCandidateProfile,
  pool: CatalogFood[] = DIET_PLAN_POOL
): MealCandidateLists {
  const eligible = pool.filter((food) => candidateAllowed(food, profile));
  return Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      eligible.filter((food) => food.slots.includes(slot)).map(toCandidate),
    ])
  ) as MealCandidateLists;
}
