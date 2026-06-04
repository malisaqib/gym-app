import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { BodyweightLog, Lang } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";
import WeightTracker from "./WeightTracker";
import WeeklyCheckIn from "@/app/coach/WeeklyCheckIn";
import ProgressTracker from "@/app/coach/ProgressTracker";

// The "Progress" tab: weight log + chart, the weekly check-in, and the progress
// record — one place to see how things are going over time.
// Protected: signed in + onboarded.
export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = await getLocalToday();

  // Profile (onboarding gate, starting weight, language) + weight history,
  // fetched together on the server so the chart renders immediately.
  const [{ data: profile }, { data: logs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarded, weight_kg, preferred_language")
      .eq("id", user.id)
      .single(),
    supabase
      .from("bodyweight_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("logged_on", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<BodyweightLog[]>(),
  ]);

  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-8">
        <h1 className="font-display text-2xl font-semibold text-foreground">Progress</h1>

        <WeightTracker
          startWeight={profile?.weight_kg ?? null}
          initialLogs={logs ?? []}
          today={today}
        />

        {/* Weekly check-in + progress record (self-contained, localStorage). */}
        <WeeklyCheckIn lang={lang} />
        <ProgressTracker lang={lang} />
      </main>
      <BottomNav />
    </>
  );
}
