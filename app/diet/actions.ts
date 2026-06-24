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
  setPlanItemAmount,
  setPlanItemMacros,
  searchCatalog,
  bestCatalogMatch,
  replanRemaining,
  buildPlanFromSelectionIds,
  normalizeDietPlan,
  type DietPlan,
  type DietFilter,
  type PlanMealItem,
  type SelectedIds,
  type UsualMeals,
} from "@/lib/diet/planner";
import { generateMealSelection, type MealSelectionProfile } from "@/lib/diet/mealSelection";
import {
  buildMealCandidatePool,
  buildMealCandidateLists,
  explicitProteinPowderOptIn,
} from "@/lib/diet/mealCandidates";
import { parsePreferences, keywordPreferences } from "@/lib/coach/dietCoach";
import type { MealSlot } from "@/lib/diet/foodCatalog";
import { DIET_PLAN_POOL } from "@/lib/diet/planPool";
import { planItemToLogRow } from "@/lib/diet/planToLog";
import { rankLoggedFoods, type LoggedFoodRow } from "@/lib/diet/learned";
import { itemMacros } from "@/lib/food/quantity";
import { sumMacros } from "@/lib/food/totals";
import { getLocalToday } from "@/lib/date";
import { logEvent } from "@/lib/analytics";
import { consumeUsage, USAGE_LIMIT_MESSAGE } from "@/lib/usage";
import { reportError } from "@/lib/log";
import type {
  ActivityLevel,
  FoodLog,
  FoodPreference,
  Goal,
  Lang,
  Region,
  Sex,
  TrainingLocation,
} from "@/lib/database.types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

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
type AddResult = { ok: true; plan: DietPlan } | { ok: false; error: string };

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

// Split a free-text dislikes field ("beef, prawns") into avoid terms.
const splitTerms = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,\n;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

async function loadSavedPlan(supabase: Supa, userId: string): Promise<DietPlan | null> {
  const [{ data: row }, { data: profile }] = await Promise.all([
    supabase.from("meal_plans").select("plan").eq("user_id", userId).maybeSingle(),
    supabase
      .from("profiles")
      .select("calorie_target, protein_target_g")
      .eq("id", userId)
      .maybeSingle<{ calorie_target: number | null; protein_target_g: number | null }>(),
  ]);
  return normalizeDietPlan(row?.plan, {
    calorieTarget: profile?.calorie_target ?? null,
    proteinTargetG: profile?.protein_target_g ?? null,
  });
}

/** Load the user's saved plan (or null). */
export async function getDietPlan(): Promise<DietPlan | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return loadSavedPlan(supabase, user.id);
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

  // Rate limit: plan generation can invoke the LLM (notes parsing) and does
  // heavy pool work — cap regenerate-spamming.
  const { allowed } = await consumeUsage(supabase, "plan_generate");
  if (!allowed) return { ok: false, error: USAGE_LIMIT_MESSAGE };

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "calorie_target, protein_target_g, weight_kg, goal, activity_level, training_location, food_preference, preferred_language, region, sex, usual_breakfast, usual_lunch, usual_dinner, usual_foods, keep_foods, disliked_foods"
    )
    .eq("id", user.id)
    .single<{
      calorie_target: number | null;
      protein_target_g: number | null;
      weight_kg: number | null;
      goal: Goal | null;
      activity_level: ActivityLevel | null;
      training_location: TrainingLocation | null;
      food_preference: FoodPreference | null;
      preferred_language: Lang | null;
      region: Region | null;
      sex: Sex | null;
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
  const regionFocus: DietFilter["regionFocus"] =
    profile?.region === "pakistan" || profile?.region === "india"
      ? "desi"
      : profile?.region === "us_canada" || profile?.region === "uk_europe"
        ? "western"
        : null;
  const base = filterFromPreference(profile?.food_preference ?? null, {
    regionFocus,
    profileRegion: profile?.region ?? null,
  });

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
    const prior = (await loadSavedPlan(supabase, user.id))?.filter;
    filter = prior
      ? mergeFilters(prior, dislikes, {
          regionFocus,
          profileRegion: profile?.region ?? null,
        })
      : mergeFilters(base, dislikes);
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

  // Bias selection toward the foods the user actually logs most (learned from
  // their food log). A soft "like" nudge on top of the typed usual-eating seed.
  const preferIds = await learnedPreferIds(supabase, user.id, await getLocalToday());

  // HYBRID generation (Phase 2): Groq picks the foods (region/prefs-aware), the
  // deterministic engine grounds them in real macros and hits the targets. Stays
  // on the curated staples catalog (simple, repeatable, desi-friendly). Broad
  // USDA foods remain available to food logging, not Diet Plan operations.
  // Degrades to the pure deterministic plan whenever Groq is unavailable.
  const plan = await buildHybridPlan({
    calorieTarget,
    proteinTargetG,
    filter,
    usual,
    preferIds,
    region: profile?.region ?? null,
    sex: profile?.sex ?? null,
    weightKg: profile?.weight_kg ?? null,
    goal: profile?.goal ?? null,
    activityLevel: profile?.activity_level ?? null,
    trainingLocation: profile?.training_location ?? null,
    foodPreference: profile?.food_preference ?? null,
  });

  // A regenerate is an intentional full replace — no compare-and-swap, but it
  // stamps a fresh rev so per-item edits in stale tabs conflict afterwards.
  const { error } = await supabase
    .from("meal_plans")
    .upsert({ user_id: user.id, plan: { ...plan, rev: Date.now() } }, { onConflict: "user_id" });
  if (error) {
    reportError("generateDietPlan.upsert", error);
    return { ok: false, error: error.message };
  }

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

  const prior = await loadSavedPlan(supabase, user.id);
  if (!prior) return { ok: false, error: "Generate a plan first." };

  // Meal re-selection is generation too → curated staples only (see above),
  // biased toward the user's most-logged foods.
  const preferIds = await learnedPreferIds(supabase, user.id, await getLocalToday());
  const swapped = swapMeal(prior, slot, randomSeed(), DIET_PLAN_POOL, preferIds);

  const saved = await persistPlan(supabase, user.id, swapped, prior.rev);
  if (!saved.ok) return { ok: false, error: saved.error! };

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
  const plan = await loadSavedPlan(supabase, user.id);
  if (!plan) return { ok: false, error: "Generate a plan first." };
  return { ok: true, supabase, userId: user.id, plan };
}

/**
 * Persist a plan with optimistic concurrency: the write only lands if the
 * stored plan still carries the rev this request started from (compare-and-
 * swap on plan->>rev). A stale tab gets an honest conflict error instead of
 * silently overwriting edits made elsewhere. Plans saved before `rev` existed
 * upgrade on their first write (one unguarded update, then guarded forever).
 */
async function persistPlan(
  supabase: Supa,
  userId: string,
  plan: DietPlan,
  expectedRev: number | undefined
): Promise<{ ok: boolean; error?: string }> {
  const stamped = { ...plan, rev: Date.now() };
  let query = supabase.from("meal_plans").update({ plan: stamped }).eq("user_id", userId);
  if (expectedRev != null) query = query.filter("plan->>rev", "eq", String(expectedRev));
  const { data, error } = await query.select("user_id");
  if (error) return { ok: false, error: error.message };
  if (expectedRev != null && (data ?? []).length === 0) {
    return { ok: false, error: "Your plan changed in another tab. Refresh to see the latest, then retry." };
  }
  revalidatePath("/diet");
  return { ok: true };
}

// --- daily loop + learned foods (shared helpers) ----------------------------

/** A YYYY-MM-DD date `days` before `today` (UTC math on the local-day string). */
function daysAgoDate(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Today's logged macro totals — the authoritative "eaten so far", read from the
 * SAME food_logs source as the Home dashboard (via the pure itemMacros/sumMacros
 * helpers) so the Plan tab and Home always agree.
 */
async function consumedToday(
  supabase: Supa,
  userId: string,
  date: string
): Promise<{ calories: number; proteinG: number }> {
  const { data } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("logged_on", date)
    .returns<FoodLog[]>();
  const t = sumMacros((data ?? []).map(itemMacros));
  return { calories: t.calories, proteinG: t.protein_g };
}

/**
 * Pool food ids the user logs most over the last 14 days, mapped to planner ids.
 * A soft bias only (the planner treats them as "likes"), so it degrades to an
 * empty set on any error — generation/swaps still work, just without the nudge.
 */
async function learnedPreferIds(supabase: Supa, userId: string, today: string): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from("food_logs")
      .select("matched_food_id, food_name, logged_on")
      .eq("user_id", userId)
      .gte("logged_on", daysAgoDate(today, 14))
      .order("logged_on", { ascending: false })
      .limit(600);
    const ranked = rankLoggedFoods((data ?? []) as LoggedFoodRow[], {
      now: new Date(`${today}T12:00:00Z`),
      days: 14,
      limit: 8,
    });
    return new Set(ranked.map((r) => r.poolId));
  } catch {
    return new Set();
  }
}

/**
 * HYBRID generation (Phase 2): Groq decides WHICH foods (the "what"); the
 * deterministic engine grounds them in real catalog macros and sizes portions to
 * hit the targets (the "how much"). Falls back to the pure deterministic plan
 * when Groq is unavailable / returns nothing, or when its picks can't fill the
 * day to tolerance. The numbers shown are ALWAYS the engine's, never Groq's.
 */
async function buildHybridPlan(args: {
  calorieTarget: number;
  proteinTargetG: number;
  filter: DietFilter;
  usual: UsualMeals;
  preferIds: Set<string>;
  region: Region | null;
  sex: Sex | null;
  weightKg: number | null;
  goal: Goal | null;
  activityLevel: ActivityLevel | null;
  trainingLocation: TrainingLocation | null;
  foodPreference: FoodPreference | null;
}): Promise<DietPlan> {
  const { calorieTarget, proteinTargetG, filter, usual, preferIds } = args;
  const usualText = [usual.breakfast, usual.lunch, usual.dinner, usual.foods, usual.keep]
    .filter(Boolean)
    .join(" ");
  const allowProteinPowder = explicitProteinPowderOptIn(usualText);
  const candidateProfile = {
    filter,
    region: args.region,
    foodPreference: args.foodPreference,
    allowProteinPowder,
  };
  const plannerPool = buildMealCandidatePool(candidateProfile);
  const safePlannerPool = plannerPool.length ? plannerPool : DIET_PLAN_POOL;
  const deterministic = () =>
    buildPlan({
      calorieTarget,
      proteinTargetG,
      filter,
      usual,
      seed: randomSeed(),
      preferIds,
      pool: safePlannerPool,
      allowProteinPowder,
    });

  const candidates = buildMealCandidateLists(candidateProfile, safePlannerPool);
  const mealProfile: MealSelectionProfile = {
    calorieTarget,
    proteinTargetG,
    weightKg: args.weightKg,
    goal: args.goal,
    sex: args.sex,
    region: args.region,
    foodPreference: args.foodPreference,
    activityLevel: args.activityLevel,
    trainingLocation: args.trainingLocation,
    vegetarian: filter.vegetarian,
    excludeTags: filter.excludeTags,
    excludeFoods: filter.excludeFoods,
    allowProteinPowder,
    usualMeals: usual,
    candidates,
  };

  const selection = await generateMealSelection(mealProfile);
  if (!selection) return deterministic(); // Groq off/failed → deterministic fallback

  const ids: SelectedIds = {
    breakfast: selection.breakfast.map((food) => food.id),
    lunch: selection.lunch.map((food) => food.id),
    dinner: selection.dinner.map((food) => food.id),
    snack: selection.snack.map((food) => food.id),
  };
  const hybrid = buildPlanFromSelectionIds(ids, {
    calorieTarget,
    proteinTargetG,
    filter,
    usual,
    seed: randomSeed(),
    preferIds,
    pool: safePlannerPool,
    allowProteinPowder,
  });
  // Safety net: if Groq's foods couldn't fill the day to tolerance, prefer the
  // pure deterministic plan (proven to hit ±5% on the full catalog).
  return hybrid.caloriesShort || hybrid.proteinShort ? deterministic() : hybrid;
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
  if (error) {
    reportError("logPlanMeal.insert", error, { slot, items: rows.length });
    return { ok: false, error: error.message };
  }

  // Mark this meal as logged TODAY so the Plan tab can show it done and FREEZE it
  // when refitting the rest of the day. Best-effort: the food is already logged,
  // so a concurrency conflict here must never fail the action (revalidates /diet).
  const prevLogged = ctx.plan.logged;
  const slots = prevLogged?.date === date ? [...new Set([...prevLogged.slots, slot])] : [slot];
  await persistPlan(ctx.supabase, ctx.userId, { ...ctx.plan, logged: { date, slots } }, ctx.plan.rev);

  await logEvent(ctx.supabase, ctx.userId, "food_logged", { items: rows.length, method: "plan_meal", slot });
  revalidatePath("/dashboard");
  return { ok: true, count: rows.length };
}

/**
 * "Fit to what's left" — rebuild only the meals the user hasn't logged yet so
 * they fit today's REMAINING calories/protein (target − eaten, read from the
 * food log). Meals already logged today are frozen. Deterministic + pure under
 * the hood (`replanRemaining`); this action just gathers the live inputs.
 */
export async function fitRemainingDay(): Promise<PlanResult> {
  const ctx = await planContext();
  if (!ctx.ok) return ctx;

  const today = await getLocalToday();
  // Only a FRESH logged record (today) freezes meals; yesterday's is stale.
  const eatenSlots = ctx.plan.logged?.date === today ? ctx.plan.logged.slots : [];
  const consumed = await consumedToday(ctx.supabase, ctx.userId, today);
  const remaining = {
    calories: ctx.plan.calorieTarget - consumed.calories,
    proteinG: ctx.plan.proteinTargetG - consumed.proteinG,
  };
  const preferIds = await learnedPreferIds(ctx.supabase, ctx.userId, today);

  // Generation-like → curated staples only (matches generateDietPlan/swapDietMeal).
  const next = replanRemaining(ctx.plan, remaining, eatenSlots, DIET_PLAN_POOL, randomSeed(), preferIds);
  if (next === ctx.plan) {
    return { ok: false, error: "Nothing left to adjust — you've hit today's target." };
  }
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
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
  const preferIds = await learnedPreferIds(ctx.supabase, ctx.userId, await getLocalToday());
  const next = swapPlanItem(ctx.plan, slot, index, randomSeed(), DIET_PLAN_POOL, preferIds);
  if (next === ctx.plan) return { ok: false, error: "No other option fits this slot." };
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Remove a single food item from a meal. */
export async function removeDietItem(slot: MealSlot, index: number): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = removePlanItem(ctx.plan, slot, index);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Restore a just-removed item, preserving any other plan edits made since. */
export async function restoreDietItem(slot: MealSlot, index: number, item: PlanMealItem): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  if (!isRestorablePlanItem(item)) return { ok: false, error: "Couldn't restore that food." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = insertPlanItem(ctx.plan, slot, index, item);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Add a catalog food (chosen from the picker) to a meal. */
export async function addDietItem(slot: MealSlot, foodId: string): Promise<PlanResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const next = addPlanItem(ctx.plan, slot, foodId, DIET_PLAN_POOL);
  if (next === ctx.plan) return { ok: false, error: "Couldn't add that food." };
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
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
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
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
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}

/** Searchable food list for the per-meal "add food" control (respects avoids). */
export async function searchDietFoods(slot: MealSlot, query: string): Promise<SearchResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;
  const foods: FoodOption[] = searchCatalog(query, ctx.plan.filter, slot, DIET_PLAN_POOL).map((f) => ({
    id: f.id,
    name: f.name,
    portion: f.portion,
    calories: f.calories,
    protein: f.protein,
  }));
  return { ok: true, foods };
}

/** Add typed input only when it resolves to a curated Diet Plan food. */
export async function addCustomDietItem(slot: MealSlot, text: string): Promise<AddResult> {
  if (!SLOTS.includes(slot)) return { ok: false, error: "Unknown meal." };
  const q = text.trim();
  if (q.length < 2) return { ok: false, error: "Type a food first." };
  const ctx = await planContext();
  if (!ctx.ok) return ctx;

  const match = bestCatalogMatch(q, ctx.plan.filter, slot, DIET_PLAN_POOL);
  if (!match) {
    return {
      ok: false,
      error: "That food is not available in Diet Plans yet. Pick a listed food or report it as missing.",
    };
  }
  const next = addPlanItem(ctx.plan, slot, match.id, DIET_PLAN_POOL);
  const saved = await persistPlan(ctx.supabase, ctx.userId, next, ctx.plan.rev);
  return saved.ok ? { ok: true, plan: next } : { ok: false, error: saved.error! };
}
