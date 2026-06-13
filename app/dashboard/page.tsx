import Link from "next/link";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { FoodLog, Lang, Profile } from "@/lib/database.types";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
import { Screen } from "@/components/ui/Screen";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { SignOutGhostButton } from "@/app/auth/SignOutButton";
import BottomNav from "@/components/BottomNav";
import IntroTour from "@/components/IntroTour";
import LocalDataGuard from "@/components/LocalDataGuard";
import FoodLogger from "./FoodLogger";
import EmotionalGoalOnboarding from "@/app/coach/EmotionalGoalOnboarding";

// Protected page. The middleware already blocks logged-out users, but we
// re-check here (defense in depth) and to actually get the user's data.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  // `?tour=1` (set by the onboarding finale and the Settings "replay" link)
  // forces the feature walkthrough even if its first-visit flag is already set.
  const { tour } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const today = await getLocalToday();

  // Fetch the profile AND today's food in parallel (server-side) so the screen
  // arrives populated — no extra client round-trip after load.
  const [{ data: profile }, { data: foodRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase
      .from("food_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("logged_on", today)
      .order("created_at", { ascending: true })
      .returns<FoodLog[]>(),
  ]);

  // First-time users haven't set their targets yet — send them to onboarding.
  if (!profile?.onboarded) {
    redirect("/onboarding");
  }

  // Friendly goal reminder, in the user's language (may be null for older users).
  const lang: Lang = profile.preferred_language ?? "en";
  const goalLabel =
    RELATABLE_GOALS.find((g) => g.key === profile.relatable_goal)?.label[lang] ?? null;

  return (
    // Phase 1: the dashboard adopts the Apple-Fitness deep-black theme. Scoped to
    // this screen for now (other tabs migrate in later phases); `bg-background`
    // paints the true-black canvas behind the content.
    <div className="fitness min-h-screen bg-background">
      <Screen>
        <LargeTitle
          title="Today"
          subtitle={
            goalLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <Target size={14} aria-hidden /> {goalLabel}
              </span>
            ) : undefined
          }
          action={
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                className="rounded-field px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted active:scale-[0.97]"
              >
                Settings
              </Link>
              <SignOutGhostButton />
            </div>
          }
        />

        {/* The core loop: progress vs target + text food logging + corrections. */}
        <FoodLogger
          calorieTarget={profile.calorie_target ?? 0}
          proteinTarget={profile.protein_target_g ?? 0}
          initialItems={foodRows ?? []}
          today={today}
          lang={lang}
        />

        {/* Motivation goal lives on Home now (self-contained, localStorage). */}
        <EmotionalGoalOnboarding lang={lang} />

        <p className="text-center text-xs text-muted-foreground break-all">{user.email}</p>
      </Screen>
      <BottomNav />
      {/* Wipe device-local coach data if a different user is on this device. */}
      <LocalDataGuard userId={user.id} />
      {/* Skippable feature walkthrough — auto on first visit, or forced by
          ?tour=1 (post-onboarding finale + Settings "replay"). */}
      <IntroTour lang={lang} forceTour={tour === "1"} />
    </div>
  );
}
