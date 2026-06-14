import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-user daily rate limits for LLM-backed actions (migration 0021).
 *
 * Each call atomically increments today's counter for (user, kind) via the
 * SECURITY DEFINER consume_usage() function and returns whether the user is
 * still within budget. FAIL-OPEN: if the RPC errors (e.g. migration not yet
 * applied), the action proceeds and we log loudly — a broken limiter must
 * never take food logging down with it.
 */

// Daily allowances. Generous for real humans, ruinous for scripts.
export const USAGE_LIMITS = {
  food_parse: 150, // free-text logs per day (each = Groq + embedding)
  coach: 50, // "what should I eat" questions
  estimate: 50, // meal estimates
  plan_generate: 40, // diet plan (re)generates
  feedback: 10, // feedback messages emailed to the owner (anti-spam)
} as const;

export type UsageKind = keyof typeof USAGE_LIMITS;

// Friendly, non-shaming message when a cap is hit.
export const USAGE_LIMIT_MESSAGE =
  "You've hit today's limit for this — it resets tomorrow. Search or Quick add still work.";

export async function consumeUsage(
  supabase: SupabaseClient,
  kind: UsageKind
): Promise<{ allowed: boolean }> {
  try {
    const { data, error } = await supabase.rpc("consume_usage", {
      p_kind: kind,
      p_limit: USAGE_LIMITS[kind],
    });
    if (error) {
      console.error(`[usage] consume_usage failed (${kind}) — failing open:`, error.message);
      return { allowed: true };
    }
    return { allowed: data === true };
  } catch (e) {
    console.error(`[usage] consume_usage threw (${kind}) — failing open:`, e);
    return { allowed: true };
  }
}
