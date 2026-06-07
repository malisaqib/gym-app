"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeTrainingSetup, type TrainingSetup } from "@/lib/workouts/trainingSetup";

/**
 * Read the user's training setup from their profile (jsonb column, migration
 * 0013). Returns null when not signed in, not configured, or the column doesn't
 * exist yet (pre-migration) — the caller then falls back to localStorage.
 */
export async function loadTrainingSetup(): Promise<TrainingSetup | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("training_setup")
    .eq("id", user.id)
    .single<{ training_setup: TrainingSetup | null }>();

  return data?.training_setup ? normalizeTrainingSetup(data.training_setup) : null;
}

/**
 * Persist the training setup into the user's profile. The whole normalized
 * setup goes into the `training_setup` jsonb (migration 0013) — that's the
 * cross-device source of truth we read back. We also keep mirroring the reused
 * onboarding columns + the 0008 columns so anything querying them stays current.
 *
 * BEST-EFFORT: the client already saved to localStorage, so if the migration
 * hasn't been applied yet (column missing) we just report it and the feature
 * still works locally.
 */
export async function saveTrainingSetup(raw: TrainingSetup): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const s = normalizeTrainingSetup(raw);

  const { error } = await supabase
    .from("profiles")
    .update({
      // The full setup — this is what we read back (cross-device source of truth).
      training_setup: s,
      // Reuse existing onboarding columns…
      training_location: s.trainingLocation,
      experience: s.experienceLevel,
      training_days: s.trainingDaysPerWeek,
      // …plus the 0008 columns (kept current for any direct queries).
      has_equipment: s.hasEquipment,
      equipment: s.equipment,
      session_minutes: s.sessionMinutes,
      injuries_note: s.injuriesNote || null,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
