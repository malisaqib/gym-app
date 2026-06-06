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

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Clear any cached render that assumed "logged out", then go to dashboard.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If "Confirm email" is ON in Supabase, signUp returns no session — the user
  // must click the email link first. If it's OFF, we get a session immediately.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Account created. Check your email to confirm, then log in."
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
  const email = String(formData.get("email"));

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
