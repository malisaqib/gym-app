import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY service-role Supabase client. Bypasses RLS - use ONLY in server
 * actions/route handlers for privileged writes the user's own session can't do
 * (e.g. caching an Open Food Facts product into the shared `foods` catalog,
 * which is read-only for users). Never import this into client code: it reads
 * SUPABASE_SERVICE_ROLE_KEY (a non-public secret, so it cannot reach the client).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin client missing URL or service-role key.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
