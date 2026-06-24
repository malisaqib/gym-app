import type { MacroTotals } from "./totals.ts";

/**
 * Live quantity / portion model for food logging (Phase 1).
 *
 * Pure + deterministic, no AI. The per-unit (or per-gram) nutrition is the
 * SOURCE OF TRUTH; the displayed/stored total is always `base × amount`, never a
 * frozen number that can drift. Two modes:
 *   - count   : `amount` is a number of units (eggs, roti, kabab); base is per-unit
 *   - portion : `amount` is GRAMS; base is per-gram; `serving_grams` anchors the
 *               0.5x/1x/1.5x/2x multiplier shown in the UI
 */

export type UnitMode = "count" | "portion";

export interface QuantitySpec {
  unit_mode: UnitMode;
  unit: string; // friendly label for display ("egg", "g")
  amount: number; // units (count) or grams (portion)
  serving_grams: number | null; // one base serving in grams (portion only)
  base_calories: number; // per unit (count) or per gram (portion) — kept as float
  base_protein_g: number;
  base_carbs_g: number;
  base_fat_g: number;
}

// Units that mean grams.
const GRAM_UNITS = new Set(["g", "gm", "gms", "gram", "grams"]);

// Hard input ceilings, shared by every write path (QuantityControl mirrors
// them client-side). One meal can't realistically exceed these; anything
// bigger is a typo or abuse and must not poison the day's totals.
export const MAX_AMOUNT_GRAMS = 5000;
export const MAX_AMOUNT_UNITS = 100;
// Correction ceilings (match the LLM-output clamps in the parser).
const MAX_CORRECTED_CALORIES = 5000;
const MAX_CORRECTED_MACRO_G = 1000;
// Safety ceiling for an UNMATCHED estimate with NO known weight (a count unit
// like "item"/"piece"): the 9 kcal/g rule can't apply, so cap one such item at a
// realistic single-item max instead of the broad 5000 clamp. Matched DB foods,
// and items with a known gram/plate/bowl/serving amount, are NOT capped here.
const MAX_ESTIMATED_COUNT_CALORIES = 1500;

// Serving words → grams in ONE serving. Used to turn a "1 plate" / "1 katori"
// parse into a per-gram portion food so any gram amount computes exactly.
const SERVING_GRAMS: Record<string, number> = {
  plate: 350,
  plates: 350,
  katori: 200,
  pyali: 200,
  bowl: 250,
  bowls: 250,
  glass: 250,
  glasses: 250,
  cup: 200,
  cups: 200,
  mug: 250,
  serving: 200,
  servings: 200,
  portion: 200,
  portions: 200,
  can: 150,
  scoop: 30,
  scoops: 30,
};

const safeDiv = (total: number, denom: number) => (denom > 0 ? total / denom : total);

export function isGramUnit(unit: string): boolean {
  return GRAM_UNITS.has(unit.trim().toLowerCase());
}

export function gramsForServingUnit(unit: string): number | null {
  return SERVING_GRAMS[unit.trim().toLowerCase()] ?? null;
}

interface ParsedLike {
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Grams represented by a quantity+unit, or null for a non-weight count (eggs,
// roti) whose gram weight we can't know without the specific food.
function gramsOf(quantity: number, unit: string): number | null {
  if (isGramUnit(unit)) return quantity;
  const serving = gramsForServingUnit(unit);
  return serving != null ? quantity * serving : null;
}

/**
 * Pull an EXPLICIT amount the user typed ("200g", "300gm", "2 roti", "1 katori",
 * "1 glass"). Deterministic — the source of truth for quantity, so neither the
 * LLM nor a matched candidate's serving size can silently turn "200gms" into
 * "100g". Weight beats a count word; kg/litre scale to g/ml. Returns null when
 * no explicit amount was given (then the model's own quantity is trusted).
 */
export function explicitQuantityFromText(text: string): { quantity: number; unit: string } | null {
  const t = ` ${text.toLowerCase()} `;
  const weight = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|gm|gms|grams?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?)\b/);
  if (weight) {
    let n = parseFloat(weight[1]);
    if (/^(kg|kilo|l|lit)/.test(weight[2])) n *= 1000; // kg/litre → g/ml
    if (n > 0) return { quantity: n, unit: "g" };
  }
  const serving = t.match(
    /(\d+(?:\.\d+)?)\s*(katori|pyali|plate|bowl|glass|cup|mug|serving|portion|can|scoop|slice|piece|egg|roti|chapati|paratha|naan|kabab|kebab)s?\b/
  );
  if (serving && parseFloat(serving[1]) > 0) return { quantity: parseFloat(serving[1]), unit: serving[2] };
  // Bare leading count ("2 roti", "3 eggs") — a number directly before a word.
  const lead = text.trim().match(/^(\d+(?:\.\d+)?)\s+[a-z]/i);
  if (lead && parseFloat(lead[1]) > 0) return { quantity: parseFloat(lead[1]), unit: "" };
  return null;
}

interface MacroQuantityItem {
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Present on grounded ParsedFoodItems. Absent/null = an UNMATCHED estimate,
  // which sanitizeParsedMacros caps more tightly when there's no known weight.
  matched_food_id?: string | null;
}

/**
 * Force a parsed item onto the user's explicit quantity, rescaling its macros so
 * the per-unit numbers stay consistent (grounding may later replace them from a
 * trusted food at this same quantity). Used for single-item logs, where the
 * amount unambiguously belongs to that one item. When the model's unit and the
 * explicit unit aren't comparable (grams vs an unknown count), the model's parse
 * is kept rather than guessed.
 */
export function enforceExplicitQuantity<T extends MacroQuantityItem>(
  item: T,
  explicit: { quantity: number; unit: string }
): T {
  // Ceiling first: "20 kg chicken" must not produce a 5-figure-kcal row. Weight
  // units cap at MAX_AMOUNT_GRAMS; counts/servings at MAX_AMOUNT_UNITS.
  const rawQty = Number(explicit.quantity);
  if (!Number.isFinite(rawQty) || rawQty <= 0) return item;
  const cap = isGramUnit(explicit.unit) ? MAX_AMOUNT_GRAMS : MAX_AMOUNT_UNITS;
  const explicitQty = Math.min(rawQty, cap);

  const fromGrams = gramsOf(item.quantity, item.unit);
  const toGrams = gramsOf(explicitQty, explicit.unit);
  let scale: number | null = null;
  if (fromGrams != null && toGrams != null && fromGrams > 0) scale = toGrams / fromGrams;
  else if (fromGrams == null && toGrams == null && item.quantity > 0) scale = explicitQty / item.quantity;
  if (scale == null || !Number.isFinite(scale) || scale <= 0) return item;

  return {
    ...item,
    quantity: explicitQty,
    unit: explicit.unit,
    calories: Math.round(item.calories * scale),
    protein_g: Math.round(item.protein_g * scale),
    carbs_g: Math.round(item.carbs_g * scale),
    fat_g: Math.round(item.fat_g * scale),
  };
}

function portionSpec(p: ParsedLike, grams: number, servingGrams: number): QuantitySpec {
  return {
    unit_mode: "portion",
    unit: "g",
    // The per-gram base below is true for ANY amount, so capping the stored
    // amount alone keeps totals (= base × amount) self-consistent.
    amount: Math.min(grams, MAX_AMOUNT_GRAMS),
    serving_grams: servingGrams,
    base_calories: safeDiv(p.calories, grams),
    base_protein_g: safeDiv(p.protein_g, grams),
    base_carbs_g: safeDiv(p.carbs_g, grams),
    base_fat_g: safeDiv(p.fat_g, grams),
  };
}

/**
 * Turn a parsed item (totals + quantity + unit) into a per-unit/per-gram spec.
 * Decision: grams unit or a known serving word → portion (per gram); everything
 * else (named count units, or a bare integer) → count (per unit). Most desi
 * dishes parse with a serving word (the parser is told pyali/katori/plate), so
 * they land as gram-adjustable portions; eggs/roti/kabab land as steppers.
 */
export function deriveQuantity(p: ParsedLike): QuantitySpec {
  const q = Number.isFinite(p.quantity) && p.quantity > 0 ? p.quantity : 1;
  const unit = (p.unit ?? "").trim().toLowerCase();

  if (isGramUnit(unit)) {
    // 1× reference = the grams they logged.
    return portionSpec(p, q, q);
  }
  const servingGrams = gramsForServingUnit(unit);
  if (servingGrams != null) {
    const gps = servingGrams;
    return portionSpec(p, q * gps, gps);
  }
  // Countable: per-unit = total / quantity (kept as float so base × amount is exact).
  return {
    unit_mode: "count",
    unit: unit || "item",
    amount: Math.min(q, MAX_AMOUNT_UNITS),
    serving_grams: null,
    base_calories: safeDiv(p.calories, q),
    base_protein_g: safeDiv(p.protein_g, q),
    base_carbs_g: safeDiv(p.carbs_g, q),
    base_fat_g: safeDiv(p.fat_g, q),
  };
}

/**
 * Physical sanity net for parsed/estimated macros — the "protein is too high"
 * reliability fix. Deterministic invariants no real food can violate:
 *   - with a known weight: calories ≤ 9 kcal/g (pure fat is the densest food);
 *   - each macro's ENERGY can't exceed the item's calories (with slack for
 *     rounding) — 100 g of protein cannot live inside a 150 kcal item;
 *   - zero calories with real macros gets calories derived from the macros.
 * No per-gram caps on individual macros: protein powders are ~80% protein by
 * weight, so a weight-density cap would wrongly clamp a whey scoop. Trusted
 * grounded foods satisfy all of these already; this catches the LLM's bad days
 * without touching plausible numbers.
 */
export function sanitizeParsedMacros<T extends MacroQuantityItem>(item: T): T {
  let { calories, protein_g, carbs_g, fat_g } = item;
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  calories = clean(calories);
  protein_g = clean(protein_g);
  carbs_g = clean(carbs_g);
  fat_g = clean(fat_g);

  // Per-item calorie ceiling. With a known weight, cap at 9 kcal/g (pure fat is
  // the densest food). With NO known weight, a MATCHED DB food is trusted as-is,
  // but an UNMATCHED estimate (a count unit like "item"/"piece") is capped at a
  // safe single-item max — otherwise one bad LLM guess could log a 5000-kcal
  // "item". Items with a gram/plate/bowl/serving amount keep the weight ceiling.
  const grams = gramsOf(item.quantity, item.unit);
  let ceiling: number | null = null;
  if (grams != null && grams > 0) ceiling = Math.round(grams * 9);
  else if (!item.matched_food_id) ceiling = MAX_ESTIMATED_COUNT_CALORIES;
  if (ceiling != null) calories = Math.min(calories, ceiling);

  // Zero calories but real macros → derive calories from the macros (Atwater),
  // instead of showing a "0 kcal, 20g protein" contradiction. Re-apply the
  // ceiling afterwards so a derived value can't exceed the cap either.
  const macroKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  if (calories === 0 && macroKcal > 10) calories = Math.round(macroKcal);
  if (ceiling != null) calories = Math.min(calories, ceiling);

  // Macro-vs-energy consistency (slack covers honest rounding).
  const slack = Math.max(15, calories * 0.05);
  if (calories > 0) {
    if (protein_g * 4 > calories + slack) protein_g = Math.floor(calories / 4);
    if (carbs_g * 4 > calories + slack) carbs_g = Math.floor(calories / 4);
    if (fat_g * 9 > calories + slack) fat_g = Math.floor(calories / 9);
  }

  if (
    calories === item.calories &&
    protein_g === item.protein_g &&
    carbs_g === item.carbs_g &&
    fat_g === item.fat_g
  ) {
    return item;
  }
  return { ...item, calories, protein_g, carbs_g, fat_g };
}

// What `itemMacros` needs — a saved FoodLog satisfies this structurally.
export interface MacroSource {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  base_calories?: number | null;
  base_protein_g?: number | null;
  base_carbs_g?: number | null;
  base_fat_g?: number | null;
  amount?: number | null;
}

/**
 * The authoritative total for an item: base × amount, rounded for display. Falls
 * back to the stored totals when the per-unit columns aren't set (pre-migration
 * safety), so this is always correct and can never read a drifted number.
 */
export function itemMacros(item: MacroSource): MacroTotals {
  if (item.base_calories == null || item.amount == null) {
    return {
      calories: Math.round(item.calories),
      protein_g: Math.round(item.protein_g),
      carbs_g: Math.round(item.carbs_g),
      fat_g: Math.round(item.fat_g),
    };
  }
  const a = item.amount;
  return {
    calories: Math.round(item.base_calories * a),
    protein_g: Math.round((item.base_protein_g ?? 0) * a),
    carbs_g: Math.round((item.base_carbs_g ?? 0) * a),
    fat_g: Math.round((item.base_fat_g ?? 0) * a),
  };
}

const normalizeSegmentText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Enforce explicit user-typed quantities on EVERY parsed item (F3) — not just
 * single-item logs. "200g chicken and 2 roti" is split into segments on meal
 * connectors (and / with / aur / commas / + / &); an item is bound to a segment
 * only when EXACTLY ONE segment mentions one of its name tokens, so an
 * ambiguous text ("chicken and chicken curry") never cross-assigns an amount —
 * ambiguity keeps the model's own parse. Single-item logs use the whole text.
 */
export function enforcePerItemQuantities<T extends MacroQuantityItem & { food_name: string }>(
  items: T[],
  rawText: string
): T[] {
  if (items.length === 0) return items;
  if (items.length === 1) {
    const explicit = explicitQuantityFromText(rawText);
    return explicit ? [enforceExplicitQuantity(items[0], explicit)] : items;
  }

  const segments = rawText
    .split(/(?:,|\+|&|\band\b|\bwith\b|\baur\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return items;

  const segmentWords = segments.map((s) => ` ${normalizeSegmentText(s)} `);
  return items.map((item) => {
    const tokens = normalizeSegmentText(item.food_name)
      .split(" ")
      .filter((t) => t.length >= 3);
    if (tokens.length === 0) return item;
    const matchIdx = segmentWords
      .map((seg, i) => (tokens.some((t) => seg.includes(` ${t} `) || seg.includes(` ${t}s `)) ? i : -1))
      .filter((i) => i >= 0);
    if (matchIdx.length !== 1) return item; // ambiguous or unmentioned → trust the model
    const explicit = explicitQuantityFromText(segments[matchIdx[0]]);
    return explicit ? enforceExplicitQuantity(item, explicit) : item;
  });
}

/**
 * The macro patch for a manual calories/protein correction (F2). The user only
 * enters calories + protein; carbs/fat are RESCALED by the calorie ratio so the
 * item's implied energy stays consistent with the corrected calories — leaving
 * them frozen let a 500→250 kcal correction keep 60g of carbs (240 kcal of
 * carbs alone in a "250 kcal" item). Everything is also rebased per-unit at the
 * current amount, so the corrected numbers still scale with quantity edits.
 * Old calories of 0 give no ratio — carbs/fat are left as they are.
 */
export function correctedMacroPatch(
  row: MacroSource & { amount?: number | null },
  patch: { calories: number; protein_g: number }
): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  base_calories: number;
  base_protein_g: number;
  base_carbs_g: number;
  base_fat_g: number;
} {
  const amount = row.amount && row.amount > 0 ? row.amount : 1;
  const old = itemMacros(row); // live old totals (base × amount, cache as fallback)
  // Clamp to the same ceilings as parsed items — a "correction" can't store a
  // 7-figure-kcal row any more than the parser can.
  const calories = Math.min(MAX_CORRECTED_CALORIES, Math.max(0, Math.round(Number(patch.calories) || 0)));
  const protein_g = Math.min(MAX_CORRECTED_MACRO_G, Math.max(0, Math.round(Number(patch.protein_g) || 0)));
  const ratio = old.calories > 0 ? calories / old.calories : null;
  const carbs_g = Math.min(MAX_CORRECTED_MACRO_G, ratio === null ? old.carbs_g : Math.round(old.carbs_g * ratio));
  const fat_g = Math.min(MAX_CORRECTED_MACRO_G, ratio === null ? old.fat_g : Math.round(old.fat_g * ratio));
  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    base_calories: calories / amount,
    base_protein_g: protein_g / amount,
    base_carbs_g: carbs_g / amount,
    base_fat_g: fat_g / amount,
  };
}

/**
 * Quantity spec for logging a FOOD ROW from the database (search-tap logging).
 * A gram-anchored row (portion_grams > 0) becomes a per-gram portion — this is
 * where "165 kcal per 100g → base 1.65/g" happens, so any grams scale exactly.
 * A row with no gram anchor uses a clear leading count when present ("2 eggs",
 * "2 medium" + name "2 roti"); otherwise it remains one countable serving.
 */
const COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const NON_UNIT_WORDS = new Set(["small", "medium", "large", "stuffed"]);

function leadingCount(text: string | null | undefined): number | null {
  const first = text?.trim().toLowerCase().match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/)?.[1];
  if (!first) return null;
  const count = /^\d+$/.test(first) ? Number(first) : COUNT_WORDS[first];
  return Number.isFinite(count) && count > 0 ? Math.min(count, MAX_AMOUNT_UNITS) : null;
}

function countUnit(text: string | null | undefined): string {
  const match = text
    ?.trim()
    .toLowerCase()
    .match(/^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z]+)/);
  const unit = match?.[1] ?? "";
  return NON_UNIT_WORDS.has(unit) ? "" : unit;
}

export function specFromFoodRow(food: {
  name?: string | null;
  portion?: string | null;
  portion_grams: number | null;
  serving_grams?: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): QuantitySpec {
  const grams = Number(food.portion_grams ?? food.serving_grams);
  if (Number.isFinite(grams) && grams > 0) {
    return {
      unit_mode: "portion",
      unit: "g",
      amount: Math.min(grams, MAX_AMOUNT_GRAMS),
      serving_grams: grams,
      base_calories: Number(food.calories) / grams,
      base_protein_g: Number(food.protein_g) / grams,
      base_carbs_g: Number(food.carbs_g) / grams,
      base_fat_g: Number(food.fat_g) / grams,
    };
  }

  const amount = leadingCount(food.portion) ?? leadingCount(food.name) ?? 1;
  const unit = countUnit(food.portion) || countUnit(food.name) || "serving";
  return {
    unit_mode: "count",
    unit,
    amount,
    serving_grams: null,
    base_calories: Number(food.calories) / amount,
    base_protein_g: Number(food.protein_g) / amount,
    base_carbs_g: Number(food.carbs_g) / amount,
    base_fat_g: Number(food.fat_g) / amount,
  };
}

/** Storage fields for search-tap logging, derived from the same live spec. */
export function logQuantityForFoodRow(
  food: Parameters<typeof specFromFoodRow>[0]
): QuantitySpec & { quantity: number; logged_unit: string } {
  const spec = specFromFoodRow(food);
  return {
    ...spec,
    quantity: spec.unit_mode === "count" ? spec.amount : 1,
    logged_unit: spec.unit_mode === "count" ? spec.unit : food.portion ?? spec.unit,
  };
}

/** Rounded totals for a spec/amount, used by every food-log write path. */
export function totalsFor(spec: {
  base_calories: number;
  base_protein_g: number;
  base_carbs_g: number;
  base_fat_g: number;
  amount: number;
}): MacroTotals {
  return itemMacros({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...spec });
}
