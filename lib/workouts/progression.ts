/**
 * Phase 5 — Bodyweight progression rule (pure, testable).
 *
 * Double progression without weights: keep adding reps until you hit the top of
 * the rep range on every set, then graduate to a harder variation.
 */

export interface SetReps {
  reps: number;
}

export interface ProgressionTarget {
  sets: number;
  repMax: number;
  repUnit: "reps" | "seconds";
  harder: string; // the next, harder variation
}

export interface ProgressionAdvice {
  message: string;
  graduate: boolean; // true => time to move to the harder variation
}

/**
 * Suggest what to aim for, based on the LAST session's sets for this exercise.
 */
export function suggestProgression(
  lastSets: SetReps[],
  target: ProgressionTarget
): ProgressionAdvice {
  const unit = target.repUnit === "seconds" ? "sec" : "reps";

  if (lastSets.length === 0) {
    return {
      graduate: false,
      message: `First time — aim for up to ${target.repMax} ${unit} per set with clean form.`,
    };
  }

  // Graduate only if they did all the sets AND hit the top of the range on each.
  const hitAll =
    lastSets.length >= target.sets &&
    lastSets.every((s) => s.reps >= target.repMax);

  if (hitAll) {
    return {
      graduate: true,
      message: `You hit ${target.repMax} ${unit} on every set last time — level up: ${target.harder}.`,
    };
  }

  return {
    graduate: false,
    message: `Last session logged — aim for ${target.repMax} ${unit} on all ${target.sets} sets.`,
  };
}
