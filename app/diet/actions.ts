"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildPlan, swapMeal, filterFromPreference, type DietPlan, type DietFilter } from "@/lib/diet/planner";
import { parsePreferences } from "@/lib/coach/dietCoach";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import type { FoodPreference, Lang } from "@/lib/database.types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

type PlanResult = { ok: true; plan: DietPlan } | { ok: false; error: string };

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

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
 * Generate (or regenerate) a plan from the user's targets + preferences. With
 * free-text `notes` we parse new preferences (AI, with deterministic fallback);
 * without notes a plain regenerate keeps the existing preferences and just
 * varies the selection.
 */
export async function generateDietPlan(notes?: string): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("calorie_target, protein_target_g, food_preference, preferred_language")
    .eq("id", user.id)
    .single<{
      calorie_target: number | null;
      protein_target_g: number | null;
      food_preference: FoodPreference | null;
      preferred_language: Lang | null;
    }>();

  const calorieTarget = profile?.calorie_target ?? 0;
  const proteinTargetG = profile?.protein_target_g ?? 0;
  if (!calorieTarget) {
    return { ok: false, error: "Set your goal first so I know your daily targets." };
  }

  // Decide the filter: new notes -> parse; plain regenerate -> keep prior prefs.
  const { data: existing } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  let filter: DietFilter;
  if (notes && notes.trim()) {
    const parsed = await parsePreferences(notes, profile?.preferred_language ?? "en");
    filter = filterFromPreference(profile?.food_preference ?? null, parsed);
  } else if (existing?.plan && (existing.plan as DietPlan).filter) {
    filter = (existing.plan as DietPlan).filter;
  } else {
    filter = filterFromPreference(profile?.food_preference ?? null);
  }

  const plan = buildPlan({ calorieTarget, proteinTargetG, filter, seed: randomSeed() });

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
