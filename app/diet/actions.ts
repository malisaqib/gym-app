"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlan,
  swapMeal,
  filterFromPreference,
  mergeFilters,
  swapPlanItem,
  removePlanItem,
  insertPlanItem,
  addPlanItem,
  appendPlanItem,
  setPlanItemAmount,
  setPlanItemMacros,
  searchCatalog,
  bestCatalogMatch,
  type DietPlan,
  type PlanMealItem,
} from "@/lib/diet/planner";
import { parsePreferences, keywordPreferences } from "@/lib/coach/dietCoach";
import { estimateMeal } from "@/app/coach/actions";
import { FOOD_CATALOG, type CatalogFood, type MealSlot } from "@/lib/diet/foodCatalog";
import { classifyFoods, type RawFoodRow } from "@/lib/diet/foodClassify";
import { planItemToLogRow } from "@/lib/diet/planToLog";
import { logEvent } from "@/lib/analytics";
import type { FoodPreference, Lang } from "@/lib/database.types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

// --- merged food pool: curated catalog ∪ plan-eligible imported foods --------
// The curated 71 (foodCatalog.ts) are the authoritative, desi-accurate base.
// Imported breadth comes ONLY from rows the DB has flagged plan_eligible=true
// (persisted by scripts/persist-classification.ts and human-overridable per row
// without a deploy — step 5). classifyFoods still runs on the fetched rows to
// derive planner metadata (role/slots/vegetarian/tags) and as a second safety
// gate. Cached per server instance; degrades to the catalog if the DB is down.
let CLASSIFIED_DB: CatalogFood[] | null = null;

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadClassifiedDb(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CatalogFood[]> {
  const rows: RawFoodRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("foods")
      .select("id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source")
      .in("source", ["usda_sr", "usda_fndds"])
      .eq("plan_eligible", true)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as unknown as RawFoodRow[]));
    if (data.length < PAGE) break;
  }
  return classifyFoods(rows);
}

/** Curated catalog (authoritative) ∪ classified USDA foods, deduped by name. */
async function getMealPool(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CatalogFood[]> {
  if (!CLASSIFIED_DB) {
    try {
      CLASSIFIED_DB = await loadClassifiedDb(supabase);
    } catch {
      CLASSIFIED_DB = []; // degrade to the curated catalog if the DB is unavailable
    }
  }
  // Dedupe by display name against the curated catalog AND within the imported
  // set — many USDA rows collapse to the same friendly name (e.g. several
  // "Cheese, cottage" variants), and we never want a meal to show the same food
  // twice. Curated always wins; the first imported variant of a name is kept.
  const seen = new Set(FOOD_CATALOG.map((f) => normName(f.name)));
  const extra: CatalogFood[] = [];
  for (const f of CLASSIFIED_DB) {
    const key = normName(f.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    extra.push(f);
  }
  return [...FOOD_CATALOG, ...extra];
}

type PlanResult = { ok: true; plan: DietPlan } | { ok: false; error: string };

/** A catalog food trimmed for the "add food" picker. */
export interface FoodOption {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
}
type SearchResult = { ok: true; foods: FoodOption[] } | { ok: false; error: string };
type AddResult = { ok: true; plan: DietPlan; approx?: boolean } | { ok: false; error: string };

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

  const pool = await getMealPool(supabase);
  const plan = buildPlan({ calorieTarget, proteinTargetG, filter, usual, seed: randomSeed(), pool });

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

  const pool = await getMealPool(supabase);
  const swapped = swapMeal(row.plan as DietPlan, slot, randomSeed(), pool);

  const { error } = await supabase
    .from("meal_plans")
    .update({ plan: swapped })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/diet");
  return { ok: true, plan: swapped };
}

// --- per-item editing (Phase 3) --------------------------------------------
// Each loads the saved plan, applies a deterministic pure transform, then
// persists. The client updates optimistically and reconciles with the returned
// (authoritative) plan, rolling back on failure.

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Auth + load the user's saved plan (shared by the per-item actions). */
async function planContext(): Promise<
  { ok: true; supabase: Supa; userId: string; plan: DietPlan } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data } = await supabase.from("meal_plans").select("plan").eq("user_id", user.id).maybeSingle();
  if (!data?.plan) return { ok: false, error: "Generate a plan first." };
  return { ok: true, supabase, userId: user.id, plan: data.plan as DietPlan };
}

async function persistPlan(supabase: Supa, userId: string, plan: DietPlan): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("meal_plans").update({ plan }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/diet");
  return { ok: true };
}

/**
 * "I ate this" — log a plan meal's items into today's food log (the plan→log
 * loop). SERVER-AUTHORITATIVE: items come from the user's SAVED plan, never
 * from the client; macros are mapped by the pure planItemToLogRow through the
 * same live-quantity model as every other logging path.
 */
export async function logPlanMeal(
  slot: MealSlot,
  date: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Invalid date." };

  const ctx = await planContext();
  if (!ctx.ok) return ctx;

  const meal = ctx.plan.meals.find((m) => m.slot === slot);
  if (!meal || meal.items.length === 0) return { ok: false, error: "This meal has no foods to log." };

  const rows = meal.items.map((item) => ({
    ...planItemToLogRow(item),
    user_id: ctx.userId,
    logged_on: date,
  }));

  const { error } = await ctx.supabase.from("food_logs").insert(rows);
  if (error) return { ok: false, error: error.message };

  await logEvent(ctx.supabase, ctx.userId, "food_logged", { items: rows.length, method: "plan_meal", slot });
  revalidatePath("/dashboard");
  return { ok: true, count: rows.length };
}

function isRestorablePlanItem(item: PlanMealItem): item is PlanMealItem {
  return (
    !!item &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.portion === "string" &&
    Number.isFinite(item.calories) &&
    Number.isFinite(item.protein) &&
    Number.isFinite(item.carbs) &&
    Number.isFinite(item.fat)
  );
}

/** Swap a single food item for a similar one (same role, in-budget, allowed). */
export async function swapDietItem(slot: MealSlot, index: number): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const pool = await getMealPool(ctx.supabase);
  const next = swapPlanItem(ctx.plan, slot, index, randomSeed(), pool);
  if (next === ctx.plan) return { ok: false, error: "No other option fits this slot." };
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Remove a single food item from a meal. */
export async function removeDietItem(slot: MealSlot, index: number): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = removePlanItem(ctx.plan, slot, index);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Restore a just-removed item, preserving any other plan edits made since. */
export async function restoreDietItem(slot: MealSlot, index: number, item: PlanMealItem): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  if (!isRestorablePlanItem(item)) return { ok: false, error: "Couldn't restore that food." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = insertPlanItem(ctx.plan, slot, index, item);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Add a catalog food (chosen from the picker) to a meal. */
export async function addDietItem(slot: MealSlot, foodId: string): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const pool = await getMealPool(ctx.supabase);
  const next = addPlanItem(ctx.plan, slot, foodId, pool);
  if (next === ctx.plan) return { ok: false, error: "Couldn't add that food." };
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Set how much of a single plan item was/will be eaten (grams or units). */
export async function setDietItemAmount(slot: MealSlot, index: number, amount: number): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Enter a valid amount." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = setPlanItemAmount(ctx.plan, slot, index, n);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Override a plan item's exact calories/protein (manual edit). */
export async function correctDietItem(
  slot: MealSlot,
  index: number,
  patch: { calories: number; protein_g: number }
): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const cal = Number(patch.calories);
  const pro = Number(patch.protein_g);
  if (!Number.isFinite(cal) || cal < 0 || !Number.isFinite(pro) || pro < 0) {
    return { ok: false, error: "Enter valid numbers." };
  }
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = setPlanItemMacros(ctx.plan, slot, index, { calories: cal, protein_g: pro });
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Searchable food list for the per-meal "add food" control (respects avoids). */
export async function searchDietFoods(slot: MealSlot, query: string): Promise<SearchResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const pool = await getMealPool(ctx.supabase);
  const foods: FoodOption[] = searchCatalog(query, ctx.plan.filter, slot, pool).map((f) => ({
    id: f.id,
    name: f.name,
    portion: f.portion,
    calories: f.calories,
    protein: f.protein,
  }));
  return { ok: true, foods };
}

/**
 * Add a free-TYPED food. Deterministic catalog match first (grounded macros);
 * if none, fall back to the RAG/AI estimator (read-only reuse) and flag the item
 * as approximate. Returns `approx` so the UI can label it honestly.
 */
export async function addCustomDietItem(slot: MealSlot, text: string): Promise<AddResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const q = text.trim();
  if (q.length < 2) return { ok: false, error: "Type a food first." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;

  const pool = await getMealPool(ctx.supabase);
  const match = bestCatalogMatch(q, ctx.plan.filter, slot, pool);
  let next: DietPlan;
  let approx = false;
  if (match) {
    next = addPlanItem(ctx.plan, slot, match.id, pool);
  } else {
    const est = await estimateMeal(q);
    if (!est.ok) {
      return { ok: false, error: "Couldn't find or estimate that — try simpler words, or pick from the list." };
    }
    const item: PlanMealItem = {
      id: `custom-${Date.now()}`,
      name: q.slice(0, 60),
      portion: "as entered",
      calories: Math.round(est.calories),
      protein: Math.round(est.protein),
      carbs: Math.round(est.items.reduce((s, i) => s + i.carbs_g, 0)),
      fat: Math.round(est.items.reduce((s, i) => s + i.fat_g, 0)),
      approx: true,
    };
    next = appendPlanItem(ctx.plan, slot, item);
    approx = true;
  }
  const saved = await persistPlan(ctx.supabase, ctx.userId, next);
  return saved.ok ? { ok: true, plan: next, approx } : { ok: false, error: saved.error! };
}
