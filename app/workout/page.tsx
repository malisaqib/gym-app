import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalToday } from "@/lib/date";
import WorkoutLogger from "./WorkoutLogger";

// Protected: must be signed in and onboarded.
export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = await getLocalToday();

  // Profile = onboarding gate + training-setup defaults. We only read columns
  // that already exist, so the page never depends on the additive 0008
  // migration (the setup card reads localStorage; the plan's logging history is
  // fetched by the buildProgram action per the generated exercises).
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, training_location, experience, training_days")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded) redirect("/onboarding");

  const profileDefaults = {
    trainingLocation: profile?.training_location ?? null,
    experience: profile?.experience ?? null,
    trainingDays: profile?.training_days ?? null,
  };

  return <WorkoutLogger today={today} profileDefaults={profileDefaults} />;
}
