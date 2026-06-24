import { FOOD_CATALOG, type CatalogFood } from "./foodCatalog.ts";

/**
 * The only food pool allowed in Diet Plan flows.
 *
 * The full foods table remains available to food logging and retrieval. Diet
 * plans stay on the app-reviewed catalog until imported foods have a stronger
 * commonness/quality review contract than classifier eligibility alone.
 */
export const DIET_PLAN_POOL: CatalogFood[] = FOOD_CATALOG;

export const DIET_PLAN_FOOD_IDS = new Set(DIET_PLAN_POOL.map((food) => food.id));
