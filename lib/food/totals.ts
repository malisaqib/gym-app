/**
 * Phase 4 — Pure helpers for the daily dashboard math. No AI, no I/O, just
 * arithmetic, so the "eaten vs target / how much left" numbers are testable.
 */

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Anything with macro fields (a saved FoodLog or a freshly parsed item).
type HasMacros = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/** Add up the macros of a day's food items. */
export function sumMacros(items: HasMacros[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein_g: acc.protein_g + i.protein_g,
      carbs_g: acc.carbs_g + i.carbs_g,
      fat_g: acc.fat_g + i.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

/** How much is left to hit the target. Can go negative (you went over). */
export function remaining(target: number, eaten: number): number {
  return Math.round(target - eaten);
}

/** Progress toward a target as a 0–100 percentage (for a progress bar). */
export function percent(eaten: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((eaten / target) * 100));
}
