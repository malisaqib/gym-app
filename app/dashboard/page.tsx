import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import { signOut } from "@/app/auth/actions";
import type { FoodLog, Lang, Profile } from "@/lib/database.types";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
import { Screen } from "@/components/ui/Screen";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import BottomNav from "@/components/BottomNav";
import FoodLogger from "./FoodLogger";

// Protected page. The middleware already blocks logged-out users, but we
// re-check here (defense in depth) and to actually get the user's data.
export default async function DashboardPage() {
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
    <>
      <Screen>
        <PageHeader
          title="Today"
          subtitle={goalLabel ? `🎯 ${goalLabel}` : undefined}
          action={
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                className="rounded-field px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted active:scale-[0.97]"
              >
                Settings
              </Link>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          }
        />

        {/* The core loop: progress vs target + text food logging + corrections. */}
        <FoodLogger
          calorieTarget={profile.calorie_target ?? 0}
          proteinTarget={profile.protein_target_g ?? 0}
          initialItems={foodRows ?? []}
          today={today}
        />

        <p className="text-center text-xs text-muted-foreground break-all">{user.email}</p>
      </Screen>
      <BottomNav />
    </>
  );
}
