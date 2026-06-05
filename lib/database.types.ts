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
// Honest whole-day activity level — drives the calorie engine's activity factor.
// (Stored on profiles as an additive column from Phase 2 onward.)
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extra";
export type FoodLogSource = "llm" | "manual" | "corrected";
export type Lang = "en" | "roman_urdu";

// RAG food knowledge base (see supabase/migrations/0005_foods_rag.sql).
export type FoodRegion = "desi" | "western" | "global";

// One row of the shared, read-only food catalog. We omit the raw `embedding`
// vector here — it's only used inside the DB for similarity search.
export interface Food {
  id: string;
  name: string;
  aliases: string[];
  search_text: string | null;
  region: FoodRegion;
  portion: string;
  portion_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  source_id: string | null;
  created_at: string;
}

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
  // Target-weight goal setting (migration 0009) — all additive / nullable.
  activity_level: ActivityLevel | null;
  goal_weight_kg: number | null;
  weekly_pace_kg: number | null; // signed (loss negative)
  target_date: string | null; // date (YYYY-MM-DD)
  carb_target_g: number | null;
  fat_target_g: number | null;
  preferred_language: Lang;
  relatable_goal: RelatableGoalKey | null;
  timeline: Timeline | null;
  training_location: TrainingLocation | null;
  food_preference: FoodPreference | null;
  onboarding_raw: OnboardingEntry[] | null;
  onboarded: boolean;
  // Workout rebuild Phase 2 (migration 0008) — all nullable / additive.
  has_equipment: boolean | null;
  equipment: string[] | null;
  session_minutes: number | null;
  injuries_note: string | null;
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
