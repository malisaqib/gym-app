import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeExercise, enrichExercises } from "./enrich.ts";
import type { Exercise } from "./exerciseDb.ts";

// Build a raw record with sane defaults so each test overrides only what matters.
const ex = (over: Partial<Exercise>): Exercise => ({
  id: over.id ?? over.name?.replace(/\s+/g, "_") ?? "x",
  name: "X",
  force: null,
  level: "beginner",
  mechanic: null,
  equipment: "body only",
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  category: "strength",
  images: [],
  ...over,
});

test("Pullups: needs a bar, not home-bodyweight-safe, not true-beginner", () => {
  const n = normalizeExercise(
    ex({ name: "Pullups", force: "pull", level: "beginner", mechanic: "compound", equipment: "body only", primaryMuscles: ["lats"] })
  );
  assert.equal(n.requiresPullupBar, true);
  assert.equal(n.homeBodyweightSafe, false);
  assert.equal(n.beginnerSafe, false); // bumped to intermediate
  assert.equal(n.normalizedDifficulty, "intermediate");
  assert.equal(n.movementPattern, "pull");
  assert.equal(n.normalizedEquipment, "pullup bar");
});

test("Chin-Up and V-bar Pullup also require a bar", () => {
  for (const name of ["Chin-Up", "V-bar Pullup"]) {
    const n = normalizeExercise(ex({ name, force: "pull", mechanic: "compound", equipment: "body only", primaryMuscles: ["lats"] }));
    assert.equal(n.requiresPullupBar, true, name);
    assert.equal(n.homeBodyweightSafe, false, name);
  }
});

test("Pushups: home-bodyweight-safe, beginner-safe push", () => {
  const n = normalizeExercise(
    ex({ name: "Pushups", force: "push", level: "beginner", mechanic: "compound", equipment: "body only", primaryMuscles: ["chest"] })
  );
  assert.equal(n.homeBodyweightSafe, true);
  assert.equal(n.beginnerSafe, true);
  assert.equal(n.movementPattern, "push");
  assert.equal(n.requiresPullupBar, false);
  assert.ok(n.cautionTags.includes("wrist"));
});

test("Bodyweight Squat → squat pattern, home-safe", () => {
  const n = normalizeExercise(ex({ name: "Bodyweight Squat", mechanic: "compound", equipment: "body only", primaryMuscles: ["quadriceps"] }));
  assert.equal(n.movementPattern, "squat");
  assert.equal(n.homeBodyweightSafe, true);
});

test("Leg Press → gym machine, not home-safe", () => {
  const n = normalizeExercise(ex({ name: "Leg Press", mechanic: "compound", equipment: "machine", primaryMuscles: ["quadriceps"] }));
  assert.equal(n.requiresMachine, true);
  assert.equal(n.location, "gym");
  assert.equal(n.homeBodyweightSafe, false);
  assert.equal(n.normalizedEquipment, "machine");
});

test("Barbell Deadlift → hinge, barbell, back caution", () => {
  const n = normalizeExercise(
    ex({ name: "Barbell Deadlift", force: "pull", level: "intermediate", mechanic: "compound", equipment: "barbell", primaryMuscles: ["lower back"] })
  );
  assert.equal(n.movementPattern, "hinge");
  assert.equal(n.requiresBarbell, true);
  assert.equal(n.location, "gym");
  assert.ok(n.cautionTags.includes("back"));
});

test("Box Jump → high impact + knee caution", () => {
  const n = normalizeExercise(ex({ name: "Box Jump", category: "plyometrics", equipment: "body only", primaryMuscles: ["quadriceps"] }));
  assert.equal(n.highImpact, true);
  assert.ok(n.cautionTags.includes("knee"));
});

test("Plank → core pattern, wrist caution", () => {
  const n = normalizeExercise(ex({ name: "Plank", force: "static", equipment: "body only", primaryMuscles: ["abdominals"] }));
  assert.equal(n.movementPattern, "core");
  assert.ok(n.cautionTags.includes("wrist"));
});

test("Pistol Squat → advanced even though bodyweight", () => {
  const n = normalizeExercise(ex({ name: "Pistol Squat", level: "beginner", mechanic: "compound", equipment: "body only", primaryMuscles: ["quadriceps"] }));
  assert.equal(n.normalizedDifficulty, "advanced");
  assert.equal(n.beginnerSafe, false);
});

test("Incline DB press needs a bench; incline push-up does not", () => {
  const press = normalizeExercise(ex({ name: "Incline Dumbbell Press", mechanic: "compound", equipment: "dumbbell", force: "push", primaryMuscles: ["chest"] }));
  assert.equal(press.requiresBench, true);
  const pushup = normalizeExercise(ex({ name: "Incline Push-Up", mechanic: "compound", equipment: "body only", force: "push", primaryMuscles: ["chest"] }));
  assert.equal(pushup.requiresBench, false);
  assert.equal(pushup.homeBodyweightSafe, true);
});

// --- invariants over the REAL dataset (read via fs; no bundler JSON import) ---
const RAW = JSON.parse(readFileSync(join(process.cwd(), "data", "exercises.json"), "utf8")) as Exercise[];
const ALL = enrichExercises(RAW);

test("real data: every pull-up-bar move is NOT home-bodyweight-safe", () => {
  const bad = ALL.filter((e) => e.requiresPullupBar && e.homeBodyweightSafe);
  assert.equal(bad.length, 0, `leaked: ${bad.map((e) => e.name).join(", ")}`);
});

test("real data: the home/beginner pool contains NO pull-ups/chin-ups/v-bar", () => {
  const homeBeginner = ALL.filter((e) => e.homeBodyweightSafe && e.beginnerSafe);
  const leaked = homeBeginner.filter((e) => /pull[- ]?up|chin[- ]?up|v[- ]?bar|muscle[- ]?up/i.test(e.name));
  assert.equal(leaked.length, 0, `leaked: ${leaked.map((e) => e.name).join(", ")}`);
  // sanity: a home beginner still has plenty to train with
  assert.ok(homeBeginner.length >= 30, `too few home-beginner moves: ${homeBeginner.length}`);
});

test("real data: the well-known Pullups/Chin-Up rows are flagged correctly", () => {
  for (const name of ["Pullups", "Chin-Up"]) {
    const e = ALL.find((x) => x.name === name);
    assert.ok(e, `${name} missing from dataset`);
    assert.equal(e!.requiresPullupBar, true, name);
    assert.equal(e!.homeBodyweightSafe, false, name);
    assert.equal(e!.beginnerSafe, false, name);
  }
});
