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

// Animal flesh / products → not vegetarian. When in doubt we err NON-veg so a
// vegetarian never gets an accidental meat (covers game meats + processed forms
// like patty/cutlet/kebab whose veg status is ambiguous).
const NONVEG =
  /\b(beef|veal|steak|brisket|pork|bacon|ham|sausages?|salami|pepperoni|lamb|mutton|goat|chicken|turkey|duck|goose|quail|pheasant|partridge|poultry|game meat|venison|elk|bison|buffalo|boar|rabbit|hare|ostrich|emu|antelope|moose|caribou|deer|fish|salmon|tuna|cod|tilapia|trout|sardines?|anchov(?:y|ies)|mackerel|herring|haddock|catfish|shrimps?|prawns?|crab|lobster|crustaceans?|crawfish|crayfish|mollusks?|shellfish|clams?|oysters?|mussels?|scallops?|cuttlefish|whelk|conch|abalone|squid|octopus|frog|snails?|escargot|meat|meatballs?|kebabs?|kababs?|kabobs?|kofta|cutlets?|nuggets?|patt(?:y|ies)|frankfurters?|hot ?dogs?|bratwurst|chorizo|jerky|liver|kidney|tripe|gelatin|broth)\b/i;

// Hard excludes — ingredients / pure fats / sugars / condiments / beverages /
// dry mixes. Gated by NUT_OK so nut butters & nuts survive.
// NOTE: "water" is intentionally NOT here — names like "tuna, canned in water"
// must survive; actual water/diet drinks are dropped by the calorie floor below.
// Also excludes SUPPLEMENT/DRIED/POWDER forms (protein isolate, dried meat/egg,
// milk powder…): they have extreme macro density and otherwise dominate plans.
const EXCLUDE =
  /\b(oils?|fats?|lard|shortening|tallow|margarine|ghee|butter|sugars?|syrups?|molasses|salts?|spices?|seasonings?|cinnamon|cumin|coriander seed|paprika|nutmeg|cloves?|turmeric|chil(?:i|li) powder|cayenne|extracts?|flavou?ring|leavening|baking powder|baking soda|yeast|cornstarch|starch|flours?|gelatin|vinegars?|sauces?|gravy|gravies|frosting|icing|dressings?|mayonnaise|ketchup|mustard|relish|pickles?|jams?|jell(?:y|ies)|preserves|marmalade|candies|candy|gums?|alcoholic|wine|beer|liquor|vodka|whiskey|rum|infant formula|baby ?food|formula|dry mix|dehydrated|dried|powders?|powdered|isolate|concentrate|whey|casein|wheat gluten|protein-?fortified|defatted|supplements?|meal replacement|bars?|chips?|crisps?|bouillon|stock|broth|consomme|leavening|malt\b|tapioca)\b/i;

// Extra excludes for packaged/junk USDA rows and restaurant/brand products that
// are loggable but should not become automatic diet-plan meals.
const ABSOLUTE_EXCLUDE =
  /\b(beverages?|juices?|soft drinks?|cola|soda|smoothies?|shakes?|soups?|snacks?|chocolates?|caramel|fudge|nougat|cookies?|crackers?|cakes?|pies?|pizzas?|pizza rolls?|pastr(?:y|ies)|muffins?|doughnuts?|donuts?|croissants?|sweet rolls?|sweet cheese|sweet yeast|sweet bread|sweet recipe|pan dulce|toaster pastries|desserts?|puddings?|ice creams?|sherbet|fruit leather|candied|maraschino|nectars?|puree|sweetened|trail mix|granola bars?|pretzels?|nachos|waffles?|pancakes?|hash browns?|tostada shells?|shells?|rice and vermicelli mix|pilaf flavor|wheat, (?:durum|hard|soft|winter|spring|sprouted)|flavo(?:u)?red?|ready-to-eat|ready-to-heat|refrigerated dough|smoked|brined|cured|with added solution|sprouted|immature seeds|leafy tips|wheat germ|seed meal|cottonseed|crude|flours?|imitation|alaska native|navajo|apache|shoshone|squirrel|sea cucumber|gefilte ?fish|fish eggs?|roe|lemon peel|orange peel|wafers?|puffs?|puffed|jerky|bacon|ham|sausages?|salami|pepperoni|frankfurters?|hot ?dogs?|bratwurst|chorizo|bologna|nuggets?|breaded|fried|restaurants?)\b/i;

const BRANDED_OR_RESTAURANT =
  /\b(corp(?:oration)?|pillsbury|kraft|quaker|george weston|thomas english muffins|goya|gamesa|la moderna|pepperidge farm|keebler|nabisco|kellogg|mars snackfood|nestle|hershey|reese'?s|toblerone|glutino|schar|wonder|vitasoy|nasoya|digiorno|little caesars|chobani|wendy'?s|mcdonald'?s|burger king|applebee'?s|denny'?s|t\.?g\.?i\.? friday'?s|cracker barrel|subway|domino'?s|papa john'?s|pizza hut|taco bell|kfc)\b/i;

const OFFAL =
  /\b(variety meats?|by-products?|livers?|kidneys?|tripe|hearts?|brains?|tongues?|ears?|tails?|feet|foot|gizzard|giblets|spleen|pancreas|chitterlings|sweetbreads?|blood sausage|headcheese|oxtail)\b/i;

// High-fat but legitimate whole foods (so the fat-fraction rule doesn't drop them).
const NUT_OK = /\b(almonds?|peanuts?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|nuts?|seeds?|avocados?)\b/i;
const NUT_STANDALONE_OK =
  /^(nuts?|seeds?|peanut butter|almond butter|cashew butter|sesame butter|tahini)\b/i;
const MUSTARD_GREEN_OK = /\bmustard\s+(?:spinach|greens?)\b/i;

// Role detection, in priority order (first match wins).
const ROLE_RULES: { role: FoodRole; re: RegExp }[] = [
  {
    role: "protein",
    re: /\b(beef|veal|steak|pork|bacon|ham|sausages?|salami|pepperoni|lamb|mutton|goat|chicken|turkey|duck|fish|salmon|tuna|cod|tilapia|trout|sardines?|mackerel|shrimps?|prawns?|crab|lobster|scallops?|mollusks?|clams?|mussels?|oysters?|cuttlefish|whelk|conch|abalone|squid|octopus|crawfish|crayfish|halibut|snapper|sea bass|perch|pollock|flounder|sole\b|mahi|whitefish|swordfish|herring|anchov|venison|elk|bison|buffalo|moose|deer|rabbit|eggs?|omelette?|tofu|tempeh|seitan|lentils?|daa?l|dahl|beans?|cowpeas?|black-?eyed peas?|split peas?|pigeon peas?|mung|lupins?|chick ?peas?|garbanzo|chana|rajma|edamame|soy(?:bean)?|hummus|falafel|paneer|cottage cheese|whey|protein|meat|meatballs?|kebabs?|kabobs?|kababs?|kofta|cutlets?|nuggets?|patt(?:y|ies)|frankfurters?|hot ?dogs?|bratwurst|chorizo|jerky)\b/i,
  },
  { role: "dairy", re: /\b(milk|yog(?:h)?urt|curd|dahi|cheese|paneer|lassi|kefir|buttermilk)\b/i },
  {
    role: "snack",
    re: /^(nuts?|seeds?|peanut butter|almond butter|cashew butter|sesame butter|tahini)\b|\b(almonds?|peanuts?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|popcorn|granola|trail mix|protein bar)\b/i,
  },
  {
    role: "veg",
    re: /\b(vegetables?|spinach|mustard spinach|mustard greens?|palak|broccoli|carrots?|cauliflower|gobi|okra|bhindi|cabbage|pak-?choi|bok choy|lettuce|salad|greens|kale|chard|collards?|arugula|watercress|cucumber|tomato\w*|capsicum|bell pepper|peppers?|eggplant|brinjal|baingan|peas|zucchini|squash|pumpkins?|mushrooms?|onions?|scallions?|asparagus|brussels|beets?|turnips?|radish\w*|celery|sweet potato\w*|yams?|artichokes?|leeks?|fennel|sprouts?|hearts of palm|gourd|karela|tinda|turai|lauki|chayote|kohlrabi|endive|escarole)\b/i,
  },
  {
    role: "fruit",
    re: /\b(apples?|bananas?|mangoe?s?|oranges?|grapes?|berr(?:y|ies)|strawberr\w*|blueberr\w*|raspberr\w*|blackberr\w*|cranberr\w*|cherr\w*|melon|watermelon|cantaloupe|honeydew|papaya|guava|pears?|peach\w*|plums?|apricots?|nectarines?|pineapple|pomegranate|kiwi|avocados?|lemons?|limes?|tamarinds?|rhubarb|lych\w*|persimmons?|currants?|gooseberr\w*|passion ?fruit|pomelos?|pummelo|clementines?|tangerines?|mandarins?|jackfruit|fruits?|dates?|raisins?|figs?)\b/i,
  },
  {
    role: "carb",
    re: /\b(rice|bread|rotis?|naan|chapatis?|parathas?|pasta|spaghetti|macaroni|noodles?|potato\w*|aloo|oats?|oatmeal|cereal|quinoa|couscous|tortilla|bagel|buns?|crackers?|biscuits?|porridge|daliya|poha|upma|idli|dosa|pancakes?|waffles?|wheat|barley|millet|sorghum|buckwheat|amaranth|teff|cassava|yuca|hominy|sushi|ramen|burritos?|tacos?|sandwich\w*|wraps?|pizza|lasagna|casseroles?|quiche|dumplings?|ravioli|gnocchi|risotto|paella|nachos|quesadillas?|enchiladas?|fried rice|english muffins?|muffins?|focaccia|tostadas?|tamales?|cornmeal|rolls?|pita|sourdough|\brye\b|baguette|bulgur|farro|polenta|grits|hash ?browns?|plantains?)\b/i,
  },
  { role: "drink", re: /\b(juice|smoothie|shake|tea|coffee|lassi|milk)\b/i },
];

const TAG_RULES: { tag: string; re: RegExp }[] = [
  { tag: "beef", re: /\b(beef|veal|steak|brisket)\b/i },
  { tag: "pork", re: /\b(pork|bacon|ham|sausages?|salami|pepperoni)\b/i },
  { tag: "chicken", re: /\b(chicken|turkey|duck|poultry)\b/i },
  { tag: "fish", re: /\b(fish|salmon|tuna|cod|tilapia|trout|sardines?|mackerel|shrimps?|prawns?|crab|lobster|crustaceans?|crawfish|crayfish|mollusks?|clams?|oysters?|mussels?|scallops?|cuttlefish|whelk|conch|abalone|squid|octopus|herring|anchov)\b/i },
  { tag: "egg", re: /\beggs?\b|omelette?/i },
  { tag: "dairy", re: /\b(milk|yog(?:h)?urt|cheese|paneer|curd|dahi|lassi|kefir|buttermilk|cream)\b/i },
  { tag: "nuts", re: /\b(almonds?|peanuts?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|nuts?)\b/i },
];

// Imported USDA rows are broad logging data. The planner pool is narrower:
// beginner-safe, common foods only. Keep exact/obscure rows searchable for logs,
// but do not let specialty produce become generic diet-plan suggestions.
const OBSCURE_IMPORTED_PRODUCE =
  /\b(straw|enoki|shiitake|maitake|morel|chanterelle|wood ear|cloud ear|truffle|bamboo shoots?|hearts of palm|cactus|nopales?|seaweed|kelp|dulse|burdock|fiddlehead|taro leaves?|cassava leaves?|chayote shoots?)\b/i;

function isObscureImportedProduce(name: string, role: FoodRole): boolean {
  return (role === "veg" || role === "fruit") && OBSCURE_IMPORTED_PRODUCE.test(name.toLowerCase());
}

export function isUnsafeImportedPlannerFood(food: Pick<CatalogFood, "id" | "name"> & Partial<Pick<CatalogFood, "role">>): boolean {
  if (!food.id.startsWith("db:")) return false;
  return food.role ? isObscureImportedProduce(food.name, food.role) : OBSCURE_IMPORTED_PRODUCE.test(food.name.toLowerCase());
}

function importedPlannerRejectReason(raw: RawFoodRow, role: FoodRole): string | null {
  if (raw.source === "curated") return null;
  if (isObscureImportedProduce(raw.name, role)) return "obscure_produce";
  return null;
}

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

/**
 * Detailed classification — returns the planner food AND a machine reason, so a
 * persistence/audit script can store classification_status + reason. The reason
 * for excludes uses the JUNK_REASONS vocabulary below (true non-foods) vs softer
 * keyword/macro reasons. `classifyFood` is the thin boolean-style wrapper used by
 * the runtime planner + tests, so its behaviour is unchanged.
 */
export type ClassifyResult =
  | { status: "eligible"; reason: string; food: CatalogFood }
  | { status: "excluded"; reason: string };

// "Junk" reasons mean the row is not real, plate-able food (vs merely an
// unrecognised name). Used so curated dishes aren't excluded for a keyword gap.
export const JUNK_REASONS = new Set([
  "branded_caps",
  "branded_possessive",
  "branded_list",
  "restaurant",
  "absolute_exclude",
  "ingredient",
  "offal",
]);

export function classifyFoodDetailed(raw: RawFoodRow): ClassifyResult {
  const lower = raw.name.toLowerCase();
  const excludeText = lower.replace(/\b(?:without|with|no)\s+salt(?:\s+added)?\b/g, " ");
  if (!lower.trim() || !Number.isFinite(raw.calories)) return { status: "excluded", reason: "invalid" };

  // 0) Branded entries (ALL-CAPS brand prefix, e.g. "WENDY'S, ..." / "KELLOGG'S")
  // aren't generic meal foods — generic USDA items start with a normal-case word.
  const firstSeg = raw.name.split(",")[0]?.trim() ?? "";
  if (firstSeg.length > 2 && /[A-Z]/.test(firstSeg) && !/[a-z]/.test(firstSeg)) return { status: "excluded", reason: "branded_caps" };
  if (/\b\w+'s\b/i.test(firstSeg)) return { status: "excluded", reason: "branded_possessive" };
  if (BRANDED_OR_RESTAURANT.test(lower)) return { status: "excluded", reason: "branded_list" };
  if (/^\s*(restaurant|fast foods?|school lunch)\s*,/i.test(raw.name)) return { status: "excluded", reason: "restaurant" };

  // 1) Hard ingredient/condiment/supplement excludes. The nut exception is
  // narrow so "Nuts, almonds, oil roasted" survives, but candy/snack bars do not.
  if (ABSOLUTE_EXCLUDE.test(excludeText) || OFFAL.test(lower)) return { status: "excluded", reason: OFFAL.test(lower) ? "offal" : "absolute_exclude" };
  if (EXCLUDE.test(excludeText) && !NUT_STANDALONE_OK.test(lower) && !MUSTARD_GREEN_OK.test(lower)) return { status: "excluded", reason: "ingredient" };

  // 2) Role first: low-calorie vegetables can be legitimate plan accessories.
  const role = ROLE_RULES.find((r) => r.re.test(lower))?.role;
  if (!role) return { status: "excluded", reason: "no_role" };
  const importedReject = importedPlannerRejectReason(raw, role);
  if (importedReject) return { status: "excluded", reason: importedReject };

  const baseG = raw.portion_grams && raw.portion_grams > 0 ? raw.portion_grams : 100;
  const per100 = (n: number) => (n / baseG) * 100;
  const kcal100 = per100(raw.calories);
  const protein100 = per100(raw.protein_g);
  const fat100 = per100(raw.fat_g);

  // 3) Macro-based excludes: near-empty (water/diet/condiment) or pure fat.
  const calorieFloor = role === "veg" ? 10 : 20;
  if (kcal100 < calorieFloor) return { status: "excluded", reason: "low_calorie" };
  if (kcal100 > 0 && (fat100 * 9) / kcal100 > 0.75 && protein100 < 8 && !NUT_OK.test(lower)) return { status: "excluded", reason: "pure_fat" };

  // 4) Raw proteins, dairy and starches are poor/unsafe automatic meal choices.
  if ((role === "protein" || role === "dairy" || role === "carb") && /\braw\b/.test(lower)) return { status: "excluded", reason: "raw" };
  if ((role === "protein" || role === "dairy" || role === "carb") && /\bdry\b/.test(lower)) return { status: "excluded", reason: "dry" };
  if ((role === "protein" || role === "dairy" || role === "carb") && /\buncooked\b/.test(lower)) return { status: "excluded", reason: "uncooked" };

  // 5) Realistic serving + macros scaled from per-100g.
  const servingG = SERVING_G[role];
  const factor = servingG / baseG;
  const scale = (n: number) => Math.max(0, Math.round(n * factor));

  const tags = TAG_RULES.filter((t) => t.re.test(lower)).map((t) => t.tag);

  return {
    status: "eligible",
    reason: `role:${role}`,
    food: {
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
    },
  };
}

/** Classify one row → a planner meal food, or null to EXCLUDE it. Pure. */
export function classifyFood(raw: RawFoodRow): CatalogFood | null {
  const result = classifyFoodDetailed(raw);
  return result.status === "eligible" ? result.food : null;
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
