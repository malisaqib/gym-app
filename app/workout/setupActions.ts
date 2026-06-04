"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeTrainingSetup, type TrainingSetup } from "@/lib/workouts/trainingSetup";

/**
 * Persist the training setup into the user's profile (additive columns from
 * migration 0008). This is BEST-EFFORT: the client already saved to
 * localStorage, so if the migration hasn't been applied yet (columns missing)
 * we just report it and the feature still works locally.
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
      // Reuse existing onboarding columns…
      training_location: s.trainingLocation,
      experience: s.experienceLevel,
      training_days: s.trainingDaysPerWeek,
      // …plus the new additive ones.
      has_equipment: s.hasEquipment,
      equipment: s.equipment,
      session_minutes: s.sessionMinutes,
      injuries_note: s.injuriesNote || null,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
