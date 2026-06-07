"use server";

import { createClient } from "@/lib/supabase/server";
import type { BudgetProfile, EmotionalGoalProfile, WeeklyCheckInEntry } from "./localCoachTypes";

/**
 * Server actions for the coach prefs that used to live in localStorage
 * (motivation goal, budget, weekly check-ins). They're stored as jsonb on the
 * user's own `profiles` row, so they're RLS-scoped (no cross-user access) and
 * sync across devices. Pure data — no AI. Reads return null/[] when not set.
 */

type SaveResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

// --- motivation / emotional goal -------------------------------------------

export async function loadEmotionalGoal(): Promise<EmotionalGoalProfile | null> {
  const { supabase, userId } = await authed();
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("emotional_goal")
    .eq("id", userId)
    .single<{ emotional_goal: EmotionalGoalProfile | null }>();
  return data?.emotional_goal ?? null;
}

export async function saveEmotionalGoal(goal: EmotionalGoalProfile): Promise<SaveResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("profiles").update({ emotional_goal: goal }).eq("id", userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// --- budget ----------------------------------------------------------------

export async function loadBudget(): Promise<BudgetProfile | null> {
  const { supabase, userId } = await authed();
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("budget_profile")
    .eq("id", userId)
    .single<{ budget_profile: BudgetProfile | null }>();
  return data?.budget_profile ?? null;
}

export async function saveBudget(profile: BudgetProfile): Promise<SaveResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("profiles").update({ budget_profile: profile }).eq("id", userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// --- weekly check-ins (array) ----------------------------------------------

export async function loadCheckIns(): Promise<WeeklyCheckInEntry[]> {
  const { supabase, userId } = await authed();
  if (!userId) return [];
  const { data } = await supabase
    .from("profiles")
    .select("check_ins")
    .eq("id", userId)
    .single<{ check_ins: WeeklyCheckInEntry[] | null }>();
  return Array.isArray(data?.check_ins) ? data!.check_ins : [];
}

export async function saveCheckIns(entries: WeeklyCheckInEntry[]): Promise<SaveResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("profiles").update({ check_ins: entries }).eq("id", userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
