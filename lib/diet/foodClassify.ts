import type { CatalogFood, FoodRole, MealSlot } from "./foodCatalog.ts";

/**
 * Diet Phase 1 — classify a raw `foods`-table row (USDA + curated, per-100g for
 * USDA) into a planner-ready meal food, or EXCLUDE it.
 *
 * Why this exists: the `foods` table has macros but no meal metadata (role /
 * slots / vegetarian / tags), and USDA SR-Legacy is mostly raw ingredients,
 * oils, sugars and condiments at per-100g — none of which belong in a meal plan
 * as-is. This pure, deterministic layer keeps ONLY meal-appropriate whole foods,
 * gives each a role/slots/veg/tags and a realistic serving, so the planner can
 * build balanced, filterable plates from them — exactly like the curated catalog.
 *
 * Precision over recall: when in doubt, exclude. Better a few hundred clean
 * foods than thousands of messy ones. Pure (no DB/AI) so it's unit-tested.
 */

export interface RawFoodRow {
  id: string;
  name: string;
  aliases?: string[] | null;
  region?: string | null;
  portion?: string | null;
  portion_grams?: number | null; // grams the macros below describe (USDA = 100)
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source?: string | null;
}

// Animal flesh / products → not vegetarian.
const NONVEG =
  /\b(beef|veal|steak|brisket|pork|bacon|ham|sausages?|salami|pepperoni|lamb|mutton|goat|chicken|turkey|duck|quail|poultry|fish|salmon|tuna|cod|tilapia|trout|sardines?|anchov(?:y|ies)|mackerel|herring|haddock|catfish|shrimps?|prawns?|crab|lobster|clams?|oysters?|mussels?|scallops?|squid|octopus|meat|liver|kidney|tripe|gelatin|broth)\b/i;

// Hard excludes — ingredients / pure fats / sugars / condiments / beverages /
// dry mixes. Gated by NUT_OK so nut butters & nuts survive.
// NOTE: "water" is intentionally NOT here — names like "tuna, canned in water"
// must survive; actual water/diet drinks are dropped by the calorie floor below.
const EXCLUDE =
  /\b(oils?|fats?|lard|shortening|tallow|margarine|ghee|butter|sugars?|syrups?|molasses|salts?|spices?|seasonings?|cinnamon|cumin|coriander seed|paprika|nutmeg|cloves?|turmeric|chil(?:i|li) powder|cayenne|extracts?|flavou?ring|leavening|baking powder|baking soda|yeast|cornstarch|starch|flours?|gelatin|vinegars?|sauces?|gravy|gravies|frosting|icing|dressings?|mayonnaise|ketchup|mustard|relish|pickles?|jams?|jell(?:y|ies)|preserves|marmalade|candies|candy|gums?|alcoholic|wine|beer|liquor|vodka|whiskey|rum|infant formula|baby ?food|formula|dry mix|dehydrated|concentrate|bouillon|stock|leavening|malt\b|tapioca)\b/i;

// High-fat but legitimate whole foods (so the fat-fraction rule doesn't drop them).
const NUT_OK = /\b(almonds?|peanuts?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|nuts?|seeds?|avocados?)\b/i;

// Role detection, in priority order (first match wins).
const ROLE_RULES: { role: FoodRole; re: RegExp }[] = [
  {
    role: "protein",
    re: /\b(beef|veal|steak|pork|bacon|ham|sausages?|salami|pepperoni|lamb|mutton|goat|chicken|turkey|duck|fish|salmon|tuna|cod|tilapia|trout|sardines?|mackerel|shrimps?|prawns?|crab|lobster|eggs?|omelette?|tofu|tempeh|seitan|lentils?|daa?l|dahl|beans?|chick ?peas?|garbanzo|chana|rajma|edamame|soy(?:bean)?|paneer|cottage cheese|whey|protein|meat|meatballs?|kebabs?|kabobs?|kababs?|kofta|cutlets?|nuggets?|patt(?:y|ies)|frankfurters?|hot ?dogs?|bratwurst|chorizo|jerky)\b/i,
  },
  { role: "dairy", re: /\b(milk|yog(?:h)?urt|curd|dahi|cheese|paneer|lassi|kefir|buttermilk)\b/i },
  {
    role: "fruit",
    re: /\b(apples?|bananas?|mangoe?s?|oranges?|grapes?|berr(?:y|ies)|strawberr\w*|blueberr\w*|melon|watermelon|papaya|guava|pears?|peach\w*|plums?|apricots?|pineapple|pomegranate|kiwi|avocados?|fruits?|dates?|raisins?|figs?)\b/i,
  },
  {
    role: "veg",
    re: /\b(vegetables?|spinach|palak|broccoli|carrots?|cauliflower|gobi|okra|bhindi|cabbage|lettuce|salad|greens|kale|cucumber|tomato\w*|capsicum|bell pepper|eggplant|brinjal|baingan|peas|zucchini|squash|mushrooms?|onions?)\b/i,
  },
  {
    role: "carb",
    re: /\b(rice|bread|rotis?|naan|chapatis?|parathas?|pasta|spaghetti|macaroni|noodles?|potato\w*|aloo|oats?|oatmeal|cereal|quinoa|couscous|tortilla|bagel|buns?|crackers?|biscuits?|porridge|daliya|poha|upma|idli|dosa|pancakes?|waffles?|wheat|barley|millet)\b/i,
  },
  { role: "drink", re: /\b(juice|smoothie|shake|tea|coffee|lassi|milk)\b/i },
  { role: "snack", re: /\b(nuts?|almonds?|peanuts?|cashews?|walnuts?|pistachios?|seeds?|popcorn|granola|trail mix|protein bar)\b/i },
];

const TAG_RULES: { tag: string; re: RegExp }[] = [
  { tag: "beef", re: /\b(beef|veal|steak|brisket)\b/i },
  { tag: "pork", re: /\b(pork|bacon|ham|sausages?|salami|pepperoni)\b/i },
  { tag: "chicken", re: /\b(chicken|turkey|duck|poultry)\b/i },
  { tag: "fish", re: /\b(fish|salmon|tuna|cod|tilapia|trout|sardines?|mackerel|shrimps?|prawns?|crab|lobster|herring|anchov)\b/i },
  { tag: "egg", re: /\beggs?\b|omelette?/i },
  { tag: "dairy", re: /\b(milk|yog(?:h)?urt|cheese|paneer|curd|dahi|lassi|kefir|buttermilk|cream)\b/i },
  { tag: "nuts", re: /\b(almonds?|peanuts?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|nuts?)\b/i },
];

// Realistic single-serving grams per role (USDA macros are per 100g).
const SERVING_G: Record<FoodRole, number> = {
  protein: 150,
  carb: 150,
  veg: 120,
  fruit: 130,
  dairy: 200,
  drink: 250,
  snack: 35,
};

function slotsFor(role: FoodRole, lower: string): MealSlot[] {
  switch (role) {
    case "protein":
      return /\beggs?\b/.test(lower) ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
    case "carb":
      return ["breakfast", "lunch", "dinner"];
    case "veg":
      return ["lunch", "dinner"];
    case "fruit":
    case "dairy":
    case "drink":
      return ["breakfast", "snack"];
    default:
      return ["snack"];
  }
}

function regionOf(raw: RawFoodRow): CatalogFood["region"] {
  return raw.region === "desi" || raw.region === "western" || raw.region === "global" ? raw.region : "global";
}

/** Classify one row → a planner meal food, or null to EXCLUDE it. Pure. */
export function classifyFood(raw: RawFoodRow): CatalogFood | null {
  const lower = raw.name.toLowerCase();
  if (!lower.trim() || !Number.isFinite(raw.calories)) return null;

  // 1) Hard ingredient/condiment excludes (nuts & nut butters survive).
  if (EXCLUDE.test(lower) && !NUT_OK.test(lower)) return null;

  const baseG = raw.portion_grams && raw.portion_grams > 0 ? raw.portion_grams : 100;
  const per100 = (n: number) => (n / baseG) * 100;
  const kcal100 = per100(raw.calories);
  const protein100 = per100(raw.protein_g);
  const fat100 = per100(raw.fat_g);

  // 2) Macro-based excludes: near-empty (water/diet/condiment) or pure fat.
  if (kcal100 < 20) return null;
  if (kcal100 > 0 && (fat100 * 9) / kcal100 > 0.75 && protein100 < 8 && !NUT_OK.test(lower)) return null;

  // 3) Raw animal flesh → prefer the cooked version; never plate "raw beef".
  if (NONVEG.test(lower) && /\braw\b/.test(lower)) return null;

  // 4) Role — if we can't confidently classify it, exclude it.
  const role = ROLE_RULES.find((r) => r.re.test(lower))?.role;
  if (!role) return null;

  // 5) Realistic serving + macros scaled from per-100g.
  const servingG = SERVING_G[role];
  const factor = servingG / baseG;
  const scale = (n: number) => Math.max(0, Math.round(n * factor));

  const tags = TAG_RULES.filter((t) => t.re.test(lower)).map((t) => t.tag);

  return {
    id: `db:${raw.id}`,
    name: cleanName(raw.name),
    region: regionOf(raw),
    portion: `~${servingG}g`,
    calories: scale(raw.calories),
    protein: scale(raw.protein_g),
    carbs: scale(raw.carbs_g),
    fat: scale(raw.fat_g),
    vegetarian: !NONVEG.test(lower),
    role,
    slots: slotsFor(role, lower),
    tags,
    aliases: (raw.aliases ?? []).filter(Boolean),
  };
}

/** Classify a batch, dropping excluded rows. */
export function classifyFoods(rows: RawFoodRow[]): CatalogFood[] {
  const out: CatalogFood[] = [];
  for (const r of rows) {
    const f = classifyFood(r);
    if (f) out.push(f);
  }
  return out;
}

// USDA names are "Category, descriptor, descriptor" — keep the first 2 segments
// for a friendlier label ("Chicken, breast, roasted" → "Chicken, breast").
function cleanName(name: string): string {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return name.trim();
  return `${parts[0]}, ${parts[1]}`;
}
