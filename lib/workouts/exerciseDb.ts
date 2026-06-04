/**
 * Phase 1 — Exercise database (vendored free-exercise-db).
 *
 * Source: github.com/yuhonas/free-exercise-db (Unlicense / public domain),
 * vendored as data/exercises.json (873 exercises) so we never depend on a live
 * API. This file is PURE: types + a single list-first query helper. The dataset
 * itself is loaded in exerciseCatalog.ts. Keeping the filter pure makes it
 * trivially testable and reusable by the deterministic program generator
 * (Phase 3) — the generator selects from here; the AI never invents exercises.
 */

export type Force = "push" | "pull" | "static";
export type Level = "beginner" | "intermediate" | "expert";
export type Mechanic = "compound" | "isolation";

// Equipment values exactly as they appear in the dataset.
export type Equipment =
  | "body only"
  | "dumbbell"
  | "barbell"
  | "kettlebells"
  | "cable"
  | "machine"
  | "bands"
  | "medicine ball"
  | "exercise ball"
  | "foam roll"
  | "e-z curl bar"
  | "other";

export type MuscleGroup =
  | "abdominals"
  | "abductors"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "forearms"
  | "glutes"
  | "hamstrings"
  | "lats"
  | "lower back"
  | "middle back"
  | "neck"
  | "quadriceps"
  | "shoulders"
  | "traps"
  | "triceps";

export type Category =
  | "cardio"
  | "olympic weightlifting"
  | "plyometrics"
  | "powerlifting"
  | "strength"
  | "stretching"
  | "strongman";

export interface Exercise {
  id: string;
  name: string;
  force: Force | null;
  level: Level;
  mechanic: Mechanic | null;
  equipment: Equipment | null;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  instructions: string[];
  category: Category;
  images: string[];
}

export interface ExerciseFilter {
  equipment?: Equipment[]; // allowed equipment; undefined = any
  level?: Level | Level[]; // one or more levels
  muscleGroups?: MuscleGroup[]; // keep exercises hitting at least one of these
  mechanic?: Mechanic; // compound / isolation
  category?: Category | Category[]; // e.g. "strength"
  includeSecondaryMuscles?: boolean; // also match on secondary muscles (default false)
}

// What "no equipment" means when selecting exercises.
export const BODYWEIGHT_ONLY: Equipment[] = ["body only"];

function toArray<T>(v: T | T[] | undefined): T[] | null {
  if (v === undefined) return null;
  return Array.isArray(v) ? v : [v];
}

/**
 * Pure: keep only exercises matching EVERY provided criterion. Omitted criteria
 * are ignored (so {} returns the whole list). Equipment is an allow-list — an
 * exercise survives only if its single required equipment is in the set, which
 * is exactly what we want for "what can this user actually do?".
 */
export function filterExercises(list: Exercise[], filter: ExerciseFilter = {}): Exercise[] {
  const levels = toArray(filter.level);
  const categories = toArray(filter.category);
  const equipment = filter.equipment ? new Set(filter.equipment) : null;
  const muscles = filter.muscleGroups?.length ? new Set(filter.muscleGroups) : null;

  return list.filter((ex) => {
    if (levels && !levels.includes(ex.level)) return false;
    if (filter.mechanic && ex.mechanic !== filter.mechanic) return false;
    if (categories && !categories.includes(ex.category)) return false;
    if (equipment && (ex.equipment === null || !equipment.has(ex.equipment))) return false;
    if (muscles) {
      const pool = filter.includeSecondaryMuscles
        ? [...ex.primaryMuscles, ...ex.secondaryMuscles]
        : ex.primaryMuscles;
      if (!pool.some((m) => muscles.has(m))) return false;
    }
    return true;
  });
}
