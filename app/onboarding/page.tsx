import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/database.types";
import Onboarding from "./Onboarding";

// Protected gate: must be signed in, and skip if already onboarded.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, preferred_language")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded) {
    redirect("/dashboard");
  }

  // Start the chat in the user's saved language (defaults to English).
  const initialLang = (profile?.preferred_language as Lang) ?? "en";
  return <Onboarding initialLang={initialLang} />;
}
