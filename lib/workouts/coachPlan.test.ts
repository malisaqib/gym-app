import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWorkoutPlan, swapPlanExercise, loadScore, type SwapDirection, type WorkoutInput, type WorkoutPlan } from "./coachPlan.ts";
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

// --- Phase 5: directional swap ----------------------------------------------

const gymAdv: WorkoutInput = { ...base, location: "gym", hasEquipment: true, level: "advanced", daysPerWeek: 4 };

test("swap 'different' is deterministic, same pattern, and never an excluded id", () => {
  const a = swapPlanExercise(gymAdv, "squat", "", [], "different", ALL);
  const b = swapPlanExercise(gymAdv, "squat", "", [], "different", ALL);
  assert.ok(a, "should find a squat");
  assert.equal(a!.id, b!.id, "must be deterministic");
  assert.equal(a!.pattern, "squat");
  const c = swapPlanExercise(gymAdv, "squat", "", [a!.id], "different", ALL);
  assert.notEqual(c?.id, a!.id, "excluded id must not come back");
});

test("swap 'harder' is strictly more demanding; 'easier' strictly less demanding", () => {
  const push = ALL.filter((e) => e.movementPattern === "push");
  const scored = push.map((e) => ({ e, s: loadScore(e) })).sort((x, y) => x.s - y.s);
  const low = scored[0].e;
  const high = scored[scored.length - 1].e;

  const harder = swapPlanExercise(gymAdv, "push", low.id, [low.id], "harder", ALL);
  assert.ok(harder, "a harder push should exist");
  assert.ok(loadScore(byId.get(harder!.id)!) > loadScore(low), "harder must score higher");

  const easier = swapPlanExercise(gymAdv, "push", high.id, [high.id], "easier", ALL);
  assert.ok(easier, "an easier push should exist");
  assert.ok(loadScore(byId.get(easier!.id)!) < loadScore(high), "easier must score lower");
});

test("swap stays eligible: no pull-up offered without a bar, in any direction", () => {
  const homeDb: WorkoutInput = { ...base, location: "home", hasEquipment: true, equipment: ["dumbbells"], level: "intermediate" };
  for (const dir of ["easier", "different", "harder"] as SwapDirection[]) {
    const r = swapPlanExercise(homeDb, "pull", "", [], dir, ALL);
    if (r) assert.equal(byId.get(r.id)!.requiresPullupBar, false, `${dir} offered a bar pull: ${r.name}`);
  }
});

// --- Phase 6 QA: the brief's manual-check matrix, locked as tests -----------

const homeBeg: WorkoutInput = { ...base, location: "home", hasEquipment: false, level: "beginner" };

test("QA(5): home beginner swaps a push-up EASIER to an incline/knee/wall variation", () => {
  const pushups = ALL.find((e) => e.name === "Pushups");
  assert.ok(pushups, "dataset should contain 'Pushups'");
  const easier = swapPlanExercise(homeBeg, "push", pushups!.id, [pushups!.id], "easier", ALL);
  assert.ok(easier, "should offer an easier push variation");
  assert.match(easier!.name, /incline|knee|wall|assisted|negative/i, `unexpected easier swap: ${easier!.name}`);
  assert.ok(loadScore(byId.get(easier!.id)!) < loadScore(pushups!), "easier must score lower");
});

test("QA(5): from the hardest eligible bodyweight push there is no harder swap → null (cue fallback)", () => {
  const feet = ALL.find((e) => e.name === "Push-Ups With Feet Elevated");
  assert.ok(feet, "dataset should contain feet-elevated push-up");
  const harder = swapPlanExercise(homeBeg, "push", feet!.id, [feet!.id], "harder", ALL);
  assert.equal(harder, null, "nothing tougher in a home-beginner bodyweight pool");
});

test("QA(1) GENDER RULE: female vs male, identical everything else → IDENTICAL plan (no softening by sex)", () => {
  const cfg: Partial<WorkoutInput> = { goal: "lose_belly_fat", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 5 };
  const female = buildWorkoutPlan({ ...base, ...cfg, sex: "female" }, ALL);
  const male = buildWorkoutPlan({ ...base, ...cfg, sex: "male" }, ALL);
  assert.deepEqual(female, male, "sex must NOT change selection/difficulty");
});

test("QA(4): home + no equipment → never an exercise needing a machine/cable/barbell/dumbbell/bench/bar", () => {
  const p = plan({ goal: "gain_muscle", location: "home", hasEquipment: false, level: "intermediate", daysPerWeek: 4 });
  for (const e of flat(p)) {
    const n = byId.get(e.id)!;
    assert.ok(
      !n.requiresMachine && !n.requiresCable && !n.requiresBarbell && !n.requiresDumbbell && !n.requiresBench && !n.requiresPullupBar,
      `needs equipment at home/no-equipment: ${e.name}`
    );
  }
});
