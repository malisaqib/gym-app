import type { Region } from "@/lib/database.types";

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
  vegetarian: boolean; // true = lacto-ovo veg (no meat/fish; eggs & dairy OK). egg/dairy/nuts are avoided separately via tags.
  role: FoodRole;
  slots: MealSlot[];
  tags: string[]; // for preference filtering, e.g. ["beef"], ["egg","dairy"]
  aliases?: string[]; // extra search terms incl. Roman Urdu (e.g. "nehari", "aam")
  profileRegions?: Region[]; // automatic-planner regions; omitted keeps coarse region behavior
  minAmount?: number; // automatic planner floor in live units
  maxAmount?: number; // automatic planner cap in live units: grams for portions, count for count foods
  stepAmount?: number; // automatic planner increment in live units
  plannerUnit?: "count" | "grams" | "serving";
  /**
   * Staple classification for SIMPLE plan generation (diet rebuild): protein
   * anchors, carb bases, fruit snacks and plain sides. Foods without a staple
   * tag stay fully loggable/searchable/swappable but don't anchor generated
   * plans. Assigned via STAPLES below.
   */
  staple?: "protein" | "carb" | "fruit" | "side";
}

const B: MealSlot = "breakfast";
const L: MealSlot = "lunch";
const D: MealSlot = "dinner";
const S: MealSlot = "snack";
const PK_IN: Region[] = ["pakistan", "india"];
const US_UK: Region[] = ["us_canada", "uk_europe"];
const MIDDLE_EAST: Region[] = ["middle_east"];

export const FOOD_CATALOG: CatalogFood[] = [
  // ---- desi proteins ----
  { id: "eggs2", name: "2 eggs (boiled/fried)", region: "desi", portion: "2 eggs", calories: 160, protein: 12, carbs: 2, fat: 11, vegetarian: true, role: "protein", slots: [B, S], tags: ["egg"], aliases: ["anda", "anday", "andey", "eggs"], profileRegions: ["pakistan", "india", "middle_east"], maxAmount: 4 },
  { id: "omelette", name: "Omelette (2 eggs)", region: "desi", portion: "2 eggs", calories: 200, protein: 12, carbs: 2, fat: 16, vegetarian: true, role: "protein", slots: [B], tags: ["egg"], maxAmount: 4 },
  { id: "chicken_salan", name: "Chicken salan", region: "desi", portion: "1 serving (~200g)", calories: 300, protein: 28, carbs: 8, fat: 18, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"], aliases: ["chicken curry", "chicken salan", "murgh", "murghi"], profileRegions: PK_IN, maxAmount: 300 },
  { id: "chicken_karahi", name: "Chicken karahi", region: "desi", portion: "1 serving (~250g)", calories: 400, protein: 35, carbs: 8, fat: 26, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"], maxAmount: 350 },
  { id: "chicken_tikka", name: "Chicken tikka", region: "desi", portion: "1 piece (~120g)", calories: 180, protein: 22, carbs: 2, fat: 9, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["chicken"], maxAmount: 240 },
  { id: "qeema", name: "Qeema (minced meat)", region: "desi", portion: "1 katori (~150g)", calories: 350, protein: 22, carbs: 5, fat: 26, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  { id: "aloo_gosht", name: "Aloo gosht (beef/mutton)", region: "desi", portion: "1 serving (~250g)", calories: 360, protein: 24, carbs: 12, fat: 22, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  { id: "seekh", name: "Seekh kababs", region: "desi", portion: "2 kababs", calories: 240, protein: 18, carbs: 4, fat: 16, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["beef"] },
  { id: "fish_curry", name: "Fish curry", region: "desi", portion: "1 serving (~200g)", calories: 250, protein: 26, carbs: 6, fat: 13, vegetarian: false, role: "protein", slots: [L, D], tags: ["fish"], aliases: ["machli", "machli curry"], profileRegions: PK_IN },

  // ---- desi vegetarian proteins / curries ----
  { id: "daal", name: "Daal (lentils)", region: "desi", portion: "1 katori (~200g)", calories: 150, protein: 9, carbs: 22, fat: 3, vegetarian: true, role: "protein", slots: [L, D], tags: ["lentil"], aliases: ["dal", "dhal", "lentils"], profileRegions: PK_IN },
  { id: "chana", name: "Chana / cholay", region: "desi", portion: "1 katori (~200g)", calories: 190, protein: 9, carbs: 27, fat: 5, vegetarian: true, role: "protein", slots: [B, L, D], tags: ["lentil"], aliases: ["chickpea", "chickpeas", "chole", "cholay"], profileRegions: PK_IN },
  { id: "palak", name: "Palak / saag", region: "desi", portion: "1 katori (~200g)", calories: 180, protein: 6, carbs: 12, fat: 12, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "mix_sabzi", name: "Mixed vegetable sabzi", region: "desi", portion: "1 katori (~200g)", calories: 170, protein: 4, carbs: 18, fat: 10, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "aloo", name: "Aloo curry", region: "desi", portion: "1 katori (~200g)", calories: 200, protein: 4, carbs: 28, fat: 9, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },

  // ---- desi carbs ----
  { id: "roti2", name: "2 roti", region: "desi", portion: "2 medium", calories: 220, protein: 6, carbs: 44, fat: 4, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["bread"], aliases: ["chapati", "chapatis", "phulka", "roti", "flatbread"], profileRegions: PK_IN, maxAmount: 4 },
  { id: "roti1", name: "1 roti", region: "desi", portion: "1 medium", calories: 110, protein: 3, carbs: 22, fat: 2, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["bread"], aliases: ["chapati", "phulka", "roti", "flatbread"], profileRegions: PK_IN, maxAmount: 4 },
  { id: "rice", name: "Boiled rice", region: "desi", portion: "1 katori (~150g)", calories: 200, protein: 4, carbs: 44, fat: 1, vegetarian: true, role: "carb", slots: [L, D], tags: ["rice"], aliases: ["chawal", "plain rice", "white rice"], profileRegions: ["pakistan", "india", "middle_east"], maxAmount: 300 },
  { id: "paratha", name: "Paratha", region: "desi", portion: "1 plain", calories: 280, protein: 5, carbs: 36, fat: 13, vegetarian: true, role: "carb", slots: [B], tags: ["bread", "fried"] },
  { id: "biryani", name: "Chicken biryani", region: "desi", portion: "1 plate (~350g)", calories: 550, protein: 22, carbs: 65, fat: 22, vegetarian: false, role: "carb", slots: [L, D], tags: ["chicken", "rice"] },

  // ---- desi dairy / drinks ----
  { id: "dahi", name: "Dahi (yogurt)", region: "desi", portion: "1 katori (~150g)", calories: 90, protein: 5, carbs: 8, fat: 4, vegetarian: true, role: "dairy", slots: [B, L, D, S], tags: ["dairy"], aliases: ["dahi", "curd", "plain yogurt"], profileRegions: ["pakistan", "india", "middle_east"], maxAmount: 300 },
  { id: "milk", name: "Milk", region: "desi", portion: "1 glass (~250ml)", calories: 150, protein: 8, carbs: 12, fat: 8, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy"], aliases: ["doodh"], profileRegions: PK_IN },
  { id: "lassi", name: "Sweet lassi", region: "desi", portion: "1 glass", calories: 180, protein: 6, carbs: 28, fat: 5, vegetarian: true, role: "drink", slots: [B, S], tags: ["dairy", "sweet"] },

  // ---- western proteins ----
  { id: "chicken_breast", name: "Grilled chicken breast", region: "western", portion: "100g", calories: 165, protein: 31, carbs: 0, fat: 4, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"], aliases: ["grilled chicken", "chicken breast"], profileRegions: ["pakistan", "india", "middle_east", "us_canada", "uk_europe"], maxAmount: 250 },
  // USDA FNDDS: Chicken thigh, NS as to cooking method, skin eaten, per 100g.
  { id: "chicken_thigh", name: "Cooked chicken thigh", region: "western", portion: "100g", calories: 226, protein: 22.5, carbs: 0.1, fat: 15.1, vegetarian: false, role: "protein", slots: [L, D], tags: ["chicken"], aliases: ["chicken thighs", "roasted chicken thigh"], profileRegions: ["us_canada", "uk_europe", "middle_east"], maxAmount: 250 },
  // USDA SR: turkey breast, meat only, roasted, per 100g.
  { id: "turkey_breast", name: "Roasted turkey breast", region: "western", portion: "100g", calories: 127, protein: 27, carbs: 0, fat: 2.1, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["turkey"], aliases: ["turkey breast", "lean turkey"], profileRegions: US_UK, maxAmount: 150 },
  // USDA SR: ground turkey, 93% lean, pan-broiled crumbles, per 100g.
  { id: "turkey_mince", name: "Lean turkey mince", region: "western", portion: "100g", calories: 213, protein: 27.1, carbs: 0, fat: 11.6, vegetarian: false, role: "protein", slots: [L, D], tags: ["turkey"], aliases: ["ground turkey", "turkey mince"], profileRegions: US_UK, maxAmount: 250 },
  { id: "tuna", name: "Canned tuna", region: "western", portion: "1 can (142g)", calories: 130, protein: 30, carbs: 0, fat: 1, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["fish"] },
  { id: "salmon", name: "Salmon", region: "western", portion: "100g", calories: 206, protein: 22, carbs: 0, fat: 13, vegetarian: false, role: "protein", slots: [L, D], tags: ["fish"] },
  { id: "ground_beef", name: "Ground beef (cooked)", region: "western", portion: "100g", calories: 250, protein: 26, carbs: 0, fat: 15, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"] },
  // USDA FNDDS: beef round steak, cooked, per 100g.
  { id: "lean_beef_steak", name: "Lean beef steak", region: "western", portion: "100g", calories: 166, protein: 29.7, carbs: 0, fat: 4.3, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"], aliases: ["lean steak", "round steak", "beef steak"], profileRegions: US_UK, maxAmount: 250 },
  { id: "greek_yogurt", name: "Greek yogurt (plain)", region: "western", portion: "1 cup (170g)", calories: 100, protein: 17, carbs: 6, fat: 1, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy"], aliases: ["greek yogurt", "low fat greek yogurt", "nonfat greek yogurt", "fat free greek yogurt"], profileRegions: ["us_canada", "uk_europe", "middle_east"], maxAmount: 300 },
  // USDA FNDDS: farmer's cottage cheese, per 100g.
  { id: "cottage_cheese", name: "Cottage cheese", region: "western", portion: "100g", calories: 148, protein: 11, carbs: 4.3, fat: 9.7, vegetarian: true, role: "protein", slots: [B, L, S], tags: ["dairy", "cheese"], aliases: ["farmers cheese", "farmer's cheese"], profileRegions: US_UK, maxAmount: 300 },
  { id: "scrambled", name: "Scrambled eggs", region: "western", portion: "2 eggs", calories: 180, protein: 12, carbs: 2, fat: 14, vegetarian: true, role: "protein", slots: [B], tags: ["egg"], maxAmount: 4 },
  // Egg white — per 1 large white (~33g). USDA FoodData Central: 17 kcal, 3.6 g
  // protein, ~0 g carb/fat (≈52 kcal & 11 g per 100 g). Protein kept fractional
  // (not rounded to 4) so logging several doesn't over-report — this is a
  // protein-accuracy app. Replaces the old LLM estimate of ~40 kcal/8 g per egg.
  { id: "egg_white", name: "Egg white", region: "global", portion: "1 egg white", calories: 17, protein: 3.6, carbs: 0, fat: 0, vegetarian: true, role: "protein", slots: [B, L, D, S], tags: ["egg"], aliases: ["egg whites", "egg white only", "egg whites only", "andey ki safedi", "anda ki safedi", "safedi", "liquid egg white", "liquid egg whites"], maxAmount: 8 },

  // ---- western carbs ----
  { id: "oats", name: "Oatmeal", region: "western", portion: "1 cup cooked", calories: 150, protein: 5, carbs: 27, fat: 3, vegetarian: true, role: "carb", slots: [B], tags: ["oats"] },
  { id: "brown_rice", name: "Brown rice", region: "western", portion: "1 cup (195g)", calories: 215, protein: 5, carbs: 45, fat: 2, vegetarian: true, role: "carb", slots: [L, D], tags: ["rice"], maxAmount: 390 },
  { id: "pasta", name: "Pasta (cooked)", region: "western", portion: "1 cup (140g)", calories: 220, protein: 8, carbs: 43, fat: 1, vegetarian: true, role: "carb", slots: [L, D], tags: ["pasta"] },
  { id: "bread2", name: "2 whole wheat bread slices", region: "western", portion: "2 slices", calories: 150, protein: 4, carbs: 28, fat: 2, vegetarian: true, role: "carb", slots: [B], tags: ["bread"], aliases: ["whole wheat bread", "wholemeal bread", "whole wheat", "wholemeal", "toast"], profileRegions: US_UK, maxAmount: 4 },
  // USDA FNDDS: whole-wheat pita, per 100g.
  { id: "pita", name: "Whole wheat pita bread", region: "global", portion: "100g", calories: 262, protein: 9.8, carbs: 55.9, fat: 1.7, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["bread"], aliases: ["pita", "pita bread", "arabic bread", "khubz"], profileRegions: MIDDLE_EAST, maxAmount: 200 },
  { id: "baked_potato", name: "Baked potato", region: "western", portion: "1 medium", calories: 160, protein: 4, carbs: 37, fat: 0, vegetarian: true, role: "carb", slots: [L, D], tags: ["veg"] },
  // USDA SR: boiled potato without skin, per 100g.
  { id: "boiled_potato", name: "Boiled potato", region: "western", portion: "100g", calories: 86, protein: 1.7, carbs: 20, fat: 0.1, vegetarian: true, role: "carb", slots: [L, D], tags: ["veg", "potato"], aliases: ["boiled potatoes", "plain potato"], profileRegions: US_UK, maxAmount: 300 },
  // Verified curated row: one cup mashed potatoes (210g).
  { id: "mashed_potato", name: "Mashed potatoes", region: "western", portion: "1 cup (210g)", calories: 215, protein: 4, carbs: 35, fat: 9, vegetarian: true, role: "carb", slots: [L, D], tags: ["veg", "potato"], aliases: ["mashed potato", "potato mash"], profileRegions: US_UK, maxAmount: 315 },

  // ---- snacks / fruit / extras (global) ----
  { id: "banana", name: "Banana", region: "global", portion: "1 medium", calories: 105, protein: 1, carbs: 27, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"] },
  { id: "apple", name: "Apple", region: "global", portion: "1 medium", calories: 95, protein: 1, carbs: 25, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"] },
  { id: "orange", name: "Orange", region: "global", portion: "1 medium", calories: 62, protein: 1, carbs: 15, fat: 0, vegetarian: true, role: "fruit", slots: [S], tags: ["fruit"] },
  { id: "almonds", name: "Almonds", region: "global", portion: "1 oz (28g)", calories: 165, protein: 6, carbs: 6, fat: 14, vegetarian: true, role: "snack", slots: [S], tags: ["nuts"], minAmount: 15, maxAmount: 42 },
  // "2 tbsp (32g)" makes the portion gram-scalable with a tight cap so this dense
  // fat is used as a small calorie boost, never scaled toward 100g.
  { id: "peanut_butter", name: "Peanut butter", region: "global", portion: "2 tbsp (32g)", calories: 190, protein: 7, carbs: 7, fat: 16, vegetarian: true, role: "snack", slots: [B, S], tags: ["nuts"], minAmount: 16, maxAmount: 32 },
  { id: "whey", name: "Whey protein shake", region: "global", portion: "1 scoop", calories: 120, protein: 24, carbs: 3, fat: 2, vegetarian: true, role: "protein", slots: [B, S], tags: ["dairy", "supplement"], maxAmount: 1, plannerUnit: "serving" },
  { id: "salad", name: "Green salad", region: "global", portion: "1 bowl", calories: 30, protein: 2, carbs: 6, fat: 0, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"] },
  { id: "boiled_egg1", name: "1 boiled egg", region: "global", portion: "1 egg", calories: 80, protein: 6, carbs: 1, fat: 5, vegetarian: true, role: "protein", slots: [B, S], tags: ["egg"], aliases: ["boiled egg", "boiled eggs", "ubla anda"], maxAmount: 4 },

  // ---- Phase 4: vegetarian proteins (fixes thin veg coverage) ----
  // Macros are the representative midpoint of a portion range (see Phase 4 notes).
  { id: "paneer", name: "Paneer", region: "desi", portion: "1 serving (~100g)", calories: 260, protein: 18, carbs: 3, fat: 16, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["dairy", "paneer"], aliases: ["panir"], profileRegions: ["india"], maxAmount: 150 },
  { id: "rajma", name: "Rajma (kidney beans)", region: "desi", portion: "1 katori (~200g)", calories: 210, protein: 9, carbs: 30, fat: 4, vegetarian: true, role: "protein", slots: [L, D], tags: ["beans", "lentil"], aliases: ["lal lobia", "kidney beans", "red beans"], profileRegions: ["india"] },
  { id: "lobia", name: "Lobia (black-eyed peas)", region: "desi", portion: "1 katori (~200g)", calories: 190, protein: 11, carbs: 28, fat: 3, vegetarian: true, role: "protein", slots: [L, D], tags: ["beans", "lentil"], aliases: ["black eyed peas", "black-eyed peas", "cowpeas"] },
  { id: "soya", name: "Soya chunks", region: "global", portion: "1 cup cooked (~150g)", calories: 180, protein: 18, carbs: 12, fat: 4, vegetarian: true, role: "protein", slots: [L, D], tags: ["soya"], aliases: ["soy chunks", "soya chunks", "nutri"] },
  { id: "tofu", name: "Tofu", region: "global", portion: "100g", calories: 120, protein: 13, carbs: 3, fat: 7, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["soya", "tofu"], aliases: ["bean curd"], profileRegions: ["india", "us_canada", "uk_europe"] },
  { id: "chana_chaat", name: "Chana chaat", region: "desi", portion: "1 bowl (~200g)", calories: 250, protein: 11, carbs: 35, fat: 7, vegetarian: true, role: "protein", slots: [S, L], tags: ["lentil", "chaat"], aliases: ["cholay chaat", "chickpea chaat", "chana chat"] },
  // USDA SR: chickpeas, cooked and boiled without salt, per 100g.
  { id: "boiled_chickpeas", name: "Boiled chickpeas", region: "global", portion: "100g", calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6, vegetarian: true, role: "protein", slots: [B, L, D, S], tags: ["beans", "lentil"], aliases: ["plain chickpeas", "cooked chickpeas", "garbanzo beans"], profileRegions: ["india", "middle_east", "us_canada", "uk_europe"], maxAmount: 250 },
  // USDA FNDDS: plain hummus, per 100g.
  { id: "hummus", name: "Plain hummus", region: "global", portion: "100g", calories: 243, protein: 7.4, carbs: 14.9, fat: 17.1, vegetarian: true, role: "snack", slots: [L, D, S], tags: ["beans", "sesame"], aliases: ["hummus", "houmous"], profileRegions: MIDDLE_EAST, minAmount: 25, maxAmount: 100 },
  // Verified curated row: one katori raita (150g).
  { id: "raita", name: "Raita", region: "desi", portion: "1 katori (~150g)", calories: 90, protein: 4, carbs: 8, fat: 4, vegetarian: true, role: "dairy", slots: [L, D, S], tags: ["dairy"], aliases: ["yogurt raita"], profileRegions: PK_IN, maxAmount: 300 },

  // ---- Phase 4: desi staples ----
  { id: "naan", name: "Naan", region: "desi", portion: "1 medium", calories: 260, protein: 8, carbs: 48, fat: 5, vegetarian: true, role: "carb", slots: [L, D], tags: ["bread"], aliases: ["nan"], maxAmount: 2 },
  { id: "nihari", name: "Nihari (beef)", region: "desi", portion: "1 serving (~250g)", calories: 450, protein: 28, carbs: 12, fat: 32, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"], aliases: ["nehari", "beef stew"] },
  { id: "haleem", name: "Haleem", region: "desi", portion: "1 bowl (~250g)", calories: 310, protein: 18, carbs: 30, fat: 12, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["beef", "lentil"], aliases: ["khichra", "daleem", "hareesa"] },
  { id: "pulao", name: "Chicken pulao", region: "desi", portion: "1 plate (~300g)", calories: 470, protein: 22, carbs: 58, fat: 16, vegetarian: false, role: "carb", slots: [L, D], tags: ["chicken", "rice"], aliases: ["pilau", "yakhni pulao", "palao"] },
  { id: "aloo_paratha", name: "Aloo paratha", region: "desi", portion: "1 stuffed", calories: 300, protein: 6, carbs: 42, fat: 12, vegetarian: true, role: "carb", slots: [B], tags: ["bread", "fried"], aliases: ["potato paratha"] },
  { id: "shami", name: "Shami kababs", region: "desi", portion: "2 kababs", calories: 200, protein: 14, carbs: 6, fat: 13, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["beef"], aliases: ["shaami", "shami kebab"] },
  { id: "chapli", name: "Chapli kebab", region: "desi", portion: "1 kebab (~120g)", calories: 300, protein: 18, carbs: 6, fat: 23, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["beef"], aliases: ["chapli"] },
  { id: "beef_karahi", name: "Beef/mutton karahi", region: "desi", portion: "1 serving (~250g)", calories: 420, protein: 30, carbs: 8, fat: 30, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef"], aliases: ["mutton karahi", "beef karahi", "gosht karahi"] },
  { id: "fried_fish", name: "Fried fish", region: "desi", portion: "1 piece (~120g)", calories: 280, protein: 22, carbs: 8, fat: 18, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["fish", "fried"], aliases: ["fish fry", "tali machli"] },
  { id: "samosa", name: "Samosa", region: "desi", portion: "1 piece", calories: 150, protein: 3, carbs: 17, fat: 8, vegetarian: true, role: "snack", slots: [S], tags: ["fried", "snack"], aliases: ["samose", "samosay"] },
  { id: "pakora", name: "Pakora", region: "desi", portion: "1 plate (~100g)", calories: 180, protein: 5, carbs: 18, fat: 10, vegetarian: true, role: "snack", slots: [S], tags: ["fried", "snack"], aliases: ["pakore", "bhajia", "pakoray"] },
  { id: "namkeen_lassi", name: "Namkeen lassi", region: "desi", portion: "1 glass", calories: 120, protein: 6, carbs: 8, fat: 6, vegetarian: true, role: "drink", slots: [B, S], tags: ["dairy"], aliases: ["salty lassi", "chaas"] },

  // ---- Phase 4: western / fast food / snacks ----
  { id: "chicken_sandwich", name: "Chicken sandwich", region: "western", portion: "1 sandwich", calories: 350, protein: 25, carbs: 35, fat: 12, vegetarian: false, role: "protein", slots: [L, S], tags: ["chicken", "bread"], aliases: ["sandwich", "club sandwich"] },
  { id: "beef_burger", name: "Beef burger", region: "western", portion: "1 burger", calories: 500, protein: 25, carbs: 40, fat: 27, vegetarian: false, role: "protein", slots: [L, D], tags: ["beef", "fastfood"], aliases: ["burger"] },
  { id: "pizza_slice", name: "Pizza (1 slice)", region: "western", portion: "1 slice", calories: 285, protein: 12, carbs: 36, fat: 10, vegetarian: true, role: "carb", slots: [L, D, S], tags: ["dairy", "bread", "fastfood"], aliases: ["pizza"] },
  { id: "fries", name: "French fries", region: "western", portion: "1 medium (~110g)", calories: 310, protein: 4, carbs: 41, fat: 15, vegetarian: true, role: "snack", slots: [S], tags: ["fried", "fastfood"], aliases: ["french fries", "chips"] },
  { id: "cornflakes", name: "Cornflakes with milk", region: "western", portion: "1 bowl + milk", calories: 250, protein: 9, carbs: 40, fat: 6, vegetarian: true, role: "carb", slots: [B], tags: ["cereal", "dairy"], aliases: ["cereal", "corn flakes"] },
  { id: "cheese", name: "Cheese slice", region: "western", portion: "1 slice (~20g)", calories: 70, protein: 4, carbs: 1, fat: 6, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy", "cheese"], aliases: ["cheddar", "cheese slice"], minAmount: 20, maxAmount: 40 },
  { id: "dates", name: "Dates", region: "global", portion: "3 dates", calories: 70, protein: 1, carbs: 18, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit", "sweet"], aliases: ["khajoor", "khajur"] },
  { id: "banana_shake", name: "Banana shake", region: "global", portion: "1 glass", calories: 250, protein: 8, carbs: 40, fat: 6, vegetarian: true, role: "drink", slots: [B, S], tags: ["dairy", "sweet", "fruit"], aliases: ["milkshake", "banana milkshake"] },
  { id: "mango", name: "Mango", region: "global", portion: "1 medium", calories: 150, protein: 2, carbs: 38, fat: 1, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["aam"] },

  // ===========================================================================
  // Phase 6B: verified catalog expansion. Macros are USDA FoodData Central
  // standard reference values (per the stated portion), the same source family
  // the rows above already cite; a couple reuse the app's curated seed-foods row.
  // Region/profileRegions keep each food in cuisine-appropriate plans.
  // ===========================================================================

  // ---- lean dairy (high-protein levers) ----
  // USDA FDC: cottage cheese, lowfat, 1% milkfat, per 100g.
  { id: "lowfat_cottage_cheese", name: "Low-fat cottage cheese", region: "western", portion: "100g", calories: 72, protein: 12.4, carbs: 2.7, fat: 1, vegetarian: true, role: "protein", slots: [B, L, S], tags: ["dairy", "cheese"], aliases: ["low fat cottage cheese", "1% cottage cheese", "lowfat cottage cheese"], profileRegions: US_UK, maxAmount: 300 },
  // USDA FDC: milk, reduced fat, 2% milkfat (per ~250ml glass).
  { id: "milk_lowfat", name: "Low-fat milk", region: "global", portion: "1 glass (~250ml)", calories: 125, protein: 8, carbs: 12, fat: 5, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy"], aliases: ["low fat milk", "skim milk", "2% milk", "skimmed milk", "low fat doodh"], profileRegions: ["pakistan", "india", "us_canada", "uk_europe"] },

  // ---- vegetarian proteins (veg + flexitarian + high-protein variety) ----
  // USDA FDC: edamame, frozen, prepared, per 100g.
  { id: "edamame", name: "Edamame", region: "global", portion: "100g", calories: 121, protein: 11.9, carbs: 8.9, fat: 5.2, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["soya", "beans"], aliases: ["soybeans", "green soybeans", "mukimame"], profileRegions: ["us_canada", "uk_europe", "india"], maxAmount: 250 },
  // USDA FDC: beans, black, mature seeds, cooked, boiled, per 100g.
  { id: "black_beans", name: "Black beans (cooked)", region: "global", portion: "100g", calories: 132, protein: 8.9, carbs: 23.7, fat: 0.5, vegetarian: true, role: "protein", slots: [L, D], tags: ["beans"], aliases: ["black bean", "frijoles negros"], profileRegions: US_UK, maxAmount: 250 },
  // USDA FDC: lentils, mature seeds, cooked, boiled, per 100g.
  { id: "lentils", name: "Lentils (cooked)", region: "global", portion: "100g", calories: 116, protein: 9, carbs: 20, fat: 0.4, vegetarian: true, role: "protein", slots: [L, D], tags: ["lentil", "beans"], aliases: ["brown lentils", "green lentils", "cooked lentils", "puy lentils"], profileRegions: ["us_canada", "uk_europe", "middle_east"], maxAmount: 250 },
  // USDA FDC: tempeh, per 100g.
  { id: "tempeh", name: "Tempeh", region: "western", portion: "100g", calories: 192, protein: 20, carbs: 8, fat: 11, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["soya", "tempeh"], aliases: ["fermented soybean cake"], profileRegions: US_UK, maxAmount: 200 },

  // ---- lean fish / seafood (flexitarian + non-veg + high-protein-low-cal) ----
  // USDA FDC: fish, cod, Atlantic, cooked, dry heat, per 100g.
  { id: "white_fish", name: "White fish (cod/tilapia)", region: "global", portion: "100g", calories: 105, protein: 22.8, carbs: 0, fat: 0.9, vegetarian: false, role: "protein", slots: [L, D], tags: ["fish"], aliases: ["cod", "tilapia", "white fish", "pollock", "haddock"], profileRegions: ["pakistan", "india", "us_canada", "uk_europe", "middle_east"], maxAmount: 250 },
  // USDA FDC: crustaceans, shrimp, cooked, per 100g.
  { id: "shrimp", name: "Shrimp / prawns (cooked)", region: "global", portion: "100g", calories: 99, protein: 24, carbs: 0.2, fat: 0.3, vegetarian: false, role: "protein", slots: [L, D, S], tags: ["seafood", "shellfish"], aliases: ["shrimp", "prawns", "jhinga", "grilled prawns"], profileRegions: ["us_canada", "uk_europe", "middle_east"], maxAmount: 250 },

  // ---- carbs / staples ----
  // USDA FDC: quinoa, cooked (per 1 cup, 185g).
  { id: "quinoa", name: "Quinoa (cooked)", region: "global", portion: "1 cup (185g)", calories: 222, protein: 8, carbs: 39, fat: 4, vegetarian: true, role: "carb", slots: [B, L, D], tags: ["grain"], aliases: ["cooked quinoa"], profileRegions: ["us_canada", "uk_europe", "india"], maxAmount: 300 },
  // USDA FDC: sweet potato, cooked, baked in skin (per ~150g).
  { id: "sweet_potato", name: "Sweet potato (baked)", region: "global", portion: "1 medium (~150g)", calories: 135, protein: 3, carbs: 31, fat: 0, vegetarian: true, role: "carb", slots: [L, D], tags: ["veg", "potato"], aliases: ["sweet potatoes", "baked sweet potato", "shakarkandi"], profileRegions: US_UK, maxAmount: 300 },
  // USDA FDC: pasta, whole-wheat, cooked (per 1 cup, 140g).
  { id: "ww_pasta", name: "Whole wheat pasta", region: "western", portion: "1 cup (140g)", calories: 174, protein: 7, carbs: 37, fat: 1, vegetarian: true, role: "carb", slots: [L, D], tags: ["pasta"], aliases: ["whole wheat pasta", "wholemeal pasta", "whole grain pasta"], profileRegions: US_UK, maxAmount: 300 },
  // USDA FDC: couscous, cooked (per 1 cup, 157g).
  { id: "couscous", name: "Couscous (cooked)", region: "global", portion: "1 cup (157g)", calories: 176, protein: 6, carbs: 36, fat: 0, vegetarian: true, role: "carb", slots: [L, D], tags: ["grain"], aliases: ["cooked couscous"], profileRegions: ["middle_east", "us_canada", "uk_europe"], maxAmount: 300 },
  // USDA FDC: bagel, whole grain (per 1 bagel, ~98g).
  { id: "ww_bagel", name: "Whole wheat bagel", region: "western", portion: "1 bagel", calories: 250, protein: 10, carbs: 48, fat: 2, vegetarian: true, role: "carb", slots: [B], tags: ["bread"], aliases: ["wholemeal bagel", "whole grain bagel"], profileRegions: US_UK, maxAmount: 2 },

  // ---- healthy fats / calorie repair (small, hard-capped) ----
  // Verified curated row (scripts/seed-foods.mjs): avocado, half (100g).
  { id: "avocado", name: "Avocado", region: "global", portion: "half (100g)", calories: 160, protein: 2, carbs: 9, fat: 15, vegetarian: true, role: "snack", slots: [B, L, S], tags: ["fat"], aliases: ["avo"], profileRegions: US_UK, minAmount: 50, maxAmount: 150 },
  // USDA FDC: nuts, walnuts, english (per 1 oz, 28g).
  { id: "walnuts", name: "Walnuts", region: "global", portion: "1 oz (28g)", calories: 185, protein: 4, carbs: 4, fat: 18, vegetarian: true, role: "snack", slots: [S], tags: ["nuts"], aliases: ["walnut", "akhrot"], minAmount: 15, maxAmount: 42 },
  // USDA FDC: nuts, cashew, dry roasted (per 1 oz, 28g).
  { id: "cashews", name: "Cashews", region: "global", portion: "1 oz (28g)", calories: 157, protein: 5, carbs: 9, fat: 12, vegetarian: true, role: "snack", slots: [S], tags: ["nuts"], aliases: ["cashew", "kaju"], minAmount: 15, maxAmount: 42 },
  // USDA FDC: seeds, pumpkin/pepitas, roasted (per 1 oz, 28g).
  { id: "pumpkin_seeds", name: "Pumpkin seeds", region: "global", portion: "1 oz (28g)", calories: 158, protein: 9, carbs: 4, fat: 14, vegetarian: true, role: "snack", slots: [S], tags: ["seeds"], aliases: ["pepitas", "kaddu ke beej"], minAmount: 15, maxAmount: 42 },
  // USDA FDC: seeds, chia, dried (per 1 oz, 28g).
  { id: "chia_seeds", name: "Chia seeds", region: "global", portion: "1 oz (28g)", calories: 138, protein: 5, carbs: 12, fat: 9, vegetarian: true, role: "snack", slots: [B, S], tags: ["seeds"], aliases: ["chia", "chia seed"], minAmount: 15, maxAmount: 42 },

  // ---- fruit (snack rotation variety) ----
  // USDA FDC: grapes, raw (per 1 cup, 151g).
  { id: "grapes", name: "Grapes", region: "global", portion: "1 cup (151g)", calories: 104, protein: 1, carbs: 27, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["grape", "angoor"] },
  // USDA FDC: watermelon, raw (per 1 cup diced, 152g).
  { id: "watermelon", name: "Watermelon", region: "global", portion: "1 cup (152g)", calories: 46, protein: 1, carbs: 12, fat: 0, vegetarian: true, role: "fruit", slots: [S], tags: ["fruit"], aliases: ["tarbooz"] },
  // USDA FDC: guava, common, raw, per 100g.
  { id: "guava", name: "Guava", region: "desi", portion: "100g", calories: 68, protein: 3, carbs: 14, fat: 1, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["amrood"], profileRegions: PK_IN, maxAmount: 200 },
  // USDA FDC: papaya, raw (per 1 cup cubes, 145g).
  { id: "papaya", name: "Papaya", region: "global", portion: "1 cup (145g)", calories: 62, protein: 1, carbs: 16, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["papita"], profileRegions: PK_IN },
  // USDA FDC: pears, raw (per 1 medium, 178g).
  { id: "pear", name: "Pear", region: "western", portion: "1 medium (~178g)", calories: 101, protein: 1, carbs: 27, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["pears", "nashpati"], profileRegions: US_UK },
  // USDA FDC: blueberries, raw (per 1 cup, 148g).
  { id: "blueberries", name: "Blueberries", region: "western", portion: "1 cup (148g)", calories: 84, protein: 1, carbs: 21, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["blueberry"], profileRegions: US_UK },
  // USDA FDC: strawberries, raw (per 1 cup, 152g).
  { id: "strawberries", name: "Strawberries", region: "western", portion: "1 cup (152g)", calories: 49, protein: 1, carbs: 12, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["strawberry"], profileRegions: US_UK },

  // ---- vegetables / sides (plain, low-cal) ----
  // Verified curated row (scripts/seed-foods.mjs): broccoli, cooked, 1 cup (156g).
  { id: "broccoli", name: "Broccoli (cooked)", region: "global", portion: "1 cup (156g)", calories: 55, protein: 4, carbs: 11, fat: 1, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"], aliases: ["steamed broccoli"], maxAmount: 300 },
  // USDA FDC: spinach, cooked, boiled, drained (per 1 cup, 180g).
  { id: "spinach_cooked", name: "Spinach (cooked, plain)", region: "global", portion: "1 cup (180g)", calories: 41, protein: 5, carbs: 7, fat: 0, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"], aliases: ["boiled spinach", "steamed spinach"], maxAmount: 300 },
  // USDA FDC: carrots, cooked, boiled, drained (per 1 cup, 156g).
  { id: "carrots", name: "Carrots (cooked)", region: "global", portion: "1 cup (156g)", calories: 55, protein: 1, carbs: 13, fat: 0, vegetarian: true, role: "veg", slots: [L, D], tags: ["veg"], aliases: ["carrot", "gajar"], maxAmount: 300 },
  // USDA FDC: cucumber, with peel, raw (per ~120g).
  { id: "cucumber", name: "Cucumber", region: "global", portion: "1 cup (~120g)", calories: 16, protein: 1, carbs: 4, fat: 0, vegetarian: true, role: "veg", slots: [L, D, S], tags: ["veg", "salad"], aliases: ["kheera", "cucumbers"], maxAmount: 300 },

  // ---- Middle East legume ----
  // USDA FDC: broad beans (fava), mature seeds, cooked, boiled (per ~150g bowl).
  { id: "foul", name: "Ful medames (fava beans)", region: "global", portion: "1 bowl (~150g)", calories: 165, protein: 11, carbs: 30, fat: 1, vegetarian: true, role: "protein", slots: [B, L, D], tags: ["beans"], aliases: ["ful", "ful medames", "foul", "fava beans", "broad beans"], profileRegions: MIDDLE_EAST, maxAmount: 250 },

  // ---- coffee (macros verified against USDA/nutrition sources) ----
  { id: "black_coffee", name: "Black coffee", region: "global", portion: "1 cup", calories: 5, protein: 0, carbs: 0, fat: 0, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee"], aliases: ["coffee no milk", "kali coffee", "americano"] },
  { id: "coffee", name: "Coffee (milk & sugar)", region: "global", portion: "1 cup", calories: 80, protein: 2, carbs: 13, fat: 2, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee", "dairy", "sweet"], aliases: ["coffee", "nescafe", "doodh coffee", "milk coffee", "coffee with milk"] },
  { id: "cold_coffee", name: "Cold coffee (shake)", region: "global", portion: "1 glass", calories: 220, protein: 7, carbs: 32, fat: 7, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee", "dairy", "sweet"], aliases: ["cold coffee", "coffee shake", "iced coffee", "frappe", "coffee milkshake"] },
];

/** Quick lookup by id (used when applying swaps). */
// Staple assignments for the simple, repeatable generator: hit protein from a
// few familiar sources, fill calories with plain carb bases, fruit for snacks.
const STAPLES: Record<string, NonNullable<CatalogFood["staple"]>> = {
  // protein anchors (desi + western + veg)
  eggs2: "protein", omelette: "protein", scrambled: "protein", boiled_egg1: "protein",
  chicken_salan: "protein", chicken_karahi: "protein", chicken_tikka: "protein",
  chicken_breast: "protein", chicken_thigh: "protein", turkey_breast: "protein",
  turkey_mince: "protein", qeema: "protein", ground_beef: "protein",
  lean_beef_steak: "protein",
  beef_karahi: "protein", fish_curry: "protein", tuna: "protein", salmon: "protein",
  daal: "protein", chana: "protein", paneer: "protein", tofu: "protein",
  soya: "protein", rajma: "protein", lobia: "protein", greek_yogurt: "protein",
  cottage_cheese: "protein", boiled_chickpeas: "protein",
  // Phase 6B protein anchors
  lowfat_cottage_cheese: "protein", edamame: "protein", black_beans: "protein",
  lentils: "protein", tempeh: "protein", white_fish: "protein", shrimp: "protein",
  foul: "protein",
  // carb bases
  roti1: "carb", roti2: "carb", rice: "carb", brown_rice: "carb",
  oats: "carb", bread2: "carb", pita: "carb", baked_potato: "carb",
  boiled_potato: "carb", mashed_potato: "carb",
  // Phase 6B carb bases
  quinoa: "carb", sweet_potato: "carb", ww_pasta: "carb", couscous: "carb", ww_bagel: "carb",
  // fruit snacks
  banana: "fruit", apple: "fruit", orange: "fruit", mango: "fruit", dates: "fruit",
  // Phase 6B fruit
  grapes: "fruit", watermelon: "fruit", guava: "fruit", papaya: "fruit",
  pear: "fruit", blueberries: "fruit", strawberries: "fruit",
  // plain sides
  salad: "side", mix_sabzi: "side", palak: "side", dahi: "side",
  hummus: "side", raita: "side",
  // NOTE: Phase 6B vegetables (broccoli, spinach_cooked, carrots, cucumber) are
  // intentionally NOT staples — sides are already well-covered, so they stay as
  // swap/search/log options without changing automatic generation.
};
for (const f of FOOD_CATALOG) {
  const s = STAPLES[f.id];
  if (s) f.staple = s;
}

export const CATALOG_BY_ID: Record<string, CatalogFood> = Object.fromEntries(
  FOOD_CATALOG.map((f) => [f.id, f])
);
