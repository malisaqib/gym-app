"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFoodText } from "@/lib/food/parse";
import { logEvent } from "@/lib/analytics";
import type { FoodLog } from "@/lib/database.types";

// Basic YYYY-MM-DD shape check for the client-supplied local date.
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Fetch a user's food items for one day (their local date). */
export async function getFoodLogs(date: string): Promise<FoodLog[]> {
  if (!isDate(date)) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("logged_on", date)
    .order("created_at", { ascending: true })
    .returns<FoodLog[]>();

  return data ?? [];
}

type LogResult =
  | { ok: true; items: FoodLog[] }
  | { ok: false; error: string };

/** Parse free text with the LLM, then save each detected item for the day. */
export async function logFood(input: { text: string; date: string }): Promise<LogResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Type what you ate first." };
  if (!isDate(input.date)) return { ok: false, error: "Invalid date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let parsed;
  try {
    parsed = await parseFoodText(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not parse that." };
  }

  if (parsed.length === 0) {
    return { ok: false, error: "Couldn't recognise any food. Try rephrasing." };
  }

  // Each parsed item becomes a row. We keep the original text on every row so
  // the raw user message is stored alongside the structured macros.
  const rows = parsed.map((p) => ({
    user_id: user.id,
    logged_on: input.date,
    raw_text: text,
    food_name: p.food_name,
    quantity: p.quantity,
    unit: p.unit,
    calories: p.calories,
    protein_g: p.protein_g,
    carbs_g: p.carbs_g,
    fat_g: p.fat_g,
    source: "llm" as const,
  }));

  const { data, error } = await supabase
    .from("food_logs")
    .insert(rows)
    .select()
    .returns<FoodLog[]>();

  if (error) return { ok: false, error: error.message };

  await logEvent(supabase, user.id, "food_logged", { items: (data ?? []).length });
  revalidatePath("/dashboard"); // keep the server-rendered list fresh on next nav
  return { ok: true, items: data ?? [] };
}

type ItemResult =
  | { ok: true; item: FoodLog }
  | { ok: false; error: string };

/**
 * One-tap correction: overwrite an item's calories/protein and mark it as
 * user-corrected. RLS plus the explicit user_id check keep edits owner-only.
 */
export async function correctFoodItem(
  id: string,
  patch: { calories: number; protein_g: number }
): Promise<ItemResult> {
  const calories = Math.max(0, Math.round(Number(patch.calories)));
  const protein_g = Math.max(0, Math.round(Number(patch.protein_g)));
  if (!Number.isFinite(calories) || !Number.isFinite(protein_g)) {
    return { ok: false, error: "Enter valid numbers." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("food_logs")
    .update({ calories, protein_g, source: "corrected" })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single<FoodLog>();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, item: data };
}

/** Delete one of the user's food items. */
export async function deleteFoodItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
