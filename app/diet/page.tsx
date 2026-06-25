import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/ui/Screen";
import BottomNav from "@/components/BottomNav";
import DietPlanView from "./DietPlanView";
import { getDietPlanState } from "./actions";
import { filterFromPreference, mergeFilters, type DietFilter } from "@/lib/diet/planner";
import { keywordPreferences } from "@/lib/coach/dietCoach";
import { extractOnboardingNote } from "@/lib/onboarding/notes";
import { getLocalToday } from "@/lib/date";
import { itemMacros } from "@/lib/food/quantity";
import { sumMacros } from "@/lib/food/totals";
import { resolveDietMode } from "@/lib/diet/dietMode";
import type {
  DietMode,
  FoodLog,
  FoodPreference,
  Lang,
  OnboardingEntry,
} from "@/lib/database.types";

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
      "onboarded, calorie_target, protein_target_g, preferred_language, food_preference, diet_mode, onboarding_raw, usual_breakfast, usual_lunch, usual_dinner, usual_foods, keep_foods, goal_weight_kg, weekly_pace_kg, target_date"
    )
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";
  const { plan, settingsChanged } = await getDietPlanState();

  // Today-aware Plan tab (the daily loop): read what's actually been eaten today
  // from the SAME food_logs source as Home, so "eaten / remaining" agrees across
  // tabs. `today` is the user's local day; the view freezes meals whose slot is
  // in plan.logged.slots when plan.logged.date === today.
  const today = await getLocalToday();
  const { data: foodRows } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("logged_on", today)
    .returns<FoodLog[]>();
  const consumedTotals = sumMacros((foodRows ?? []).map(itemMacros));
  const consumed = { calories: consumedTotals.calories, protein: consumedTotals.protein_g };

  // Seed the screen's filter so earlier answers carry over: a saved plan wins;
  // otherwise the food preference + the onboarding "avoid" note (parsed locally).
  const note = extractOnboardingNote(profile?.onboarding_raw as OnboardingEntry[] | null);
  const initialFilter: DietFilter =
    plan?.filter ??
    mergeFilters(
      filterFromPreference(
        (profile?.food_preference as FoodPreference) ?? null,
        undefined,
        resolveDietMode(
          (profile?.diet_mode as DietMode) ?? null,
          (profile?.food_preference as FoodPreference) ?? null
        )
      ),
      keywordPreferences(note)
    );

  const initialUsual = {
    breakfast: profile?.usual_breakfast ?? "",
    lunch: profile?.usual_lunch ?? "",
    dinner: profile?.usual_dinner ?? "",
    foods: profile?.usual_foods ?? "",
    keep: profile?.keep_foods ?? "",
  };

  // Safe-pace context for the plan header: the stored pace is ALWAYS the safe
  // (possibly capped) one, and target_date was computed from it — so this line
  // is the honest "at this pace you'll reach X by DATE" message.
  const paceInfo =
    profile?.goal_weight_kg && profile?.weekly_pace_kg
      ? {
          goalWeightKg: profile.goal_weight_kg as number,
          weeklyPaceKg: profile.weekly_pace_kg as number,
          targetDate: (profile.target_date as string | null) ?? null,
        }
      : null;

  return (
    <>
      <Screen>
        <DietPlanView
          initialPlan={plan}
          initialSettingsChanged={settingsChanged}
          initialFilter={initialFilter}
          initialUsual={initialUsual}
          hasTargets={!!profile?.calorie_target}
          lang={lang}
          paceInfo={paceInfo}
          today={today}
          consumed={consumed}
        />
      </Screen>
      <BottomNav />
    </>
  );
}
