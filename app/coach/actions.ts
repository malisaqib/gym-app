"use server";

import { createClient } from "@/lib/supabase/server";
import { sumMacros } from "@/lib/food/totals";
import { itemMacros } from "@/lib/food/quantity";
import { suggestMealCoach, type MealSuggestion } from "@/lib/coach/mealCoach";
import { parseFoodText, type ParsedFoodItem } from "@/lib/food/parse";
import { logEvent } from "@/lib/analytics";
import type { FoodLog, Lang, Profile } from "@/lib/database.types";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type CoachResult =
  | { ok: true; suggestion: MealSuggestion; remainingCalories: number | null; remainingProtein: number | null }
  | { ok: false; error: string };

/**
 * Answer "what should I eat next?": work out the user's remaining calories and
 * protein for today, then ask the coach LLM for a recommendation.
 */
export async function suggestMeal(input: {
  question: string;
  date: string;
  focus?: string | null; // neutral behaviour focus from the user's motivation goal (optional)
}): Promise<CoachResult> {
  const question = input.question.trim();
  if (!question) return { ok: false, error: "Ask me what to eat (and what options you have)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Load targets (may be null if somehow not onboarded).
  const { data: profile } = await supabase
    .from("profiles")
    .select("calorie_target, protein_target_g, preferred_language")
    .eq("id", user.id)
    .single<Pick<Profile, "calorie_target" | "protein_target_g" | "preferred_language">>();

  const lang: Lang = profile?.preferred_language ?? "en";
  const hasTargets = !!profile?.calorie_target;

  // Remaining = target - what's eaten today (when we have a target + valid date).
  let remainingCalories: number | null = null;
  let remainingProtein: number | null = null;

  if (hasTargets && isDate(input.date)) {
    const { data: logs } = await supabase
      .from("food_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("logged_on", input.date)
      .returns<FoodLog[]>();

    // LIVE totals (base × amount via itemMacros) — the same math the dashboard
    // rings use. Never the stored totals cache: a desynced cache must not make
    // the coach disagree with what the user sees on the dashboard.
    const eaten = sumMacros((logs ?? []).map(itemMacros));
    remainingCalories = (profile!.calorie_target ?? 0) - Math.round(eaten.calories);
    remainingProtein = (profile!.protein_target_g ?? 0) - Math.round(eaten.protein_g);
  }

  try {
    const suggestion = await suggestMealCoach({
      question,
      hasTargets,
      remainingCalories,
      remainingProtein,
      lang,
      focus: input.focus ?? null,
    });
    await logEvent(supabase, user.id, "coach_asked", { hasTargets });
    return { ok: true, suggestion, remainingCalories, remainingProtein };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't get a suggestion." };
  }
}

type EstimateResult =
  | { ok: true; items: ParsedFoodItem[]; calories: number; protein: number }
  | { ok: false; error: string };

/**
 * Estimate a meal's macros WITHOUT logging it — for the coach's meal estimator.
 * Reuses the RAG-grounded parser (any cuisine, the full 7.8k-food catalog), so
 * it covers western + desi. The component turns the totals into friendly ranges
 * and falls back to the static desi estimator if this fails. (Read-only reuse;
 * the RAG pipeline itself is untouched.)
 */
export async function estimateMeal(text: string): Promise<EstimateResult> {
  const meal = text.trim();
  if (!meal) return { ok: false, error: "Type what you ate first." };
  try {
    const items = await parseFoodText(meal);
    if (items.length === 0) return { ok: false, error: "no-match" };
    const calories = items.reduce((s, i) => s + i.calories, 0);
    const protein = items.reduce((s, i) => s + i.protein_g, 0);
    return { ok: true, items, calories, protein };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "estimate-failed" };
  }
}
