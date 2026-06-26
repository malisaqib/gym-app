export interface ComboParsedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const COMBO_CONNECTORS = new Set(["and", "aur"]);
const COMBO_NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  aik: 1,
  one: 1,
  do: 2,
  two: 2,
  teen: 3,
  three: 3,
  char: 4,
  four: 4,
};

const COMBO_SIMPLE_FOODS: Record<string, { foodName: string; unit: string }> = {
  roti: { foodName: "roti", unit: "roti" },
  chapati: { foodName: "roti", unit: "roti" },
  phulka: { foodName: "roti", unit: "roti" },
  egg: { foodName: "egg", unit: "egg" },
  eggs: { foodName: "eggs", unit: "egg" },
  anda: { foodName: "anda", unit: "egg" },
  anday: { foodName: "anday", unit: "egg" },
  andey: { foodName: "andey", unit: "egg" },
  daal: { foodName: "daal", unit: "" },
  dal: { foodName: "daal", unit: "" },
  dhal: { foodName: "daal", unit: "" },
  rice: { foodName: "rice", unit: "" },
  chawal: { foodName: "rice", unit: "" },
  chicken: { foodName: "chicken", unit: "" },
  dahi: { foodName: "dahi", unit: "" },
  yogurt: { foodName: "dahi", unit: "" },
  curd: { foodName: "dahi", unit: "" },
  banana: { foodName: "banana", unit: "banana" },
};

const PROTECTED_COMBO_DISHES = [
  "chicken biryani",
  "chana chaat",
  "banana shake",
  "banana milkshake",
  "chicken karahi",
  "chicken salan",
  "chicken curry",
  "fish curry",
  "beef qeema",
  "beef keema",
  "aloo paratha",
  "cold coffee",
  "lassi",
];

const COMBO_SERVING_OR_WEIGHT =
  /\b(?:katori|pyali|plate|bowl|glass|cup|mug|serving|portion|can|scoop|kg|kilograms?|g|gm|gms|grams?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?)\b/i;

function normalizeComboText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function comboQuantity(token: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return COMBO_NUMBER_WORDS[token] ?? null;
}

function emptyParsedFood(foodName: string, quantity: number, unit: string): ComboParsedFoodItem {
  return {
    food_name: foodName,
    quantity,
    unit,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };
}

/**
 * Deterministic fast path for obvious "food food" logs. It intentionally only
 * accepts short phrases made entirely of known simple foods, so named dishes
 * and ambiguous serving phrases still go through the LLM parser.
 */
export function splitObviousFoodCombo(text: string): ComboParsedFoodItem[] | null {
  const normalized = normalizeComboText(text);
  if (!normalized) return null;
  if (COMBO_SERVING_OR_WEIGHT.test(text)) return null;

  const withoutLeadingCount = normalized.replace(/^(?:\d+(?:\.\d+)?|ek|aik|one|do|two|teen|three|char|four)\s+/, "");
  if (PROTECTED_COMBO_DISHES.some((dish) => withoutLeadingCount === dish)) return null;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 6) return null;

  const items: ComboParsedFoodItem[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (COMBO_CONNECTORS.has(tokens[i])) continue;

    let quantity = comboQuantity(tokens[i]);
    if (quantity != null) i += 1;
    else quantity = 1;

    const simple = COMBO_SIMPLE_FOODS[tokens[i]];
    if (!simple || !Number.isFinite(quantity) || quantity <= 0) return null;

    items.push(emptyParsedFood(simple.foodName, Math.min(quantity, 100), simple.unit));
  }

  return items.length >= 2 ? items : null;
}
