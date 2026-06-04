import exercisesJson from "@/data/exercises.json";
import { filterExercises, type Exercise, type ExerciseFilter } from "./exerciseDb";

/**
 * The vendored exercise dataset, typed for the app. Server-side use (and the
 * Phase 3 generator) import from here. The cast goes through `unknown` because
 * the JSON's inferred literal type is looser than our unions (e.g. force is a
 * plain string in the file).
 */
export const ALL_EXERCISES = exercisesJson as unknown as Exercise[];

// Convenience: filter the full catalog in one call.
export function queryExercises(filter: ExerciseFilter): Exercise[] {
  return filterExercises(ALL_EXERCISES, filter);
}
