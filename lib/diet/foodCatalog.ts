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
}

const B: MealSlot = "breakfast";
const L: MealSlot = "lunch";
const D: MealSlot = "dinner";
const S: MealSlot = "snack";

export const FOOD_CATALOG: CatalogFood[] = [
  // ---- desi proteins ----
  { id: "eggs2", name: "2 eggs (boiled/fried)", region: "desi", portion: "2 eggs", calories: 160, protein: 12, carbs: 2, fat: 11, vegetarian: true, role: "protein", slots: [B, S], tags: ["egg"] },
  { id: "omelette", name: "Omelette (2 eggs)", region: "desi", portion: "2 eggs", calories: 200, protein: 12, carbs: 2, fat: 16, vegetarian: true, role: "protein", slots: [B], tags: ["egg"] },
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
  { id: "scrambled", name: "Scrambled eggs", region: "western", portion: "2 eggs", calories: 180, protein: 12, carbs: 2, fat: 14, vegetarian: true, role: "protein", slots: [B], tags: ["egg"] },

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
  { id: "boiled_egg1", name: "1 boiled egg", region: "global", portion: "1 egg", calories: 80, protein: 6, carbs: 1, fat: 5, vegetarian: true, role: "protein", slots: [B, S], tags: ["egg"] },

  // ---- Phase 4: vegetarian proteins (fixes thin veg coverage) ----
  // Macros are the representative midpoint of a portion range (see Phase 4 notes).
  { id: "paneer", name: "Paneer", region: "desi", portion: "1 serving (~100g)", calories: 260, protein: 18, carbs: 3, fat: 16, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["dairy", "paneer"], aliases: ["panir", "cottage cheese"] },
  { id: "rajma", name: "Rajma (kidney beans)", region: "desi", portion: "1 katori (~200g)", calories: 210, protein: 9, carbs: 30, fat: 4, vegetarian: true, role: "protein", slots: [L, D], tags: ["beans", "lentil"], aliases: ["lal lobia", "kidney beans", "red beans"] },
  { id: "lobia", name: "Lobia (black-eyed peas)", region: "desi", portion: "1 katori (~200g)", calories: 190, protein: 11, carbs: 28, fat: 3, vegetarian: true, role: "protein", slots: [L, D], tags: ["beans", "lentil"], aliases: ["black eyed peas", "black-eyed peas", "cowpeas"] },
  { id: "soya", name: "Soya chunks", region: "global", portion: "1 cup cooked (~150g)", calories: 180, protein: 18, carbs: 12, fat: 4, vegetarian: true, role: "protein", slots: [L, D], tags: ["soya"], aliases: ["soy chunks", "soya chunks", "nutri"] },
  { id: "tofu", name: "Tofu", region: "global", portion: "100g", calories: 120, protein: 13, carbs: 3, fat: 7, vegetarian: true, role: "protein", slots: [L, D, S], tags: ["soya", "tofu"], aliases: ["bean curd"] },
  { id: "chana_chaat", name: "Chana chaat", region: "desi", portion: "1 bowl (~200g)", calories: 250, protein: 11, carbs: 35, fat: 7, vegetarian: true, role: "protein", slots: [S, L], tags: ["lentil", "chaat"], aliases: ["cholay chaat", "chickpea chaat", "chana chat"] },

  // ---- Phase 4: desi staples ----
  { id: "naan", name: "Naan", region: "desi", portion: "1 medium", calories: 260, protein: 8, carbs: 48, fat: 5, vegetarian: true, role: "carb", slots: [L, D], tags: ["bread"], aliases: ["nan"] },
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
  { id: "cheese", name: "Cheese slice", region: "western", portion: "1 slice (~20g)", calories: 70, protein: 4, carbs: 1, fat: 6, vegetarian: true, role: "dairy", slots: [B, S], tags: ["dairy", "cheese"], aliases: ["cheddar", "cheese slice"] },
  { id: "dates", name: "Dates", region: "global", portion: "3 dates", calories: 70, protein: 1, carbs: 18, fat: 0, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit", "sweet"], aliases: ["khajoor", "khajur"] },
  { id: "banana_shake", name: "Banana shake", region: "global", portion: "1 glass", calories: 250, protein: 8, carbs: 40, fat: 6, vegetarian: true, role: "drink", slots: [B, S], tags: ["dairy", "sweet", "fruit"], aliases: ["milkshake", "banana milkshake"] },
  { id: "mango", name: "Mango", region: "global", portion: "1 medium", calories: 150, protein: 2, carbs: 38, fat: 1, vegetarian: true, role: "fruit", slots: [B, S], tags: ["fruit"], aliases: ["aam"] },

  // ---- coffee (macros verified against USDA/nutrition sources) ----
  { id: "black_coffee", name: "Black coffee", region: "global", portion: "1 cup", calories: 5, protein: 0, carbs: 0, fat: 0, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee"], aliases: ["coffee no milk", "kali coffee", "americano"] },
  { id: "coffee", name: "Coffee (milk & sugar)", region: "global", portion: "1 cup", calories: 80, protein: 2, carbs: 13, fat: 2, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee", "dairy", "sweet"], aliases: ["coffee", "nescafe", "doodh coffee", "milk coffee", "coffee with milk"] },
  { id: "cold_coffee", name: "Cold coffee (shake)", region: "global", portion: "1 glass", calories: 220, protein: 7, carbs: 32, fat: 7, vegetarian: true, role: "drink", slots: [B, S], tags: ["coffee", "dairy", "sweet"], aliases: ["cold coffee", "coffee shake", "iced coffee", "frappe", "coffee milkshake"] },
];

/** Quick lookup by id (used when applying swaps). */
export const CATALOG_BY_ID: Record<string, CatalogFood> = Object.fromEntries(
  FOOD_CATALOG.map((f) => [f.id, f])
);
