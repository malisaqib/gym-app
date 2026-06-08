import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWorkoutPlan, type WorkoutInput, type WorkoutPlan } from "./coachPlan.ts";
import { enrichExercises, type NormalizedExercise } from "./enrich.ts";
import type { Exercise } from "./exerciseDb.ts";

// Real dataset, enriched (read via fs — no bundler JSON import).
const RAW = JSON.parse(readFileSync(join(process.cwd(), "data", "exercises.json"), "utf8")) as Exercise[];
const ALL = enrichExercises(RAW);
const byId = new Map<string, NormalizedExercise>(ALL.map((e) => [e.id, e]));

const base: WorkoutInput = {
  goal: "stay_fit",
  location: "home",
  equipment: [],
  hasEquipment: false,
  level: "beginner",
  daysPerWeek: 3,
};
const plan = (over: Partial<WorkoutInput>) => buildWorkoutPlan({ ...base, ...over }, ALL);
const flat = (p: WorkoutPlan) => p.days.filter((d) => !d.isRest).flatMap((d) => d.exercises);
const PULLUP = /pull[- ]?up|chin[- ]?up|v[- ]?bar|muscle[- ]?up/i;

test("Home + bodyweight + beginner + belly fat + 5 days → no pull-ups; all home-bodyweight + beginner safe", () => {
  const p = plan({ goal: "lose_belly_fat", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 5 });
  const exs = flat(p);
  assert.ok(exs.length > 0, "plan should not be empty");
  for (const e of exs) {
    assert.ok(!PULLUP.test(e.name), `pull-up leaked: ${e.name}`);
    const n = byId.get(e.id)!;
    assert.equal(n.homeBodyweightSafe, true, `${e.name} not home-bodyweight-safe`);
    assert.equal(n.beginnerSafe, true, `${e.name} not beginner-safe`);
  }
  assert.ok(p.bellyFatNote && p.bellyFatNote.includes("overall fat loss"), "belly-fat education note required");
});

test("Home + bodyweight + beginner → only beginner-safe home exercises", () => {
  const p = plan({ goal: "tone", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 4 });
  for (const e of flat(p)) {
    const n = byId.get(e.id)!;
    assert.equal(n.homeBodyweightSafe, true, e.name);
    assert.equal(e.difficulty, "beginner", e.name);
  }
});

test("Gym + gain muscle + 5 days (intermediate) → real split, compounds led", () => {
  const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 });
  const trainingDays = p.days.filter((d) => !d.isRest);
  assert.equal(trainingDays.length, 5);
  assert.notEqual(p.split, "Full Body");
  for (const d of trainingDays) {
    if (d.exercises.length) assert.equal(d.exercises[0].isCompound, true, `${d.focus} should lead with a compound`);
  }
  const patterns = new Set(flat(p).map((e) => e.pattern));
  assert.ok(patterns.has("push") && patterns.has("pull"), "split should train push and pull");
  assert.ok(patterns.has("squat") || patterns.has("hinge"), "split should train legs");
});

test("Gym + lose weight + beginner → full-body, has core, beginner-safe, no pull-ups", () => {
  const p = plan({ goal: "lose_weight", location: "gym", hasEquipment: true, level: "beginner", daysPerWeek: 4 });
  const exs = flat(p);
  assert.ok(exs.length > 0);
  assert.ok(exs.some((e) => e.pattern === "core"), "should include core work");
  for (const e of exs) {
    assert.equal(e.difficulty, "beginner", e.name);
    assert.ok(!PULLUP.test(e.name), `pull-up leaked: ${e.name}`);
  }
});

test("Knee pain → no high-impact jumps and no knee-caution moves", () => {
  const p = plan({ goal: "lose_weight", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 4, injuriesNote: "knee pain" });
  for (const e of flat(p)) {
    assert.equal(e.highImpact, false, `high-impact leaked: ${e.name}`);
    assert.ok(!e.cautionTags.includes("knee"), `knee-risk move leaked: ${e.name}`);
  }
});

test("No pull-up bar (home with dumbbells) → no pull-ups/chin-ups anywhere", () => {
  const p = plan({ goal: "gain_muscle", location: "home", hasEquipment: true, equipment: ["dumbbells"], level: "intermediate", daysPerWeek: 4 });
  for (const e of flat(p)) {
    assert.ok(!PULLUP.test(e.name), `pull-up leaked without a bar: ${e.name}`);
    assert.equal(byId.get(e.id)!.requiresPullupBar, false, e.name);
  }
});

test("Beginner → never an advanced/expert exercise", () => {
  const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "beginner", daysPerWeek: 3 });
  for (const e of flat(p)) assert.equal(e.difficulty, "beginner", e.name);
});

test("focusArea=glutes → measurably more lower-body/glute volume than full body", () => {
  const cfg: Partial<WorkoutInput> = { goal: "stay_fit", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 4 };
  const lower = (p: WorkoutPlan) =>
    flat(p).filter((e) => ["squat", "hinge", "lunge"].includes(e.pattern) || e.primaryMuscle === "glutes").length;
  const full = lower(plan({ ...cfg, focusArea: "full_body" }));
  const glutes = lower(plan({ ...cfg, focusArea: "glutes" }));
  assert.ok(glutes > full, `glutes(${glutes}) should exceed full_body(${full})`);
});

test("6-day beginner is capped to 5 with a friendly note", () => {
  const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "beginner", daysPerWeek: 6 });
  assert.equal(p.daysPerWeek, 5);
  assert.ok(p.adjustments.some((a) => /6 days/.test(a)));
});

test("plan is deterministic for the same input", () => {
  const a = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 });
  const b = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 });
  assert.deepEqual(a, b);
});
