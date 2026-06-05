import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/ui/Screen";
import BottomNav from "@/components/BottomNav";
import DietPlanView from "./DietPlanView";
import { getDietPlan } from "./actions";
import type { Lang } from "@/lib/database.types";

// The diet-plan generator screen (reached from the Eat tab). Protected.
export default async function DietPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded, calorie_target, protein_target_g, preferred_language")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded) redirect("/onboarding");

  const lang = (profile?.preferred_language as Lang) ?? "en";
  const plan = await getDietPlan();

  return (
    <>
      <Screen>
        <DietPlanView initialPlan={plan} hasTargets={!!profile?.calorie_target} lang={lang} />
      </Screen>
      <BottomNav />
    </>
  );
}
