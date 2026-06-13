import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSiteUrl } from "@/lib/site/url";

/**
 * Redirect apex or wrong host to the canonical site URL (308). Skips when
 * NEXT_PUBLIC_SITE_URL is unset (local dev) or the host already matches.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const canonical = getSiteUrl();
  let parsed: URL;
  try {
    parsed = new URL(canonical);
  } catch {
    return null;
  }
  if (!parsed.host || parsed.hostname === "localhost") return null;

  const host = request.headers.get("host") ?? "";
  if (!host || host === parsed.host) return null;

  const url = request.nextUrl.clone();
  url.protocol = parsed.protocol;
  url.host = parsed.host;
  return NextResponse.redirect(url, 308);
}

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
  const canonical = canonicalHostRedirect(request);
  if (canonical) return canonical;

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
  let user = null;
  let authUnavailable = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    // Distinguish "no/invalid session" (redirect) from "auth is briefly
    // unreachable" (don't redirect) — a transient Supabase blip shouldn't log
    // everyone out. Only network-retryable / 5xx errors count as unavailable.
    if (error && isTransientAuthError(error)) authUnavailable = true;
  } catch {
    // Never let an auth hiccup 500 the whole app (middleware runs on every route,
    // including public ones). Treat as "can't verify right now".
    authUnavailable = true;
  }

  // Protect private routes. Add more prefixes here as the app grows.
  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/workout") ||
    path.startsWith("/coach") ||
    path.startsWith("/diet") ||
    path.startsWith("/settings") ||
    path.startsWith("/weight");

  // Only bounce to login when we DEFINITIVELY have no user. If auth was just
  // unreachable, let the request through with the existing cookies intact.
  if (isProtected && !user && !authUnavailable) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Network/server failures (vs. a genuine missing session) should not be treated
// as "logged out". Conservative: only known-transient cases qualify; anything
// else falls through to the safe default (redirect).
function isTransientAuthError(error: { name?: string; status?: number }): boolean {
  return error?.name === "AuthRetryableFetchError" || (typeof error?.status === "number" && error.status >= 500);
}
