import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the BROWSER (Client Components, "use client").
 *
 * createBrowserClient reads/writes the auth session from cookies that the
 * browser already has. Use this only in components that run on the client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
