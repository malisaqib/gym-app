// Hand-written types mirroring the tables in supabase/migrations/0001_init.sql.
//
// These document the database shape so our queries can be typed in later phases.
// They are maintained by hand for now; if/when we adopt the Supabase CLI we can
// auto-generate a fuller typed `Database` with `supabase gen types`.
//
// Convention: keep these in sync whenever you change the SQL migration.

export type Goal = "lose_fat" | "maintain" | "gain_muscle";
export type Sex = "male" | "female";
export type Experience = "beginner" | "intermediate" | "advanced";
export type FoodLogSource = "llm" | "manual" | "corrected";
export type Lang = "en" | "roman_urdu";

// Relatable onboarding (Phase 8)
export type RelatableGoalKey =
  | "wedding_event"
  | "shirt_look"
  | "belly_fat"
  | "skinny_bulk"
  | "sports"
  | "general"
  | "gym_start";
export type Timeline = "no_deadline" | "4_weeks" | "8_weeks" | "12_weeks";
export type TrainingLocation = "home" | "gym" | "both";
export type FoodPreference =
  | "normal_desi"
  | "high_protein"
  | "budget"
  | "hostel_student"
  | "veg_limited";

// One answered onboarding step: the structured value we keep AND the original
// message the user gave (button label tapped or text typed), plus the language.
export interface OnboardingEntry {
  key: string;
  value: string | number;
  message: string;
  lang: Lang;
}

// public.profiles — one row per user
export interface Profile {
  id: string; // = auth user id
  full_name: string | null;
  goal: Goal | null;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  training_days: number | null;
  experience: Experience | null;
  calorie_target: number | null;
  protein_target_g: number | null;
  preferred_language: Lang;
  relatable_goal: RelatableGoalKey | null;
  timeline: Timeline | null;
  training_location: TrainingLocation | null;
  food_preference: FoodPreference | null;
  onboarding_raw: OnboardingEntry[] | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

// public.food_logs — one row per logged food item
export interface FoodLog {
  id: string;
  user_id: string;
  logged_on: string; // date (YYYY-MM-DD)
  raw_text: string | null;
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodLogSource;
  created_at: string;
}

// public.workouts — a named workout (A/B split); refined in Phase 5
export interface Workout {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

// public.workout_logs — performed sets/reps; refined in Phase 5
export interface WorkoutLog {
  id: string;
  user_id: string;
  workout_id: string | null;
  exercise_name: string;
  performed_on: string; // date (YYYY-MM-DD)
  set_number: number | null;
  reps: number | null;
  weight_kg: number | null;
  created_at: string;
}

// public.bodyweight_logs — weight over time
export interface BodyweightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_on: string; // date (YYYY-MM-DD)
  created_at: string;
}
