import type { DietMode, FoodPreference } from "@/lib/database.types";

export type ResolvedDietMode = Exclude<DietMode, "unknown">;

/**
 * Explicit diet mode wins. Legacy `veg_limited` remains strict vegetarian so
 * existing users never receive meat unexpectedly.
 */
export function resolveDietMode(
  dietMode: DietMode | null | undefined,
  legacyFoodPreference: FoodPreference | null | undefined
): ResolvedDietMode {
  if (dietMode && dietMode !== "unknown") return dietMode;
  return legacyFoodPreference === "veg_limited" ? "vegetarian" : "non_veg";
}

export function hasExplicitDietMode(
  dietMode: DietMode | null | undefined
): dietMode is ResolvedDietMode {
  return dietMode != null && dietMode !== "unknown";
}
