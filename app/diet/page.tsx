import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/ui/Screen";
import BottomNav from "@/components/BottomNav";
import DietPlanView from "./DietPlanView";
import { getDietPlan } from "./actions";
import { filterFromPreference, mergeFilters, type DietFilter } from "@/lib/diet/planner";
import { keywordPreferences } from "@/lib/coach/dietCoach";
import { extractOnboardingNote } from "@/lib/onboarding/notes";
import type { FoodPreference, Lang, OnboardingEntry } from "@/lib/database.types";

// The diet-plan generator screen (reached from the Eat tab). Protected.
export default async function DietPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "onboarded, calorie_target, protein_target_g, preferred_language, food_preference, onboarding_raw, usual_breakfast, usual_lunch, usual_dinner, usual_foods, keep_foods"
    )
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";
  const plan = await getDietPlan();

  // Seed the screen's filter so earlier answers carry over: a saved plan wins;
  // otherwise the food preference + the onboarding "avoid" note (parsed locally).
  const note = extractOnboardingNote(profile?.onboarding_raw as OnboardingEntry[] | null);
  const initialFilter: DietFilter =
    plan?.filter ??
    mergeFilters(
      filterFromPreference((profile?.food_preference as FoodPreference) ?? null),
      keywordPreferences(note)
    );

  const initialUsual = {
    breakfast: profile?.usual_breakfast ?? "",
    lunch: profile?.usual_lunch ?? "",
    dinner: profile?.usual_dinner ?? "",
    foods: profile?.usual_foods ?? "",
    keep: profile?.keep_foods ?? "",
  };

  return (
    <>
      <Screen>
        <DietPlanView
          initialPlan={plan}
          initialFilter={initialFilter}
          initialUsual={initialUsual}
          hasTargets={!!profile?.calorie_target}
          lang={lang}
        />
      </Screen>
      <BottomNav />
    </>
  );
}
