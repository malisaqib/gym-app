/**
 * Phase 5 — Bodyweight beginner A/B split + exercise library.
 *
 * Static program data (like the curated food table). No equipment assumed.
 * Progression is by REPS, then by graduating to a harder variation (`harder`)
 * once you can hit the top of the rep range on every set.
 *
 * Form links are YouTube SEARCH URLs (not specific video IDs) so they never go
 * dead and always surface current, relevant tutorials.
 */

export type WorkoutDay = "A" | "B";
export type RepUnit = "reps" | "seconds";

export interface Exercise {
  key: string; // stable id, also used as the stored exercise name's source
  name: string;
  muscle: string;
  sets: number;
  repMin: number;
  repMax: number;
  repUnit: RepUnit;
  perSide?: boolean; // true if reps are counted per leg/arm
  harder: string; // how to make it harder once you max the rep range
  youtube: string; // form-tutorial search link
}

export interface Workout {
  day: WorkoutDay;
  title: string;
  exercises: Exercise[];
}

// Build a YouTube search link for an exercise's proper form.
const yt = (q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} proper form`)}`;

const WORKOUT_A: Workout = {
  day: "A",
  title: "Workout A · Push & Legs",
  exercises: [
    { key: "pushup", name: "Push-ups", muscle: "Chest & triceps", sets: 3, repMin: 8, repMax: 15, repUnit: "reps", harder: "feet-elevated or diamond push-ups", youtube: yt("push up beginner") },
    { key: "squat", name: "Bodyweight squats", muscle: "Quads & glutes", sets: 3, repMin: 12, repMax: 20, repUnit: "reps", harder: "split squats, then Bulgarian split squats", youtube: yt("bodyweight squat") },
    { key: "glute_bridge", name: "Glute bridge", muscle: "Glutes & hamstrings", sets: 3, repMin: 12, repMax: 20, repUnit: "reps", harder: "single-leg glute bridge", youtube: yt("glute bridge") },
    { key: "pike_pushup", name: "Pike push-ups", muscle: "Shoulders", sets: 3, repMin: 6, repMax: 12, repUnit: "reps", harder: "feet-elevated pike, then wall handstand push-ups", youtube: yt("pike push up") },
    { key: "plank", name: "Plank", muscle: "Core", sets: 3, repMin: 20, repMax: 45, repUnit: "seconds", harder: "longer holds, then RKC plank", youtube: yt("plank hold") },
  ],
};

const WORKOUT_B: Workout = {
  day: "B",
  title: "Workout B · Pull & Legs",
  exercises: [
    { key: "inverted_row", name: "Inverted rows (under a sturdy table)", muscle: "Back & biceps", sets: 3, repMin: 8, repMax: 15, repUnit: "reps", harder: "feet-elevated or a lower table", youtube: yt("inverted row under table") },
    { key: "reverse_lunge", name: "Reverse lunges", muscle: "Quads & glutes", sets: 3, repMin: 10, repMax: 16, repUnit: "reps", perSide: true, harder: "walking lunges, then jumping lunges", youtube: yt("reverse lunge") },
    { key: "superman", name: "Superman", muscle: "Lower back", sets: 3, repMin: 10, repMax: 15, repUnit: "reps", harder: "pause 2s at the top", youtube: yt("superman exercise lower back") },
    { key: "leg_raise", name: "Lying leg raises", muscle: "Abs", sets: 3, repMin: 10, repMax: 15, repUnit: "reps", harder: "slower tempo, then hanging leg raises", youtube: yt("lying leg raise") },
    { key: "calf_raise", name: "Calf raises", muscle: "Calves", sets: 3, repMin: 15, repMax: 25, repUnit: "reps", harder: "single-leg calf raises", youtube: yt("calf raise") },
  ],
};

export const WORKOUTS: Record<WorkoutDay, Workout> = { A: WORKOUT_A, B: WORKOUT_B };

// Every exercise name across both days — handy for fetching history in one go.
export const ALL_EXERCISE_NAMES: string[] = [
  ...WORKOUT_A.exercises,
  ...WORKOUT_B.exercises,
].map((e) => e.name);
