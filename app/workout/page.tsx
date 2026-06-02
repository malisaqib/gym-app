import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import type { WorkoutLog } from "@/lib/database.types";
import { ALL_EXERCISE_NAMES } from "@/lib/workouts/program";
import { groupExerciseHistory } from "@/lib/workouts/history";
import WorkoutLogger from "./WorkoutLogger";

// Protected: must be signed in and onboarded.
export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = await getLocalToday();

  // Profile (onboarding gate) + recent workout logs, in parallel on the server.
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("onboarded").eq("id", user.id).single(),
    supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", user.id)
      .in("exercise_name", ALL_EXERCISE_NAMES)
      .order("performed_on", { ascending: false })
      .order("set_number", { ascending: true })
      .limit(300)
      .returns<WorkoutLog[]>(),
  ]);

  if (!profile?.onboarded) redirect("/onboarding");

  const initialHistory = groupExerciseHistory(rows ?? [], ALL_EXERCISE_NAMES, today);

  return <WorkoutLogger initialHistory={initialHistory} today={today} />;
}
