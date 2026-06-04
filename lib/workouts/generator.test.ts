import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateProgram, swapProgramExercise } from "./generator.ts";
import { normalizeTrainingSetup, type TrainingSetup } from "./trainingSetup.ts";
import type { Exercise } from "./exerciseDb.ts";

// Load the real vendored dataset (same approach as exerciseDb.test.ts) so the
// generator is exercised against the actual 873-exercise catalog.
const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, "..", "..", "data", "exercises.json");
const ALL = JSON.parse(readFileSync(dataPath, "utf8")) as Exercise[];
const BY_ID = new Map(ALL.map((e) => [e.id, e]));

function setup(overrides: Partial<TrainingSetup>): TrainingSetup {
  return normalizeTrainingSetup({ updatedAt: new Date().toISOString(), ...overrides });
}

function trainingDays(prog: ReturnType<typeof generateProgram>) {
  return prog.days.filter((d) => !d.isRest);
}

// A day is "compounds first" if no compound exercise appears after an isolation one.
function compoundsFirst(exercises: { isCompound: boolean }[]): boolean {
  let seenIso = false;
  for (const ex of exercises) {
    if (!ex.isCompound) seenIso = true;
    else if (seenIso) return false;
  }
  return true;
}

test("beginner / home / no equipment / 3 days -> full-body bodyweight plan", () => {
  const prog = generateProgram(
    setup({
      trainingLocation: "home",
      hasEquipment: false,
      equipment: [],
      experienceLevel: "beginner",
      trainingDaysPerWeek: 3,
    }),
    "fatLoss",
    ALL
  );

  assert.equal(prog.days.length, 7, "a program is always a 7-day week");
  const train = trainingDays(prog);
  assert.equal(train.length, 3, "3 training days");
  assert.equal(prog.days.filter((d) => d.isRest).length, 4, "rest days fill the rest of the week");
  assert.equal(prog.split, "Full Body");

  for (const day of train) {
    assert.ok(day.exercises.length >= 3, `each training day has real volume (${day.focus})`);
    assert.ok(compoundsFirst(day.exercises), `${day.focus}: compounds come before isolation`);
    for (const ex of day.exercises) {
      const src = BY_ID.get(ex.exerciseId);
      assert.ok(src, "every exercise id resolves to a real catalog entry");
      // No equipment available -> everything must be bodyweight.
      assert.equal(src!.equipment, "body only", `${ex.name} should need no equipment`);
      // Beginners only get beginner-level movements (safety / form-first).
      assert.equal(src!.level, "beginner", `${ex.name} should be a beginner movement`);
      // Beginners get a "why this movement" note.
      assert.ok(ex.note && ex.note.length > 0, `${ex.name} should carry a beginner note`);
    }
  }

  assert.ok(prog.progression.length > 0);
  assert.ok(prog.disclaimer.length > 0);
});

test("advanced / gym / 5 days -> PPL + Upper/Lower with weighted work", () => {
  const prog = generateProgram(
    setup({
      trainingLocation: "gym",
      experienceLevel: "advanced",
      trainingDaysPerWeek: 5,
    }),
    "muscleGain",
    ALL
  );

  const train = trainingDays(prog);
  assert.equal(train.length, 5, "5 training days");
  assert.equal(prog.split, "PPL + Upper/Lower");

  // Compounds-first invariant holds on every day.
  for (const day of train) {
    assert.ok(compoundsFirst(day.exercises), `${day.focus}: compounds before isolation`);
  }

  // A gym plan should use loaded equipment somewhere (not all bodyweight).
  const usesEquipment = train
    .flatMap((d) => d.exercises)
    .some((ex) => BY_ID.get(ex.exerciseId)?.equipment !== "body only");
  assert.ok(usesEquipment, "a gym plan should include weighted exercises");

  // Advanced gets more accessory volume than a beginner full-body day.
  const maxExercises = Math.max(...train.map((d) => d.exercises.length));
  assert.ok(maxExercises >= 5, `advanced days carry more volume (got ${maxExercises})`);
});

test("injuries adjust selection and are reported", () => {
  const prog = generateProgram(
    setup({
      trainingLocation: "gym",
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 4,
      injuriesNote: "bad knee, sore lower back",
    }),
    "general",
    ALL
  );

  assert.ok(prog.adjustedForInjuries.length > 0, "injury adjustments are surfaced to the user");

  const names = trainingDays(prog)
    .flatMap((d) => d.exercises)
    .map((ex) => ex.name.toLowerCase());

  assert.ok(
    !names.some((n) => /deadlift|lunge|good ?morning|bent[- ]?over/.test(n)),
    "knee/back-aggravating movements are filtered out"
  );
});

test("swap returns a different, still-valid exercise of the same pattern", () => {
  // Gym setup -> a deep candidate pool, so an alternative reliably exists.
  const config = setup({ trainingLocation: "gym", experienceLevel: "intermediate", trainingDaysPerWeek: 3 });
  const prog = generateProgram(config, "general", ALL);
  const day = prog.days.find((d) => !d.isRest)!;
  const original = day.exercises[0];

  // Exclude everything already in the day (incl. the original) — like the UI does.
  const excludeIds = day.exercises.map((e) => e.exerciseId);
  const swapped = swapProgramExercise(config, "general", ALL, original.pattern, excludeIds);

  assert.ok(swapped, "an alternative should exist for a common pattern in a gym");
  assert.notEqual(swapped!.exerciseId, original.exerciseId, "swap must change the exercise");
  assert.ok(!excludeIds.includes(swapped!.exerciseId), "swap must avoid same-day duplicates");
  assert.equal(swapped!.pattern, original.pattern, "swap keeps the same movement pattern");

  // Grounded: still a real, level-appropriate catalog exercise with instructions.
  const src = BY_ID.get(swapped!.exerciseId);
  assert.ok(src, "swap resolves to a real catalog entry");
  assert.ok(["beginner", "intermediate"].includes(src!.level), "swap respects the level cap");
  assert.ok(swapped!.instructions.length > 0, "swap carries how-to instructions");
});

test("program exercises carry dataset instructions", () => {
  const prog = generateProgram(
    setup({ trainingLocation: "gym", experienceLevel: "intermediate", trainingDaysPerWeek: 3 }),
    "general",
    ALL
  );
  const anyExercise = trainingDays(prog).flatMap((d) => d.exercises)[0];
  assert.ok(Array.isArray(anyExercise.instructions) && anyExercise.instructions.length > 0);
});

test("set/rep schemes differ by emphasis for non-beginners", () => {
  const base = setup({ trainingLocation: "gym", experienceLevel: "intermediate", trainingDaysPerWeek: 3 });

  const strength = generateProgram(base, "strength", ALL);
  const fatLoss = generateProgram(base, "fatLoss", ALL);

  const firstCompound = (p: ReturnType<typeof generateProgram>) =>
    trainingDays(p)
      .flatMap((d) => d.exercises)
      .find((ex) => ex.isCompound)!;

  // Strength should program heavier/lower reps than fat-loss circuits.
  assert.ok(firstCompound(strength).sets >= firstCompound(fatLoss).sets);
  assert.ok(firstCompound(strength).restSeconds > firstCompound(fatLoss).restSeconds);
});
