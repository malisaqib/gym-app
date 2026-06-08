"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFoodText } from "@/lib/food/parse";
import { deriveQuantity, totalsFor } from "@/lib/food/quantity";
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
  // `reason: "no_match"` flags the "we couldn't recognise any food" case so the
  // UI can offer a "report missing food" prompt (vs a generic/network error).
  | { ok: false; error: string; reason?: "no_match" };

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
    return { ok: false, error: "Couldn't recognise any food. Try rephrasing.", reason: "no_match" };
  }

  // Each parsed item becomes a row. We keep the original text on every row so
  // the raw user message is stored alongside the structured macros. We also
  // derive a per-unit/per-gram base + a live quantity so the user can adjust HOW
  // MUCH later; the total columns are kept as a synced cache (= base × amount).
  const rows = parsed.map((p) => {
    const q = deriveQuantity(p);
    const totals = totalsFor(q);
    return {
      user_id: user.id,
      logged_on: input.date,
      raw_text: text,
      food_name: p.food_name,
      quantity: p.quantity,
      unit: p.unit,
      unit_mode: q.unit_mode,
      base_calories: q.base_calories,
      base_protein_g: q.base_protein_g,
      base_carbs_g: q.base_carbs_g,
      base_fat_g: q.base_fat_g,
      amount: q.amount,
      serving_grams: q.serving_grams,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      source: "llm" as const,
    };
  });

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
 * Manual correction: set an item's exact calories/protein. To stay consistent
 * with the live quantity model we store these as the per-unit base AT THE CURRENT
 * amount (base = entered / amount), so the corrected numbers hold now and still
 * scale if the user later changes the quantity. carbs/fat base is left as-is.
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

  const { data: row } = await supabase
    .from("food_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<FoodLog>();
  if (!row) return { ok: false, error: "Item not found." };

  const amount = row.amount && row.amount > 0 ? row.amount : 1;

  const { data, error } = await supabase
    .from("food_logs")
    .update({
      base_calories: calories / amount,
      base_protein_g: protein_g / amount,
      calories,
      protein_g,
      source: "corrected",
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single<FoodLog>();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, item: data };
}

/**
 * Set HOW MUCH of an item was eaten. The per-unit/per-gram `base_*` is the source
 * of truth; we recompute the stored totals = round(base × amount). Self-heals a
 * legacy row whose base_* is null (treats its current total as one unit).
 */
export async function setFoodItemAmount(id: string, amount: number): Promise<ItemResult> {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Enter a valid amount." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: row } = await supabase
    .from("food_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<FoodLog>();
  if (!row) return { ok: false, error: "Item not found." };

  const base = {
    base_calories: row.base_calories ?? row.calories,
    base_protein_g: row.base_protein_g ?? row.protein_g,
    base_carbs_g: row.base_carbs_g ?? row.carbs_g,
    base_fat_g: row.base_fat_g ?? row.fat_g,
  };
  const mode = row.unit_mode ?? "count";
  // Sane caps: grams up to 5000, units up to 100.
  const clamped = Math.min(amt, mode === "portion" ? 5000 : 100);
  const totals = totalsFor({ ...base, amount: clamped });

  const { data, error } = await supabase
    .from("food_logs")
    .update({
      ...base,
      unit_mode: mode,
      amount: clamped,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      source: "corrected",
    })
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
