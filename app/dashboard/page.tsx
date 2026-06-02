import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/database.types";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/workout"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            Workout
          </Link>
          {/* Sign out posts to the signOut Server Action. */}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* The core loop: progress vs target + text food logging + corrections. */}
      <FoodLogger
        calorieTarget={profile.calorie_target ?? 0}
        proteinTarget={profile.protein_target_g ?? 0}
      />

      <p className="text-center text-xs text-slate-400 break-all">{user.email}</p>
    </main>
  );
}
