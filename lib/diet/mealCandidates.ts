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
  regionMatch: "specific" | "broad" | "global" | "other";
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
  if (region && food.profileRegions?.length) {
    return food.profileRegions.includes(region);
  }
  if (region === "pakistan" || region === "india") {
    return food.region === "desi" || food.region === "global";
  }
  if (region === "us_canada" || region === "uk_europe") {
    return food.region === "western" || food.region === "global";
  }
  if (region === "middle_east") {
    // ME-specific foods (pita, hummus, foul, shrimp, white_fish, chicken, rice,
    // yogurt…) are already admitted by the profileRegions branch above. Beyond
    // those, allow only neutral GLOBAL basics (eggs, salad, fruit, nuts, soya) —
    // never desi-only or western-only dishes. This stops desi/western leakage
    // while keeping the pool comfortably large.
    return food.region === "global";
  }
  // Other / unknown region: keep the full curated pool as a safe catch-all.
  return true;
}

function regionMatch(
  food: CatalogFood,
  region: Region | null
): MealCandidate["regionMatch"] {
  if (region && food.profileRegions?.includes(region)) return "specific";
  if (
    (region === "pakistan" || region === "india") &&
    food.region === "desi"
  ) {
    return "broad";
  }
  if (
    (region === "us_canada" || region === "uk_europe") &&
    food.region === "western"
  ) {
    return "broad";
  }
  if (food.region === "global") return "global";
  return "other";
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

function toCandidate(food: CatalogFood, region: Region | null): MealCandidate {
  return {
    id: food.id,
    name: food.name,
    role: food.role,
    slots: food.slots,
    region: food.region,
    vegetarian: food.vegetarian,
    whey: food.tags.includes("supplement"),
    common: food.staple != null,
    regionMatch: regionMatch(food, region),
    ...(food.aliases?.length ? { aliases: food.aliases } : {}),
  };
}

/** Curated foods allowed for automatic planning for this profile. */
export function buildMealCandidatePool(
  profile: MealCandidateProfile,
  pool: CatalogFood[] = DIET_PLAN_POOL
): CatalogFood[] {
  return pool.filter((food) => candidateAllowed(food, profile));
}

/** Curated, profile-filtered candidates exposed to Groq for each meal slot. */
export function buildMealCandidateLists(
  profile: MealCandidateProfile,
  pool: CatalogFood[] = DIET_PLAN_POOL
): MealCandidateLists {
  const eligible = buildMealCandidatePool(profile, pool);
  return Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      eligible
        .filter((food) => food.slots.includes(slot))
        .map((food) => toCandidate(food, profile.region)),
    ])
  ) as MealCandidateLists;
}
