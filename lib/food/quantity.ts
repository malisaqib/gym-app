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

interface ParsedLike {
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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

  if (GRAM_UNITS.has(unit)) {
    // 1× reference = the grams they logged.
    return portionSpec(p, q, q);
  }
  if (unit in SERVING_GRAMS) {
    const gps = SERVING_GRAMS[unit];
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
