import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import type { Lang, Profile } from "@/lib/database.types";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";
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

  // Latest weight (for the Weight quick-nav card).
  const { data: lastWeight } = await supabase
    .from("bodyweight_logs")
    .select("weight_kg")
    .eq("user_id", user.id)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ weight_kg: number }>();

  // Friendly goal reminder, in the user's language (may be null for older users).
  const lang: Lang = profile.preferred_language ?? "en";
  const goalLabel =
    RELATABLE_GOALS.find((g) => g.key === profile.relatable_goal)?.label[lang] ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {goalLabel && <p className="text-xs text-slate-500">🎯 {goalLabel}</p>}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Quick navigation to the app's sections */}
      <div className="grid grid-cols-3 gap-2">
        <NavCard href="/coach" emoji="🍽️" label="What to eat?" />
        <NavCard href="/workout" emoji="🏋️" label="Workout" />
        <NavCard
          href="/weight"
          emoji="⚖️"
          label="Weight"
          sub={lastWeight ? `${lastWeight.weight_kg} kg` : undefined}
        />
      </div>

      {/* The core loop: progress vs target + text food logging + corrections. */}
      <FoodLogger
        calorieTarget={profile.calorie_target ?? 0}
        proteinTarget={profile.protein_target_g ?? 0}
      />

      <p className="text-center text-xs text-slate-400 break-all">{user.email}</p>
    </main>
  );
}

function NavCard({
  href,
  emoji,
  label,
  sub,
}: {
  href: string;
  emoji: string;
  label: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50"
    >
      <span className="text-xl">{emoji}</span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </Link>
  );
}
