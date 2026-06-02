"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
