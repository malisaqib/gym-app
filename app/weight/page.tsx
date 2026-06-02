import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { BodyweightLog } from "@/lib/database.types";
import WeightTracker from "./WeightTracker";

// Protected: signed in + onboarded.
export default async function WeightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = await getLocalToday();

  // Profile (for the onboarding gate + starting weight) and the weight history,
  // fetched together on the server so the chart renders immediately.
  const [{ data: profile }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("onboarded, weight_kg").eq("id", user.id).single(),
    supabase
      .from("bodyweight_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("logged_on", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<BodyweightLog[]>(),
  ]);

  if (!profile?.onboarded) redirect("/onboarding");

  return (
    <WeightTracker
      startWeight={profile?.weight_kg ?? null}
      initialLogs={logs ?? []}
      today={today}
    />
  );
}
