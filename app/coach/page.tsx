import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/database.types";
import CoachDashboard from "./CoachDashboard";

// Protected: signed in + onboarded (so we have targets to reason about).
export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read-only: add full_name for a warm greeting. No logic/AI changes.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, preferred_language, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";
  return <CoachDashboard lang={lang} name={profile?.full_name ?? null} />;
}
