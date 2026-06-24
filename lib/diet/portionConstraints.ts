import type { CatalogFood, FoodRole } from "./foodCatalog.ts";

export type PlannerPortionUnit = "count" | "grams" | "serving";

export interface PlannerPortionBasis {
  unitMode: "count" | "portion";
  amount: number;
  unit: string;
}

export interface PlannerPortionConstraint {
  minAmount: number;
  maxAmount: number;
  stepAmount: number;
  unitType: PlannerPortionUnit;
}

const GRAM_MIN_BY_ROLE: Record<FoodRole, number> = {
  protein: 75,
  carb: 75,
  veg: 50,
  dairy: 75,
  fruit: 50,
  snack: 15,
  drink: 100,
};

const GRAM_MAX_BY_ROLE: Record<FoodRole, number> = {
  protein: 300,
  carb: 350,
  veg: 300,
  dairy: 300,
  fruit: 300,
  snack: 100,
  drink: 350,
};

const SERVING_UNITS = new Set([
  "bowl",
  "can",
  "cup",
  "glass",
  "plate",
  "scoop",
  "serving",
]);

function unitTypeFor(basis: PlannerPortionBasis): PlannerPortionUnit {
  if (basis.unitMode === "portion") return "grams";
  return SERVING_UNITS.has(basis.unit.toLowerCase()) ? "serving" : "count";
}

function defaultCountMax(food: CatalogFood, basis: PlannerPortionBasis): number {
  if (food.tags.includes("supplement")) return 1;
  if (food.tags.includes("egg")) return 4;
  if (food.tags.includes("bread") || food.role === "carb") return Math.max(4, basis.amount);
  if (food.role === "fruit") return Math.max(2, basis.amount * 2);
  return Math.max(2, basis.amount * 2);
}

/**
 * Automatic Diet Plan portion bounds. Food logging and user-entered quantities
 * deliberately do not use this helper because they must record what was eaten.
 */
export function plannerPortionConstraint(
  food: CatalogFood,
  basis: PlannerPortionBasis
): PlannerPortionConstraint {
  const unitType = food.plannerUnit ?? unitTypeFor(basis);
  const defaultMin = unitType === "grams" ? GRAM_MIN_BY_ROLE[food.role] : 1;
  const defaultMax =
    unitType === "grams"
      ? Math.max(basis.amount, GRAM_MAX_BY_ROLE[food.role])
      : unitType === "serving"
        ? food.tags.includes("supplement")
          ? 1
          : Math.max(2, basis.amount)
        : defaultCountMax(food, basis);

  return {
    minAmount: food.minAmount ?? Math.min(defaultMin, basis.amount),
    maxAmount: food.maxAmount ?? defaultMax,
    stepAmount: food.stepAmount ?? (unitType === "grams" ? 5 : 1),
    unitType,
  };
}

export function clampPlannerAmount(
  amount: number,
  constraint: PlannerPortionConstraint
): number {
  const steps = Math.floor((amount + 1e-9) / constraint.stepAmount);
  const snapped = steps * constraint.stepAmount;
  return Math.min(
    constraint.maxAmount,
    Math.max(constraint.minAmount, snapped)
  );
}

export function isPlannerAmountOnStep(
  amount: number,
  constraint: PlannerPortionConstraint
): boolean {
  const steps = amount / constraint.stepAmount;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}
