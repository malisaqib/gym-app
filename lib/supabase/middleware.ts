import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs on every matched request (see middleware.ts).
 *
 * Two jobs:
 *  1. Refresh the Supabase auth token if it's about to expire, and write the
 *     refreshed cookies onto the response. Server Components can't set cookies,
 *     so doing it here keeps everyone's session alive.
 *  2. Guard private routes: if there's no logged-in user and the request is for
 *     a protected path, redirect to /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          // Write refreshed cookies onto both the incoming request (so the rest
          // of this request sees them) and the outgoing response (so the
          // browser stores them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() revalidates the token with Supabase. Do not put any
  // logic between createServerClient and getUser, or you can log users out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect private routes. Add more prefixes here as the app grows.
  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/workout") ||
    path.startsWith("/coach") ||
    path.startsWith("/diet") ||
    path.startsWith("/weight");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
