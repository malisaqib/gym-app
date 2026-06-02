import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use on the SERVER (Server Components, Server Actions,
 * Route Handlers).
 *
 * It reads the user's session from the request cookies and can also set
 * refreshed cookies on the response. In Next.js 15 `cookies()` is async, so
 * this function is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        // Supabase reads all auth cookies it owns.
        getAll() {
          return cookieStore.getAll();
        },
        // Supabase asks us to persist refreshed tokens back into cookies.
        // In a plain Server Component this can throw (you can't set cookies
        // while rendering), so we swallow that case — the middleware handles
        // the refresh instead.
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    }
  );
}
