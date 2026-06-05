"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recomputePlan, type AdaptProfile, type AdjustmentKind } from "@/lib/nutrition/adapt";
import { targetDateFrom, type GoalDirection } from "@/lib/nutrition/goalPlan";
import { getLocalToday } from "@/lib/date";
import { phrasePlateauNudge } from "@/lib/coach/adaptCoach";
import type { BodyweightLog, Lang } from "@/lib/database.types";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Adaptive recalculation: after a weigh-in (or delete) recompute the daily
 * targets from the NEW current weight, reusing the stored goal/activity/pace.
 * Deterministic (lib/nutrition) — no AI. Best-effort: never blocks the weigh-in.
 */
async function recomputeTargetsForUser(supabase: SupabaseServer, userId: string): Promise<void> {
  const { data: p } = await supabase
    .from("profiles")
    .select("onboarded, sex, age, height_cm, goal_weight_kg, activity_level, weekly_pace_kg")
    .eq("id", userId)
    .single();
  if (!p?.onboarded) return;

  // "Current" weight = the most recent weigh-in (by date, then insert order).
  const { data: rows } = await supabase
    .from("bodyweight_logs")
    .select("weight_kg")
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const w = rows?.[0]?.weight_kg;
  if (w == null) return;

  const adapt: AdaptProfile = {
    sex: p.sex,
    age: p.age,
    heightCm: p.height_cm,
    goalWeightKg: p.goal_weight_kg,
    activityLevel: p.activity_level,
    weeklyPaceKg: p.weekly_pace_kg,
  };
  const plan = recomputePlan(adapt, w);
  if (!plan) return;

  const today = await getLocalToday();
  await supabase
    .from("profiles")
    .update({
      weight_kg: w, // keep the profile's "current weight" in sync
      goal: plan.goal,
      weekly_pace_kg: plan.weeklyPaceKg,
      target_date: targetDateFrom(today, plan.weeksToGoal),
      calorie_target: plan.calorieTarget,
      protein_target_g: plan.proteinTargetG,
      carb_target_g: plan.carbTargetG,
      fat_target_g: plan.fatTargetG,
    })
    .eq("id", userId);

  // Screens that read targets — refresh their cached renders.
  revalidatePath("/dashboard");
  revalidatePath("/weight");
}

/** All of the user's weight logs, oldest first. */
export async function getWeightLogs(): Promise<BodyweightLog[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("bodyweight_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("logged_on", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<BodyweightLog[]>();

  return data ?? [];
}

type LogResult = { ok: true; item: BodyweightLog } | { ok: false; error: string };

/** Log a bodyweight entry for a day (the client passes its local date). */
export async function logWeight(input: { weight: number; date: string }): Promise<LogResult> {
  const weight = Math.round(Number(input.weight) * 10) / 10; // one decimal
  if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
    return { ok: false, error: "Enter a weight between 30 and 300 kg." };
  }
  if (!isDate(input.date)) return { ok: false, error: "Invalid date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("bodyweight_logs")
    .insert({ user_id: user.id, weight_kg: weight, logged_on: input.date })
    .select()
    .single<BodyweightLog>();

  if (error) return { ok: false, error: error.message };

  // Targets adapt to the new weight (best-effort; never block the log).
  await recomputeTargetsForUser(supabase, user.id);
  return { ok: true, item: data };
}

/** Delete a weight entry. */
export async function deleteWeight(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("bodyweight_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  // The "current" weight may have changed — recompute from what remains.
  await recomputeTargetsForUser(supabase, user.id);
  return { ok: true };
}

/**
 * Phrase a plateau nudge supportively (AI). The plateau + adjustment are decided
 * deterministically on the server page; this only makes the message warmer.
 * Returns "" on any failure so the client keeps its deterministic default.
 */
export async function phraseProgressNudge(input: {
  direction: GoalDirection;
  kind: AdjustmentKind;
  weeklyRateKg: number;
  lang: Lang;
}): Promise<{ text: string }> {
  try {
    return { text: await phrasePlateauNudge(input) };
  } catch {
    return { text: "" };
  }
}
