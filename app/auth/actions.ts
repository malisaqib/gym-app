"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions for auth. These run only on the server, so the anon key and
 * cookie handling never leak to the client. Each reads the submitted form,
 * talks to Supabase Auth, then redirects.
 *
 * We pass errors/messages back to the user via the URL query string (e.g.
 * /login?error=...). The pages read that and display it. Simple and readable.
 */

// Map raw Supabase auth errors to friendly, non-technical copy. Unknown errors
// fall back to a generic line so we never surface internal wording to users.
function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email is already registered. Try logging in.";
  if (m.includes("at least") || m.includes("password should")) return "Password must be at least 6 characters.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts — please wait a moment and try again.";
  if (m.includes("valid email") || m.includes("invalid email") || m.includes("unable to validate email"))
    return "Please enter a valid email address.";
  return "Something went wrong. Please try again.";
}

export async function login(formData: FormData) {
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  }

  // Clear any cached render that assumed "logged out", then go to dashboard.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  }

  // If "Confirm email" is ON in Supabase, signUp returns no session — the user
  // must click the email link first. If it's OFF, we get a session immediately.
  // Keep the message neutral (don't claim a new account was made — the same
  // no-session response also occurs for an already-registered email).
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Almost there — check your inbox to confirm your email, then log in."
      )}`
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Step 1 of "forgot password": email the user a reset link. The link lands on
 * /auth/callback, which exchanges the code for a session and forwards to
 * /reset-password. We always show the SAME neutral message so we don't reveal
 * whether an email is registered (Supabase also won't error on unknown emails).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email")).trim();

  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = h.get("origin") ?? `${proto}://${host}`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "If that email is registered, a reset link is on its way. Check your inbox."
    )}`
  );
}

/**
 * Step 2: set the new password. By now /auth/callback has established a session
 * from the recovery link, so updateUser can change the password. Then the user
 * is signed in — straight to the dashboard.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password"));
  const confirm = String(formData.get("confirm"));

  if (password.length < 6) {
    redirect(`/reset-password?error=${encodeURIComponent("Use at least 6 characters.")}`);
  }
  if (password !== confirm) {
    redirect(`/reset-password?error=${encodeURIComponent("The two passwords don't match.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
