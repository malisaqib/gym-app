import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/database.types";
import MealCoach from "./MealCoach";

// Protected: signed in + onboarded (so we have targets to reason about).
export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, preferred_language")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";
  return <MealCoach lang={lang} />;
}
