import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { BodyweightLog, Lang } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";
import { directionFor, detectPlateau, suggestAdjustment } from "@/lib/nutrition/adapt";
import WeightTracker from "./WeightTracker";
import ProgressInsight from "./ProgressInsight";
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
      .select(
        "onboarded, weight_kg, preferred_language, goal_weight_kg, activity_level, calorie_target, sex"
      )
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

  // Plateau check (deterministic). Surface a supportive nudge if progress stalled.
  const history = logs ?? [];
  const current = history[history.length - 1]?.weight_kg ?? profile?.weight_kg ?? null;
  let insight: { direction: ReturnType<typeof directionFor>; kind: ReturnType<typeof suggestAdjustment>["kind"]; weeklyRateKg: number } | null = null;
  if (current != null && profile?.goal_weight_kg != null && profile?.sex && profile?.calorie_target != null) {
    const direction = directionFor(current, profile.goal_weight_kg);
    const plateau = detectPlateau(
      history.map((l) => ({ logged_on: l.logged_on, weight_kg: l.weight_kg })),
      direction,
      today
    );
    if (plateau.status === "plateau") {
      const adj = suggestAdjustment({
        direction,
        activityLevel: profile.activity_level ?? "light",
        calorieTarget: profile.calorie_target,
        sex: profile.sex,
      });
      insight = { direction, kind: adj.kind, weeklyRateKg: plateau.weeklyRateKg };
    }
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Progress</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Log your weight and watch the trend toward your goal.
          </p>
        </div>

        {insight && (
          <ProgressInsight
            direction={insight.direction}
            kind={insight.kind}
            weeklyRateKg={insight.weeklyRateKg}
            lang={lang}
          />
        )}

        <WeightTracker startWeight={profile?.weight_kg ?? null} initialLogs={logs ?? []} />

        {/* Weekly check-in + progress record (self-contained, localStorage). */}
        <WeeklyCheckIn lang={lang} />
        <ProgressTracker lang={lang} />
      </main>
      <BottomNav />
    </>
  );
}
