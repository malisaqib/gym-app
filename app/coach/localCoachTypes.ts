// Phase 2 — motivation/emotional goal.
// Shape kept simple + flat so it's trivial to migrate to a Supabase column later.
// Persisted in localStorage under "gymCoach.emotionalGoal".
export interface EmotionalGoalProfile {
  selectedPreset: string; // preset key, or "" when only a custom goal is set
  customGoal: string; // free-text reason in the user's own words
  createdAt: string; // ISO timestamp of first save
  updatedAt: string; // ISO timestamp of latest save
}

export interface WeeklyCheckInEntry {
  id: string;
  date: string;
  weight: number | null;
  workoutsCompleted: number;
  dietConsistency: number;
  energyLevel: number;
  sleepQuality: number;
  biggestStruggle: string;
  coachFeedback: string;
}

export const DEFAULT_EMOTIONAL_GOAL: EmotionalGoalProfile = {
  selectedPreset: "",
  customGoal: "",
  createdAt: "",
  updatedAt: "",
};

export const EMOTIONAL_GOAL_OPTIONS = [
  { key: "wedding_event", label: "Wedding/Event" },
  { key: "university_glow_up", label: "University glow-up" },
  { key: "shirt_look", label: "Look good in shirts" },
  { key: "confidence", label: "Build confidence" },
  { key: "summer_fat_loss", label: "Fat loss before summer" },
  { key: "sports_performance", label: "Cricket/football performance" },
  { key: "stop_lazy", label: "Stop feeling lazy" },
  { key: "posture", label: "Improve posture" },
  { key: "build_muscle", label: "Build muscle" },
  { key: "custom", label: "Custom goal" },
] as const;

export function getGoalText(goal: EmotionalGoalProfile): string {
  const custom = goal.customGoal.trim();
  if (custom) return custom;
  return EMOTIONAL_GOAL_OPTIONS.find((option) => option.key === goal.selectedPreset)?.label ?? "";
}

// True once the user has set either a preset or a custom goal.
export function hasEmotionalGoal(goal: EmotionalGoalProfile): boolean {
  return Boolean(goal.selectedPreset || goal.customGoal.trim());
}
