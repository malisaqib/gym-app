import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/ui/Screen";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { SignOutButton } from "@/app/auth/SignOutButton";
import { FeedbackForm } from "@/components/FeedbackForm";
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
      "full_name, relatable_goal, timeline, training_location, food_preference, protein_powder_preference, region, sex, age, height_cm, weight_kg, training_days, experience, calorie_target, protein_target_g, carb_target_g, fat_target_g, preferred_language, activity_level, goal_weight_kg, weekly_pace_kg, target_date, usual_breakfast, usual_lunch, usual_dinner, usual_foods, disliked_foods"
    )
    .eq("id", user.id)
    .single<Partial<Profile>>();

  const lang = (profile?.preferred_language as Lang) ?? "en";

  // Map the profile row to the editor's shape, with sensible fallbacks so a
  // partially-filled profile still renders.
  const weightKg = profile?.weight_kg ?? 70;
  const details: ProfileDetails = {
    fullName: profile?.full_name ?? "",
    relatableGoal: profile?.relatable_goal ?? "general",
    timeline: profile?.timeline ?? "no_deadline",
    trainingLocation: profile?.training_location ?? "home",
    foodPreference: profile?.food_preference ?? "normal_desi",
    proteinPowderPreference: profile?.protein_powder_preference ?? "unknown",
    region: profile?.region ?? null,
    sex: profile?.sex ?? "male",
    age: profile?.age ?? 25,
    heightCm: profile?.height_cm ?? 170,
    weightKg,
    goalWeightKg: profile?.goal_weight_kg ?? weightKg, // null => maintain at current
    activityLevel: profile?.activity_level ?? "light",
    trainingDays: profile?.training_days ?? 3,
    experience: profile?.experience ?? "beginner",
    preferredLanguage: lang,
    calorieTarget: profile?.calorie_target ?? null,
    proteinTargetG: profile?.protein_target_g ?? null,
    carbTargetG: profile?.carb_target_g ?? null,
    fatTargetG: profile?.fat_target_g ?? null,
    targetDate: profile?.target_date ?? null,
    usualBreakfast: profile?.usual_breakfast ?? "",
    usualLunch: profile?.usual_lunch ?? "",
    usualDinner: profile?.usual_dinner ?? "",
    usualFoods: profile?.usual_foods ?? "",
    dislikedFoods: profile?.disliked_foods ?? "",
  };

  return (
    <>
      <Screen>
        <LargeTitle title="Settings" />
        {/* Basic info from onboarding — viewable & editable here. */}
        <ProfileEditor initial={details} />

        {/* Replay the feature walkthrough (?tour=1 forces it on the dashboard). */}
        <Link
          href="/dashboard?tour=1"
          className="flex items-center gap-3 rounded-card-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.99]"
        >
          <Compass size={18} className="shrink-0 text-primary" aria-hidden />
          {lang === "roman_urdu" ? "App ka tour dobara dekhein" : "Replay app tour"}
        </Link>

        <FeedbackForm lang={lang} />
        <SignOutButton />
        <p className="text-center text-xs text-muted-foreground break-all">{user.email}</p>
      </Screen>
      <BottomNav />
    </>
  );
}
