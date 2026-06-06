import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback for email links (password recovery, email confirm).
 *
 * Supabase can deliver the link in two server-readable shapes depending on the
 * project's flow / email template, so we handle BOTH:
 *   - PKCE:        ...?code=<one-time code>           -> exchangeCodeForSession
 *   - token hash:  ...?token_hash=<hash>&type=recovery -> verifyOtp
 * The token-hash path also works across devices (no PKCE verifier cookie needed),
 * so it's the more robust option for emailed links.
 *
 * On any problem we forward to /login with the real reason when Supabase gives
 * one (e.g. otp_expired), else a friendly fallback.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const errorDescription = searchParams.get("error_description");

  if (!errorDescription) {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const message = errorDescription || "That link is invalid or expired. Please request a new one.";
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}
