/**
 * Owned meal-foods catalog for the diet-plan generator (Phase 4).
 *
 * This is a curated, app-owned list of MEAL-SUITABLE foods (bi-cuisine), derived
 * from our existing curated food data and annotated with what a planner needs:
 * which meals an item suits, whether it's vegetarian, tags (for "no beef" etc.),
 * and a role (protein / carb / …) so we can build balanced plates.
 *
 * NOTE: this is a food catalog, not hardcoded menus — the planner builds the
 * plans by selecting from here. Macros are per the stated (friendly) portion.
 * Cost is intentionally omitted for now (budget selection deferred). Keep macro
 * values consistent with scripts/seed-foods.mjs where they overlap.
 */

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodRole = "protein" | "carb" | "veg" | "dairy" | "fruit" | "snack" | "drink";
export type FoodRegion = "desi" | "western" | "global";

export interface CatalogFood {
  id: string;
  name: string;
  region: FoodRegion;
  portion: string; // friendly unit, e.g. "1 katori", "2 roti"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  vegetarian: boolean; // true = no meat/fish/egg
  role: FoodRole;
  slots: MealSlot[];
  tags: string[]; // for preference filtering, e.g. ["beef"], ["egg","dairy"]
}

const B: MealSlot = "breakfast";
const L: MealSlot = "lunch";
const D: MealSlot = "dinner";
const S: MealSlot = "snack";

export const FOOD_CATALOG: CatalogFood[] = [
  // ---- desi proteins ----
  { id: "eggs2", name: "2 eggs (boiled/fried)", region: "desi", portion: "2 eggs", calories: 160, protein: 12, carbs: 2, fat: 11, vegetarian: false, role: "protein", slots: [B, S], tags: ["egg"] },
  { id: "omelette", name: "Omelette (2 eggs)", region: "desi", portion: "2 eggs", calories: 200, protein: 12, carbs: 2, fat: 16, vegetarian: false, role: "protein", slots: [B], tags: ["egg"] },
  { id: "chicken_salan", name: "Chicken salan", region: "desi", portion: "1 serving (~200g)", calories: 300, protein: 28, carbs: 8, fat: 18, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"] },
  { id: "chicken_karahi", name: "Chicken karahi", region: "desi", portion: "1 serving (~250g)", calories: 400, protein: 35, carbs: 8, fat: 26, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"] },
  { id: "chicken_tikka", name: "Chicken tikka", region: "desi", portion: "1 piece (~120g)", calories: 180, protein: 22, carbs: 2, fat: 9, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["chicken"] },
  { id: "qeema", name: "Qeema (minced meat)", region: "desi", portion: "1 katori (~150g)", calories: 350, protein: 22, carbs: 5, fat: 26, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  { id: "aloo_gosht", name: "Aloo gosht (beef/mutton)", region: "desi", portion: "1 serving (~250g)", calories: 360, protein: 24, carbs: 12, fat: 22, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  { id: "seekh", name: "Seekh kababs", region: "desi", portion: "2 kababs", calories: 240, protein: 18, carbs: 4, fat: 16, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["beef"] },
  { id: "fish_curry", name: "Fish curry", region: "desi", portion: "1 serving (~200g)", calories: 250, protein: 26, carbs: 6, fat: 13, vegetarian: false, role: "protein", slots: [L, D], tags: ["fish"] },

  // ---- desi vegetarian proteins / curries ----
  { id: "daal", name: "Daal (lentils)", region: "desi", portion: "1 katori (~200g)", calories: 150, protein: 9, carbs: 22, fat: 3, vegetarian: true, role: "protein", slots: [L, D], tags: ["lentil"] },
  { id: "chana", name: "Chana / cholay", region: "desi", portion: "1 katori (~200g)", calories: 190, protein: 9, carbs: 27, fat: 5, vegetarian: true, role: "protein", slots: [B, L, D], tags: ["lentil"] },
  { id: "palak", name: "Palak / saag", region: "desi", portion: "1 katori (~200g)", calories: 180, protein: 6, carbs: 12, fat: 12, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "mix_sabzi", name: "Mixed vegetable sabzi", region: "desi", portion: "1 katori (~200g)", calories: 170, protein: 4, carbs: 18, fat: 10, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "aloo", name: "Aloo curry", region: "desi", portion: "1 katori (~200g)", calories: 200, protein: 4, carbs: 28, fat: 9, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },

  // ---- desi carbs ----
  { id: "roti2", name: "2 roti", region: "desi", portion: "2 medium", calories: 220, protein: 6, carbs: 44, fat: 4, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["bread"] },
  { id: "roti1", name: "1 roti", region: "desi", portion: "1 medium", calories: 110, protein: 3, carbs: 22, fat: 2, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["bread"] },
  { id: "rice", name: "Boiled rice", region: "desi", portion: "1 katori (~150g)", calories: 200, protein: 4, carbs: 44, fat: 1, vegetarian: true, role: "carb", slots: [L, D], tags: ["rice"] },
  { id: "paratha", name: "Paratha", region: "desi", portion: "1 plain", calories: 280, protein: 5, carbs: 36, fat: 13, vegetarian: true, role: "carb", slots: [B], tags: ["bread", "fried"] },
  { id: "biryani", name: "Chicken biryani", region: "desi", portion: "1 plate (~350g)", calories: 550, protein: 22, carbs: 65, fat: 22, vegetarian: false, role: "carb", slots: [L, D], tags: ["chicken", "rice"] },

  // ---- desi dairy / drinks ----
  { id: "dahi", name: "Dahi (yogurt)", region: "desi", portion: "1 katori (~150g)", calories: 90, protein: 5, carbs: 8, fat: 4, vegetarian: true, role: "dairy", slots: [B, L, D, S], tags: ["dairy"] },
  { id: "milk", name: "Milk", region: "desi", portion: "1 glass (~250ml)", calories: 150, protein: 8, carbs: 12, fat: 8, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy"] },
  { id: "lassi", name: "Sweet lassi", region: "desi", portion: "1 glass", calories: 180, protein: 6, carbs: 28, fat: 5, vegetarian: true, role: "drink", slots: [B, S], tags: ["dairy", "sweet"] },

  // ---- western proteins ----
  { id: "chicken_breast", name: "Grilled chicken breast", region: "western", portion: "100g", calories: 165, protein: 31, carbs: 0, fat: 4, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"] },
  { id: "tuna", name: "Canned tuna", region: "western", portion: "1 can (142g)", calories: 130, protein: 30, carbs: 0, fat: 1, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["fish"] },
  { id: "salmon", name: "Salmon", region: "western", portion: "100g", calories: 206, protein: 22, carbs: 0, fat: 13, vegetarian: false, role: "protein", slots: [L, D], tags: ["fish"] },
  { id: "ground_beef", name: "Ground beef (cooked)", region: "western", portion: "100g", calories: 250, protein: 26, carbs: 0, fat: 15, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  { id: "greek_yogurt", name: "Greek yogurt (plain)", region: "western", portion: "1 cup (170g)", calories: 100, protein: 17, carbs: 6, fat: 1, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy"] },
  { id: "scrambled", name: "Scrambled eggs", region: "western", portion: "2 eggs", calories: 180, protein: 12, carbs: 2, fat: 14, vegetarian: false, role: "protein", slots: [B], tags: ["egg"] },

  // ---- western carbs ----
  { id: "oats", name: "Oatmeal", region: "western", portion: "1 cup cooked", calories: 150, protein: 5, carbs: 27, fat: 3, vegetarian: true, role: "carb", slots: [B], tags: ["oats"] },
  { id: "brown_rice", name: "Brown rice", region: "western", portion: "1 cup (195g)", calories: 215, protein: 5, carbs: 45, fat: 2, vegetarian: true, role: "carb", slots: [L, D], tags: ["rice"] },
  { id: "pasta", name: "Pasta (cooked)", region: "western", portion: "1 cup (140g)", calories: 220, protein: 8, carbs: 43, fat: 1, vegetarian: true, role: "carb", slots: [L, D], tags: ["pasta"] },
  { id: "bread2", name: "2 bread slices", region: "western", portion: "2 slices", calories: 150, protein: 4, carbs: 28, fat: 2, vegetarian: true, role: "carb", slots: [B], tags: ["bread"] },
  { id: "baked_potato", name: "Baked potato", region: "western", portion: "1 medium", calories: 160, protein: 4, carbs: 37, fat: 0, vegetarian: true, role: "carb", slots: [L, D], tags: ["veg"] },

  // ---- snacks / fruit / extras (global) ----
  { id: "banana", name: "Banana", region: "global", portion: "1 medium", calories: 105, protein: 1, carbs: 27, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"] },
  { id: "apple", name: "Apple", region: "global", portion: "1 medium", calories: 95, protein: 1, carbs: 25, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"] },
  { id: "orange", name: "Orange", region: "global", portion: "1 medium", calories: 62, protein: 1, carbs: 15, fat: 0, vegetarian: true, role: "fruit", slots: [S], tags: ["fruit"] },
  { id: "almonds", name: "Almonds", region: "global", portion: "1 oz (28g)", calories: 165, protein: 6, carbs: 6, fat: 14, vegetarian: true, role: "snack", slots: [S], tags: ["nuts"] },
  { id: "peanut_butter", name: "Peanut butter", region: "global", portion: "2 tbsp", calories: 190, protein: 7, carbs: 7, fat: 16, vegetarian: true, role: "snack", slots: [B, S], tags: ["nuts"] },
  { id: "whey", name: "Whey protein shake", region: "global", portion: "1 scoop", calories: 120, protein: 24, carbs: 3, fat: 2, vegetarian: true, role: "protein", slots: [B, S], tags: ["dairy", "supplement"] },
  { id: "salad", name: "Green salad", region: "global", portion: "1 bowl", calories: 30, protein: 2, carbs: 6, fat: 0, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "boiled_egg1", name: "1 boiled egg", region: "global", portion: "1 egg", calories: 80, protein: 6, carbs: 1, fat: 5, vegetarian: false, role: "protein", slots: [B, S], tags: ["egg"] },
];

/** Quick lookup by id (used when applying swaps). */
export const CATALOG_BY_ID: Record<string, CatalogFood> = Object.fromEntries(
  FOOD_CATALOG.map((f) => [f.id, f])
);
