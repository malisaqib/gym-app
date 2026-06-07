"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildPlan, swapMeal, filterFromPreference, mergeFilters, type DietPlan } from "@/lib/diet/planner";
import { parsePreferences, keywordPreferences } from "@/lib/coach/dietCoach";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { FoodPreference, Lang } from "@/lib/database.types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

type PlanResult = { ok: true; plan: DietPlan } | { ok: false; error: string };

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

// Split a free-text dislikes field ("beef, prawns") into avoid terms.
const splitTerms = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,\n;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

/** Load the user's saved plan (or null). */
export async function getDietPlan(): Promise<DietPlan | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("meal_plans").select("plan").eq("user_id", user.id).maybeSingle();
  return (data?.plan as DietPlan) ?? null;
}

/**
 * Generate (or regenerate) a plan. The diet screen's choices (vegetarian +
 * avoided foods) are AUTHORITATIVE — they're already seeded from the user's food
 * preference + onboarding "avoid" note (see the page), so every earlier answer
 * flows through. Free-text `notes` parse into ADDITIONAL restrictions (AI, with
 * a deterministic fallback). A bare call (no choices) keeps the prior plan's
 * preferences and just varies the selection.
 */
export async function generateDietPlan(input?: {
  notes?: string;
  vegetarian?: boolean;
  excludeTags?: string[];
  excludeFoods?: string[];
  // Phase 2: the "what you usually eat" box. When sent, we persist it additively
  // and seed the plan from it (so the user builds the plan WITH their real food).
  usualEating?: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    foods?: string;
    keep?: string;
  };
}): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "calorie_target, protein_target_g, food_preference, preferred_language, usual_breakfast, usual_lunch, usual_dinner, usual_foods, keep_foods, disliked_foods"
    )
    .eq("id", user.id)
    .single<{
      calorie_target: number | null;
      protein_target_g: number | null;
      food_preference: FoodPreference | null;
      preferred_language: Lang | null;
      usual_breakfast: string | null;
      usual_lunch: string | null;
      usual_dinner: string | null;
      usual_foods: string | null;
      keep_foods: string | null;
      disliked_foods: string | null;
    }>();

  const calorieTarget = profile?.calorie_target ?? 0;
  const proteinTargetG = profile?.protein_target_g ?? 0;
  if (!calorieTarget) {
    return { ok: false, error: "Set your goal first so I know your daily targets." };
  }

  // The user's saved dislikes ALWAYS apply (hard excludes), parsed as a list +
  // any "no X" phrasing.
  const dislikes = mergeFilters(
    { excludeFoods: splitTerms(profile?.disliked_foods) },
    keywordPreferences(profile?.disliked_foods ?? "")
  );
  const base = filterFromPreference(profile?.food_preference ?? null);

  const hasChoices =
    !!input &&
    (typeof input.vegetarian === "boolean" ||
      !!input.excludeTags?.length ||
      !!input.excludeFoods?.length ||
      !!input.notes?.trim());

  let filter;
  if (hasChoices) {
    const fromNotes = input!.notes?.trim()
      ? await parsePreferences(input!.notes, profile?.preferred_language ?? "en")
      : {};
    filter = mergeFilters(
      base,
      dislikes,
      { vegetarian: input!.vegetarian, excludeTags: input!.excludeTags, excludeFoods: input!.excludeFoods },
      fromNotes
    );
  } else {
    // Bare regenerate: keep the existing plan's prefs, else profile + dislikes.
    const { data: existing } = await supabase
      .from("meal_plans")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();
    const prior = (existing?.plan as DietPlan | undefined)?.filter;
    filter = prior ? mergeFilters(prior, dislikes) : mergeFilters(base, dislikes);
  }

  // If the user edited the "usual eating" box, persist it additively first so it
  // survives and seeds future regenerates too (best-effort; the plan still builds
  // even if this write fails / the column isn't migrated yet).
  const ue = input?.usualEating;
  if (ue) {
    await supabase
      .from("profiles")
      .update({
        usual_breakfast: ue.breakfast?.trim() || null,
        usual_lunch: ue.lunch?.trim() || null,
        usual_dinner: ue.dinner?.trim() || null,
        usual_foods: ue.foods?.trim() || null,
        keep_foods: ue.keep?.trim() || null,
      })
      .eq("id", user.id);
  }

  // Seed the plan from the user's usual meals + favourite + keep foods. Values
  // just typed in the box win over the stored profile; empty clears the seed.
  const pick = (typed: string | undefined, stored: string | null | undefined) =>
    (ue ? typed : stored)?.trim() || undefined;
  const usual = {
    breakfast: pick(ue?.breakfast, profile?.usual_breakfast),
    lunch: pick(ue?.lunch, profile?.usual_lunch),
    dinner: pick(ue?.dinner, profile?.usual_dinner),
    foods: pick(ue?.foods, profile?.usual_foods),
    keep: pick(ue?.keep, profile?.keep_foods),
  };

  const plan = buildPlan({ calorieTarget, proteinTargetG, filter, usual, seed: randomSeed() });

  const { error } = await supabase
    .from("meal_plans")
    .upsert({ user_id: user.id, plan }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/diet");
  return { ok: true, plan };
}

/** Re-select a single meal in the saved plan. */
export async function swapDietMeal(slot: MealSlot): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: row } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.plan) return { ok: false, error: "Generate a plan first." };

  const swapped = swapMeal(row.plan as DietPlan, slot, randomSeed());

  const { error } = await supabase
    .from("meal_plans")
    .update({ plan: swapped })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/diet");
  return { ok: true, plan: swapped };
}
