import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort analytics. Records a named event for the user, reusing the
 * caller's Supabase client. NEVER throws and NEVER blocks the user's action —
 * if the events table doesn't exist or the insert fails, we silently move on.
 */
export async function logEvent(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("events").insert({ user_id: userId, name, meta: meta ?? null });
  } catch {
    // analytics must never break the app
  }
}
