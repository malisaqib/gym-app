"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFoodText } from "@/lib/food/parse";
import { displayNameForLoggedFood } from "@/lib/food/logDisplayName";
import { retrieveFoods, lexicalRetrieveFoods, type RetrievedFood } from "@/lib/food/retrieve";
import { deriveQuantity, itemMacros, totalsFor } from "@/lib/food/quantity";
import {
  labelForFoodQuality,
  normalizeFoodText,
  qualityForFoodSource,
  type FoodSearchQuality,
} from "@/lib/food/searchRank";
import { logEvent } from "@/lib/analytics";
import type { FoodLog, NutritionSource } from "@/lib/database.types";

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

export interface LogFoodSearchOption {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  quality: FoodSearchQuality;
  label: string;
}

type SearchLogFoodsResult = { ok: true; foods: LogFoodSearchOption[] } | { ok: false; error: string };

type FoodRow = Omit<RetrievedFood, "score">;

const FOOD_SELECT = "id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source";

const n = (value: unknown) => Math.round(Number(value) || 0);

function nutritionSourceForFoodSource(source: string | null | undefined): NutritionSource {
  if (source === "curated") return "verified";
  if (source === "user_estimate") return "estimated";
  return "imported";
}

function foodOption(food: RetrievedFood): LogFoodSearchOption {
  const quality = qualityForFoodSource(food.source);
  return {
    id: `food:${food.id}`,
    name: food.name,
    portion: food.portion,
    calories: n(food.calories),
    protein: n(food.protein_g),
    quality,
    label: labelForFoodQuality(quality),
  };
}

function recentOption(row: FoodLog): LogFoodSearchOption {
  const macros = itemMacros(row);
  const amount = row.amount ?? row.quantity ?? 1;
  const unit = row.unit_mode === "portion" ? "g" : row.unit || "serving";
  return {
    id: `recent:${row.id}`,
    name: row.food_name,
    portion: `${amount} ${unit}`.trim(),
    calories: macros.calories,
    protein: macros.protein_g,
    quality: "recent",
    label: labelForFoodQuality("recent"),
  };
}

function dedupeOptions(options: LogFoodSearchOption[]): LogFoodSearchOption[] {
  const seen = new Set<string>();
  const out: LogFoodSearchOption[] = [];
  for (const option of options) {
    const key = normalizeFoodText(option.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

async function recentFoodSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  query: string,
  limit: number
): Promise<LogFoodSearchOption[]> {
  const normalized = normalizeFoodText(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const { data } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80)
    .returns<FoodLog[]>();

  const seen = new Set<string>();
  const options: LogFoodSearchOption[] = [];
  for (const row of data ?? []) {
    const hay = normalizeFoodText(`${row.food_name} ${row.raw_text ?? ""}`);
    if (!tokens.every((token) => hay.includes(token))) continue;
    const key = normalizeFoodText(row.food_name);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(recentOption(row));
    if (options.length >= limit) break;
  }
  return options;
}

/** Recent foods with no query, for quick repeat logging. */
export async function getRecentLogFoods(limit = 10): Promise<SearchLogFoodsResult> {
  const capped = Math.min(20, Math.max(1, Math.round(Number(limit) || 10)));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(120)
    .returns<FoodLog[]>();

  return { ok: true, foods: dedupeOptions((data ?? []).map(recentOption)).slice(0, capped) };
}

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
      food_name: displayNameForLoggedFood(text, p, parsed.length),
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
      matched_food_id: p.matched_food_id ?? null,
      match_confidence: p.match_confidence ?? null,
      nutrition_source: p.nutrition_source ?? "estimated",
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

/** Copy the previous day into an empty target day. Prevents accidental duplicates. */
export async function copyFoodLogs(input: { fromDate: string; toDate: string }): Promise<LogResult> {
  if (!isDate(input.fromDate) || !isDate(input.toDate)) return { ok: false, error: "Invalid date." };
  if (input.fromDate === input.toDate) return { ok: false, error: "Pick a different day to copy from." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { count: existing } = await supabase
    .from("food_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("logged_on", input.toDate);
  if ((existing ?? 0) > 0) {
    return { ok: false, error: "Today already has food logged. Use Quick add to repeat individual foods." };
  }

  const { data: previous, error: readError } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("logged_on", input.fromDate)
    .order("created_at", { ascending: true })
    .returns<FoodLog[]>();
  if (readError) return { ok: false, error: readError.message };
  if (!previous?.length) return { ok: false, error: "No food logs found from yesterday." };

  const rows = previous.map((row) => ({
    user_id: user.id,
    logged_on: input.toDate,
    raw_text: row.raw_text,
    food_name: row.food_name,
    quantity: row.quantity,
    unit: row.unit,
    unit_mode: row.unit_mode,
    base_calories: row.base_calories,
    base_protein_g: row.base_protein_g,
    base_carbs_g: row.base_carbs_g,
    base_fat_g: row.base_fat_g,
    amount: row.amount,
    serving_grams: row.serving_grams,
    calories: row.calories,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    source: row.source,
    matched_food_id: row.matched_food_id,
    match_confidence: row.match_confidence,
    nutrition_source: row.nutrition_source,
  }));

  const { data, error } = await supabase.from("food_logs").insert(rows).select().returns<FoodLog[]>();
  if (error) return { ok: false, error: error.message };

  await logEvent(supabase, user.id, "food_logged", { items: (data ?? []).length, method: "copy_day" });
  revalidatePath("/dashboard");
  return { ok: true, items: data ?? [] };
}

/** Search the full logging database, with verified curated results first. */
export async function searchLogFoods(query: string): Promise<SearchLogFoodsResult> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, foods: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // As-you-type must be snappy: lexical-only (indexed trigram + parallel term
  // queries, Roman-Urdu synonyms included). The embedding-backed semantic path
  // only runs as a rescue when lexical finds nothing (rare, e.g. fuzzy phrasing).
  let dbFoods: RetrievedFood[] = [];
  try {
    dbFoods = await lexicalRetrieveFoods(q, 24);
    if (dbFoods.length === 0) dbFoods = await retrieveFoods(q, 24);
  } catch {
    dbFoods = [];
  }

  const dbOptions = dbFoods.map(foodOption);
  const verified = dbOptions.filter((food) => food.quality === "verified");
  const imported = dbOptions.filter((food) => food.quality !== "verified");
  const recent = await recentFoodSearch(supabase, user.id, q, 8);

  return { ok: true, foods: dedupeOptions([...verified, ...recent, ...imported]).slice(0, 20) };
}

function foodQuantity(food: FoodRow) {
  const grams = Number(food.portion_grams);
  if (Number.isFinite(grams) && grams > 0) {
    return {
      unit_mode: "portion" as const,
      unit: "g",
      amount: grams,
      serving_grams: grams,
      base_calories: Number(food.calories) / grams,
      base_protein_g: Number(food.protein_g) / grams,
      base_carbs_g: Number(food.carbs_g) / grams,
      base_fat_g: Number(food.fat_g) / grams,
    };
  }
  return {
    unit_mode: "count" as const,
    unit: "serving",
    amount: 1,
    serving_grams: null,
    base_calories: Number(food.calories),
    base_protein_g: Number(food.protein_g),
    base_carbs_g: Number(food.carbs_g),
    base_fat_g: Number(food.fat_g),
  };
}

/** Log an exact search result from the full food database or the user's recents. */
export async function logSearchedFood(input: { optionId: string; date: string }): Promise<LogResult> {
  if (!isDate(input.date)) return { ok: false, error: "Invalid date." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const optionId = input.optionId.trim();
  let row;

  if (optionId.startsWith("food:")) {
    const foodId = optionId.slice("food:".length);
    const { data: food, error } = await supabase
      .from("foods")
      .select(FOOD_SELECT)
      .eq("id", foodId)
      .single<FoodRow>();
    if (error || !food) return { ok: false, error: "Food not found." };

    const q = foodQuantity(food);
    const totals = totalsFor(q);
    row = {
      user_id: user.id,
      logged_on: input.date,
      raw_text: food.name,
      food_name: food.name,
      quantity: 1,
      unit: food.portion,
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
      source: "manual" as const,
      matched_food_id: `db:${food.id}`,
      match_confidence: 1,
      nutrition_source: nutritionSourceForFoodSource(food.source),
    };
  } else if (optionId.startsWith("recent:")) {
    const logId = optionId.slice("recent:".length);
    const { data: previous, error } = await supabase
      .from("food_logs")
      .select("*")
      .eq("id", logId)
      .eq("user_id", user.id)
      .single<FoodLog>();
    if (error || !previous) return { ok: false, error: "Recent food not found." };

    const macros = itemMacros(previous);
    const amount = previous.amount && previous.amount > 0 ? previous.amount : 1;
    row = {
      user_id: user.id,
      logged_on: input.date,
      raw_text: previous.raw_text ?? previous.food_name,
      food_name: previous.food_name,
      quantity: previous.quantity,
      unit: previous.unit,
      unit_mode: previous.unit_mode ?? "count",
      base_calories: previous.base_calories ?? previous.calories / amount,
      base_protein_g: previous.base_protein_g ?? previous.protein_g / amount,
      base_carbs_g: previous.base_carbs_g ?? previous.carbs_g / amount,
      base_fat_g: previous.base_fat_g ?? previous.fat_g / amount,
      amount,
      serving_grams: previous.serving_grams,
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      source: previous.source,
      matched_food_id: previous.matched_food_id,
      match_confidence: previous.match_confidence,
      nutrition_source: previous.nutrition_source,
    };
  } else {
    return { ok: false, error: "Unknown food result." };
  }

  const { data, error } = await supabase
    .from("food_logs")
    .insert(row)
    .select()
    .returns<FoodLog[]>();

  if (error) return { ok: false, error: error.message };
  await logEvent(supabase, user.id, "food_logged", { items: (data ?? []).length, method: "search" });
  revalidatePath("/dashboard");
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
      nutrition_source: "corrected",
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
