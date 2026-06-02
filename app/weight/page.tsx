import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WeightTracker from "./WeightTracker";

// Protected: signed in + onboarded.
export default async function WeightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, weight_kg")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded) redirect("/onboarding");

  // Show the onboarding weight as a placeholder until they log their first one.
  return <WeightTracker startWeight={profile?.weight_kg ?? null} />;
}
