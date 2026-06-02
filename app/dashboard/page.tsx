import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/database.types";

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
        {/* Sign out posts to the signOut Server Action. */}
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Daily targets from onboarding. Food-vs-target tracking comes in Phase 4. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-sm text-emerald-700">Daily calories</p>
          <p className="text-3xl font-bold text-emerald-800">
            {profile.calorie_target}
            <span className="ml-1 text-sm font-normal">kcal</span>
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-sm text-emerald-700">Daily protein</p>
          <p className="text-3xl font-bold text-emerald-800">
            {profile.protein_target_g}
            <span className="ml-1 text-sm font-normal">g</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Logged in as</p>
        <p className="font-medium break-all">{user.email}</p>
      </div>

      <p className="text-sm text-slate-500">
        Next up: log what you eat in plain language and watch these targets fill
        up.
      </p>
    </main>
  );
}
