/**
 * Learn the foods a user actually logs, so generated plans and swaps can lean
 * toward what's familiar (Feature: "learn from the real log"). Pure +
 * deterministic — the server action fetches the food_logs rows; everything here
 * is unit-testable, no DB/AI.
 *
 * Bridging two id worlds: the planner selects foods by their POOL id (curated
 * catalog ids like "rice", or imported ids like "db:<uuid>"), while the food log
 * stores a `matched_food_id` in the logging convention (`catalog:rice`,
 * `db:<uuid>`, the picker's `food:<uuid>`, or null for a free estimate).
 * `poolIdFromMatched` maps a logged id back to a planner pool id.
 */

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_LIMIT = 8;

/** The slice of a food_logs row this module needs. */
export interface LoggedFoodRow {
  matched_food_id: string | null;
  food_name: string;
  logged_on: string; // YYYY-MM-DD, the user's local day
}

export interface RankedLoggedFood {
  poolId: string; // a planner pool/catalog food id
  name: string;
  count: number;
  score: number; // frequency with a light recency weight
}

/**
 * Map a food_logs.matched_food_id to the planner's pool food id, or null when it
 * can't ground onto a real food (a free-typed estimate). Conventions:
 *   catalog:rice → rice         (curated catalog id)
 *   db:<uuid>    → db:<uuid>     (imported pool id — already canonical)
 *   food:<uuid>  → db:<uuid>     (the search-picker id maps to its logged form)
 */
export function poolIdFromMatched(matchedFoodId: string | null | undefined): string | null {
  const id = matchedFoodId?.trim();
  if (!id) return null;
  if (id.startsWith("catalog:")) return id.slice("catalog:".length) || null;
  if (id.startsWith("db:")) return id;
  if (id.startsWith("food:")) return `db:${id.slice("food:".length)}` || null;
  return null; // unknown convention — don't guess
}

/** Epoch-day number for a YYYY-MM-DD string, or null if malformed. */
function epochDay(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/**
 * Rank the foods a user logs most over the last `days`, newest-weighted. Rows
 * with no groundable match (estimates) are ignored. Ties break by count then id
 * so the result is fully deterministic.
 */
export function rankLoggedFoods(
  rows: LoggedFoodRow[],
  opts: { now?: Date; days?: number; limit?: number } = {}
): RankedLoggedFood[] {
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = opts.now ?? new Date();
  const nowDay = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS);

  const agg = new Map<string, RankedLoggedFood>();
  for (const row of rows) {
    const poolId = poolIdFromMatched(row.matched_food_id);
    if (!poolId) continue;
    const logDay = epochDay(row.logged_on);
    if (logDay == null) continue;
    const age = nowDay - logDay;
    if (age < 0 || age >= days) continue; // outside the window
    // Recency weight: today ≈ 2.0 down to ~1.0 at the window edge. A food logged
    // recently counts a little more than the same food two weeks ago.
    const weight = 1 + (days - age) / days;

    const cur = agg.get(poolId);
    if (cur) {
      cur.count += 1;
      cur.score += weight;
    } else {
      agg.set(poolId, { poolId, name: row.food_name, count: 1, score: weight });
    }
  }

  return [...agg.values()]
    .sort((a, b) => b.score - a.score || b.count - a.count || a.poolId.localeCompare(b.poolId))
    .slice(0, limit);
}
