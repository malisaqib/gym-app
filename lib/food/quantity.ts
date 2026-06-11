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
  const fromGrams = gramsOf(item.quantity, item.unit);
  const toGrams = gramsOf(explicit.quantity, explicit.unit);
  let scale: number | null = null;
  if (fromGrams != null && toGrams != null && fromGrams > 0) scale = toGrams / fromGrams;
  else if (fromGrams == null && toGrams == null && item.quantity > 0) scale = explicit.quantity / item.quantity;
  if (scale == null || !Number.isFinite(scale) || scale <= 0) return item;

  return {
    ...item,
    quantity: explicit.quantity,
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
    amount: grams,
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
    amount: q,
    serving_grams: null,
    base_calories: safeDiv(p.calories, q),
    base_protein_g: safeDiv(p.protein_g, q),
    base_carbs_g: safeDiv(p.carbs_g, q),
    base_fat_g: safeDiv(p.fat_g, q),
  };
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
  const calories = Math.max(0, Math.round(Number(patch.calories) || 0));
  const protein_g = Math.max(0, Math.round(Number(patch.protein_g) || 0));
  const ratio = old.calories > 0 ? calories / old.calories : null;
  const carbs_g = ratio === null ? old.carbs_g : Math.round(old.carbs_g * ratio);
  const fat_g = ratio === null ? old.fat_g : Math.round(old.fat_g * ratio);
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

/** Rounded totals for a spec/amount — used when writing the synced cache columns. */
export function totalsFor(spec: {
  base_calories: number;
  base_protein_g: number;
  base_carbs_g: number;
  base_fat_g: number;
  amount: number;
}): MacroTotals {
  return itemMacros({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...spec });
}
