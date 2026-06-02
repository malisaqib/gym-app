"use server";

import { createClient } from "@/lib/supabase/server";
import type { BodyweightLog } from "@/lib/database.types";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

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
  return { ok: true };
}
