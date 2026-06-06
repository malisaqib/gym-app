import type { OnboardingEntry } from "@/lib/database.types";

/**
 * Pull the free-text "any foods you avoid / injuries" answer out of the saved
 * onboarding transcript, so features (e.g. the diet planner) can reuse it
 * instead of making the user repeat themselves.
 */
export function extractOnboardingNote(raw: OnboardingEntry[] | null | undefined): string {
  if (!Array.isArray(raw)) return "";
  const entry = raw.find((e) => e.key === "notes");
  return entry && typeof entry.message === "string" ? entry.message : "";
}
