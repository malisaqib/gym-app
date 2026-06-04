import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/ui/Screen";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { SignOutButton } from "@/app/auth/SignOutButton";
import { SupportResources } from "@/components/SupportResources";
import BudgetFitnessMode from "@/app/coach/BudgetFitnessMode";
import ProfileEditor, { type ProfileDetails } from "./ProfileEditor";
import BottomNav from "@/components/BottomNav";
import type { Lang, Profile } from "@/lib/database.types";

// Protected by its own auth check (same pattern as other pages).
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, relatable_goal, timeline, training_location, food_preference, sex, age, height_cm, weight_kg, training_days, experience, calorie_target, protein_target_g, preferred_language"
    )
    .eq("id", user.id)
    .single<Partial<Profile>>();

  const lang = (profile?.preferred_language as Lang) ?? "en";

  // Map the profile row to the editor's shape, with sensible fallbacks so a
  // partially-filled profile still renders.
  const details: ProfileDetails = {
    fullName: profile?.full_name ?? "",
    relatableGoal: profile?.relatable_goal ?? "general",
    timeline: profile?.timeline ?? "no_deadline",
    trainingLocation: profile?.training_location ?? "home",
    foodPreference: profile?.food_preference ?? "normal_desi",
    sex: profile?.sex ?? "male",
    age: profile?.age ?? 25,
    heightCm: profile?.height_cm ?? 170,
    weightKg: profile?.weight_kg ?? 70,
    trainingDays: profile?.training_days ?? 3,
    experience: profile?.experience ?? "beginner",
    preferredLanguage: lang,
    calorieTarget: profile?.calorie_target ?? null,
    proteinTargetG: profile?.protein_target_g ?? null,
  };

  return (
    <>
      <Screen>
        <LargeTitle title="Settings" />
        {/* Basic info from onboarding — viewable & editable here. */}
        <ProfileEditor initial={details} />
        {/* Budget set once here; editable anytime (self-contained, localStorage). */}
        <BudgetFitnessMode lang={lang} />
        <SupportResources />
        <SignOutButton />
        <p className="text-center text-xs text-muted-foreground break-all">{user.email}</p>
      </Screen>
      <BottomNav />
    </>
  );
}
