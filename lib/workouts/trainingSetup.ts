import type { Goal } from "@/lib/database.types";
import type { FocusArea, WorkoutGoal } from "./coachPlan";

/**
 * Workout rebuild — Phase 2: the user's training setup.
 *
 * Pure types + helpers (no React, no server code) so the client card, the
 * server action, and the Phase 3 generator can all share them. The setup is the
 * INPUT to the deterministic generator; nothing here is AI-driven.
 *
 * Persistence: the profile is the source of truth — saved as `training_setup`
 * jsonb (migration 0013) and read DB-first so it syncs across devices.
 * localStorage (key below) is a fast cache + offline fallback, and a legacy
 * device-only setup is migrated into the account once on first load.
 */

export type TrainingLocation = "gym" | "home" | "both";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TrainingEmphasis = "fatLoss" | "muscleGain" | "strength" | "general";

// User-facing equipment options (home/both). Mapped to dataset equipment values
// by the Phase 3 generator — kept as our own keys so the UI stays friendly.
export type EquipmentItem =
  | "dumbbells"
  | "bands"
  | "pullup_bar"
  | "kettlebell"
  | "barbell_rack"
  | "bench"
  | "machines";

export const EQUIPMENT_OPTIONS: { value: EquipmentItem; label: string }[] = [
  { value: "dumbbells", label: "Dumbbells" },
  { value: "bands", label: "Resistance bands" },
  { value: "pullup_bar", label: "Pull-up bar" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "barbell_rack", label: "Barbell + rack" },
  { value: "bench", label: "Bench" },
  { value: "machines", label: "Machines" },
];

const EQUIPMENT_VALUES = EQUIPMENT_OPTIONS.map((o) => o.value);

export interface TrainingSetup {
  trainingLocation: TrainingLocation;
  hasEquipment: boolean; // relevant for home/both; gym implies full equipment
  equipment: EquipmentItem[]; // selected items (home/both + hasEquipment)
  experienceLevel: ExperienceLevel;
  trainingDaysPerWeek: number; // clamped 2–6
  injuriesNote: string; // optional free text
  focusArea: FocusArea; // optional emphasis region — defaults to full body
  goal: WorkoutGoal | null; // workout goal for this plan; null = derive from profile
  updatedAt: string; // ISO; "" means not set up yet
}

export const TRAINING_SETUP_KEY = "gymCoach.trainingSetup";

export const MIN_DAYS = 2;
export const MAX_DAYS = 6;

export const DEFAULT_TRAINING_SETUP: TrainingSetup = {
  trainingLocation: "home",
  hasEquipment: false,
  equipment: [],
  experienceLevel: "beginner",
  trainingDaysPerWeek: 3,
  injuriesNote: "",
  focusArea: "full_body",
  goal: null,
  updatedAt: "",
};

// Map the practical onboarding goal to a training emphasis. We deliberately
// REUSE the goal rather than ask again. ("strength" isn't produced from goal
// today, but the type allows it for future explicit selection.)
export function goalToEmphasis(goal: Goal | null | undefined): TrainingEmphasis {
  if (goal === "lose_fat") return "fatLoss";
  if (goal === "gain_muscle") return "muscleGain";
  return "general"; // maintain / unknown
}

const LOCATIONS: TrainingLocation[] = ["gym", "home", "both"];
const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const FOCUS_AREAS: FocusArea[] = ["full_body", "lower_body", "glutes", "upper_body"];
const WORKOUT_GOALS: WorkoutGoal[] = [
  "lose_belly_fat",
  "lose_weight",
  "gain_muscle",
  "gain_weight",
  "build_strength",
  "tone",
  "stay_fit",
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Defensive normaliser used before saving (never trust client input) and when
 * reading a possibly-stale localStorage/profile shape.
 */
export function normalizeTrainingSetup(raw: Partial<TrainingSetup>): TrainingSetup {
  const trainingLocation = LOCATIONS.includes(raw.trainingLocation as TrainingLocation)
    ? (raw.trainingLocation as TrainingLocation)
    : "home";
  const experienceLevel = LEVELS.includes(raw.experienceLevel as ExperienceLevel)
    ? (raw.experienceLevel as ExperienceLevel)
    : "beginner";

  const daysRaw = Math.round(Number(raw.trainingDaysPerWeek ?? DEFAULT_TRAINING_SETUP.trainingDaysPerWeek));
  const trainingDaysPerWeek = clamp(Number.isFinite(daysRaw) ? daysRaw : 3, MIN_DAYS, MAX_DAYS);

  // gym ⇒ full equipment assumed; home/both ⇒ honour the toggle.
  const hasEquipment = trainingLocation === "gym" ? true : Boolean(raw.hasEquipment);

  const equipment =
    trainingLocation !== "gym" && hasEquipment
      ? (raw.equipment ?? []).filter((e): e is EquipmentItem => EQUIPMENT_VALUES.includes(e as EquipmentItem))
      : [];

  const injuriesNote = typeof raw.injuriesNote === "string" ? raw.injuriesNote.trim().slice(0, 500) : "";
  const focusArea = FOCUS_AREAS.includes(raw.focusArea as FocusArea) ? (raw.focusArea as FocusArea) : "full_body";
  const goal = WORKOUT_GOALS.includes(raw.goal as WorkoutGoal) ? (raw.goal as WorkoutGoal) : null;

  return {
    trainingLocation,
    hasEquipment,
    equipment,
    experienceLevel,
    trainingDaysPerWeek,
    injuriesNote,
    focusArea,
    goal,
    updatedAt: raw.updatedAt || "",
  };
}

export function isTrainingConfigured(setup: TrainingSetup): boolean {
  return Boolean(setup.updatedAt);
}

// Profile fields we can pre-fill the form from (collected during onboarding).
export interface ProfileTrainingDefaults {
  trainingLocation: string | null;
  experience: string | null;
  trainingDays: number | null;
}

// Seed an unconfigured setup from the profile so the form starts pre-filled.
export function setupFromProfileDefaults(p: ProfileTrainingDefaults): TrainingSetup {
  return normalizeTrainingSetup({
    trainingLocation: (p.trainingLocation as TrainingLocation) ?? undefined,
    experienceLevel: (p.experience as ExperienceLevel) ?? undefined,
    trainingDaysPerWeek: p.trainingDays ?? undefined,
    updatedAt: "",
  });
}
