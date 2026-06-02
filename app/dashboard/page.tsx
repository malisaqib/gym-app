import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import type { Lang, Profile } from "@/lib/database.types";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
import FoodLogger from "./FoodLogger";
import BottomNav from "@/components/BottomNav";

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

  // Load the profile to read targets and decide whether onboarding is done.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

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
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-24 pt-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Today</h1>
            {goalLabel && <p className="mt-0.5 text-xs text-slate-500">🎯 {goalLabel}</p>}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition active:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </header>

        {/* The core loop: progress vs target + text food logging + corrections. */}
        <FoodLogger
          calorieTarget={profile.calorie_target ?? 0}
          proteinTarget={profile.protein_target_g ?? 0}
        />

        <p className="text-center text-xs text-slate-400 break-all">{user.email}</p>
      </main>
      <BottomNav />
    </>
  );
}
