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

// W1 — desperation slot-filling. When an accessory/isolation slot's target
// muscle has NO eligible candidate, the slot must drop — never fill with a
// muscle-irrelevant tie-break winner. The live bug: home/bodyweight/beginner
// gain_muscle Upper days contained "Isometric Neck Exercise" (×2, filling the
// shoulders/biceps isolation slots), "Standing Towel Triceps Extension" and a
// leg move. Upper days must contain ONLY upper-body/core-relevant work.
test("W1: home/bodyweight/beginner gain_muscle → zero irrelevant filler; unfillable slots drop", () => {
  const UPPER_OK = new Set([
    "chest", "shoulders", "triceps", "biceps", "forearms",
    "lats", "middle back", "lower back", "traps", "abdominals",
  ]);
  const p = plan({ goal: "gain_muscle", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 4 });
  const exs = flat(p);
  assert.ok(exs.length > 0, "plan should not be empty");

  for (const e of exs) {
    // The exact junk class from the audit: neck isometrics + household-prop moves.
    assert.ok(e.primaryMuscle !== "neck", `neck filler leaked: ${e.name}`);
    assert.ok(!/towel/i.test(e.name), `household-prop filler leaked: ${e.name}`);
  }
  for (const d of p.days) {
    if (d.isRest || !/upper/i.test(d.focus)) continue;
    assert.ok(d.exercises.length >= 2, `${d.focus} day over-dropped: ${d.exercises.length} exercises`);
    for (const e of d.exercises) {
      assert.ok(
        e.primaryMuscle !== null && UPPER_OK.has(e.primaryMuscle),
        `irrelevant filler on an Upper day: ${e.name} (primary: ${e.primaryMuscle})`
      );
    }
  }
});

test("W1: accessory slots only ever hold muscle-relevant picks (primary or secondary), all plans", () => {
  // Across a spread of contexts, every accessory-role pick must train a muscle
  // related to SOME slot of its template day. Cheap proxy that catches the
  // desperation-fill class without over-constraining: no neck-primary picks and
  // no towel-prop moves anywhere, in any context.
  const contexts: Partial<WorkoutInput>[] = [
    { goal: "gain_muscle", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 5 },
    { goal: "tone", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 4 },
    { goal: "build_strength", location: "home", hasEquipment: true, equipment: ["dumbbells"], level: "intermediate", daysPerWeek: 4 },
    { goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 },
  ];
  for (const c of contexts) {
    for (const e of flat(plan(c))) {
      assert.ok(e.primaryMuscle !== "neck", `neck filler leaked (${JSON.stringify(c)}): ${e.name}`);
      assert.ok(!/towel/i.test(e.name), `towel move leaked (${JSON.stringify(c)}): ${e.name}`);
    }
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

// --- Selection-quality suite (tier / muscle / novelty / descriptions) --------

const NOVELTY = /\b(alternat|bound|diagonal|around the world|anti-gravity|atlas|tire|clock|car driver|renegade|jump|skater|burpee|sledge|zercher)\b/i;
const LEG_MUSCLES = new Set(["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"]);

test("Gym/Intermediate/5-day/Gain muscle → real split led by Tier-1 compounds, ZERO Tier-3/novelty", () => {
  const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 });
  const training = p.days.filter((d) => !d.isRest);
  assert.equal(training.length, 5);

  // Every training day is LED by a Tier-1 compound matching that day's muscles.
  for (const d of training) {
    const lead = d.exercises[0];
    assert.ok(lead, `${d.focus} is empty`);
    assert.equal(byId.get(lead.id)!.tier, 1, `${d.focus} not led by a Tier-1: ${lead.name}`);
    assert.equal(lead.isCompound, true, `${d.focus} lead is not a compound: ${lead.name}`);
  }

  // No novelty / Tier-3 anywhere.
  for (const e of flat(p)) {
    assert.notEqual(byId.get(e.id)!.tier, 3, `Tier-3 leaked: ${e.name}`);
    assert.ok(!NOVELTY.test(e.name), `novelty leaked: ${e.name}`);
  }

  // The fundamentals are actually present (a real bench/squat/deadlift/row/pulldown/press split).
  const names = flat(p).map((e) => e.name.toLowerCase());
  const has = (re: RegExp) => names.some((n) => re.test(n));
  assert.ok(has(/bench press/), "missing a bench press");
  assert.ok(has(/squat/), "missing a squat");
  assert.ok(has(/deadlift|romanian/), "missing a deadlift/RDL");
  assert.ok(has(/\brow\b|rows/), "missing a row");
  assert.ok(has(/pulldown|pull-?up|chin-?up/), "missing a vertical pull");
  assert.ok(has(/shoulder press|overhead|military/), "missing an overhead press");
});

test("Gym/Beginner/fat loss → beginner-safe, no novelty, no Tier-3", () => {
  const p = plan({ goal: "lose_weight", location: "gym", hasEquipment: true, level: "beginner", daysPerWeek: 4 });
  const exs = flat(p);
  assert.ok(exs.length > 0);
  for (const e of exs) {
    assert.equal(e.difficulty, "beginner", `non-beginner on beginner plan: ${e.name}`);
    assert.notEqual(byId.get(e.id)!.tier, 3, `Tier-3 leaked: ${e.name}`);
    assert.ok(!NOVELTY.test(e.name), `novelty leaked: ${e.name}`);
  }
});

test("No description contradicts the exercise's real muscle group", () => {
  for (const cfg of [
    { goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 } as const,
    { goal: "stay_fit", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 3 } as const,
  ]) {
    for (const e of flat(plan(cfg))) {
      const why = e.whyThisExercise.toLowerCase();
      if (LEG_MUSCLES.has(e.primaryMuscle ?? "")) {
        assert.ok(!/chest|pressing/.test(why), `leg move claims chest/pressing: ${e.name} → ${e.whyThisExercise}`);
      }
      if (e.primaryMuscle === "shoulders") {
        assert.ok(!/your chest/.test(why), `shoulder move claims chest: ${e.name} → ${e.whyThisExercise}`);
      }
      if (e.primaryMuscle === "lats" || e.primaryMuscle === "middle back") {
        assert.ok(!/pressing|your chest/.test(why), `back move claims pressing/chest: ${e.name} → ${e.whyThisExercise}`);
      }
    }
  }
});

test("Level tags never exceed the plan level", () => {
  const RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  for (const lvl of ["beginner", "intermediate", "advanced"] as const) {
    const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: lvl, daysPerWeek: 4 });
    for (const e of flat(p)) {
      assert.ok(RANK[e.difficulty] <= RANK[lvl], `${e.name} (${e.difficulty}) exceeds a ${lvl} plan`);
    }
  }
});

// --- pull-up bar HARD-filter cases (the bug we already fought) ---------------

test("PULLUP(1): Home/bodyweight/beginner → ZERO pull-ups/chin-ups anywhere", () => {
  const p = plan({ goal: "stay_fit", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 4 });
  for (const e of flat(p)) {
    assert.ok(!PULLUP.test(e.name), `pull-up leaked: ${e.name}`);
    assert.equal(byId.get(e.id)!.requiresPullupBar, false, e.name);
  }
});

test("PULLUP(2): Gym/intermediate/gain muscle → vertical pulls ARE allowed and days are Tier-1-led", () => {
  const p = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 5 });
  const names = flat(p).map((e) => e.name.toLowerCase());
  assert.ok(names.some((n) => /pulldown|pull-?up|chin-?up/.test(n)), "gym plan should include a vertical pull");
  for (const d of p.days.filter((x) => !x.isRest)) {
    assert.equal(byId.get(d.exercises[0].id)!.tier, 1, `${d.focus} not Tier-1 led`);
  }
});

test("PULLUP(3): Equipment without a pull-up bar (dumbbells+bench) → no pull-up-bar move at all", () => {
  const p = plan({ goal: "gain_muscle", location: "home", hasEquipment: true, equipment: ["dumbbells", "bench"], level: "intermediate", daysPerWeek: 4 });
  for (const e of flat(p)) {
    assert.equal(byId.get(e.id)!.requiresPullupBar, false, `pull-up-bar move without a bar: ${e.name}`);
    assert.ok(!PULLUP.test(e.name), e.name);
  }
});

test("BACK-SLOT: home/bodyweight back work is genuine equipment-free posterior — never a core/leg move or band/bar", () => {
  // Misclassification fixed: a force:'pull' ab move is core, never 'pull'.
  const flutter = ALL.find((e) => e.name === "Flutter Kicks")!;
  assert.notEqual(flutter.movementPattern, "pull", "Flutter Kicks must NOT be a pull");
  assert.equal(flutter.movementPattern, "core", "Flutter Kicks should be core");

  const p = plan({ goal: "stay_fit", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 3 });
  const exs = flat(p);

  // Every move is truly equipment-free (so no band/bar substitute slipped in).
  for (const e of exs) {
    assert.equal(e.equipment, "bodyweight", `non-bodyweight move in a no-equipment plan: ${e.name}`);
    assert.ok(!PULLUP.test(e.name), `pull-up leaked: ${e.name}`);
  }

  // The posterior fallback put a GENUINE back move in (e.g. Superman = lower back),
  // and only real posterior muscles count as back work — never a core/leg-raise.
  const POSTERIOR = new Set(["lower back", "lats", "middle back", "traps"]);
  const back = exs.filter((e) => POSTERIOR.has(e.primaryMuscle ?? ""));
  assert.ok(back.length > 0, "home bodyweight plan should include a genuine posterior move");
  for (const e of back) assert.equal(e.equipment, "bodyweight", e.name);

  // The non-pushy gear nudge is shown.
  assert.ok(p.adjustments.some((a) => /resistance band|pull-up bar/i.test(a)), "gear nudge expected on no-equipment back days");
});

// W3 — the split label must describe the REAL template days. The 4-day
// intermediate muscle block is [Upper, Lower, Push, Pull]; it used to be
// labeled "Push / Pull / Legs" just because "Push" appeared somewhere.
test("W3: split label matches the actual template days", () => {
  const fourDay = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 4 });
  const focuses = fourDay.days.filter((d) => !d.isRest).map((d) => d.focus);
  assert.deepEqual(focuses, ["Upper", "Lower", "Push", "Pull"]);
  assert.equal(fourDay.split, "Upper / Lower / Push / Pull");

  // A true PPL stays labeled PPL; upper/lower stays upper/lower.
  const ppl = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 3 });
  assert.equal(ppl.split, "Push / Pull / Legs");
  const ul = plan({ goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate", daysPerWeek: 2 });
  assert.equal(ul.split, "Upper / Lower");
  // Beginner full-body keeps a clean label (A/B/C suffixes collapse).
  const fb = plan({ goal: "gain_muscle", location: "home", hasEquipment: false, level: "beginner", daysPerWeek: 3 });
  assert.equal(fb.split, "Full Body");
});

// W4 — tier-3 novelty is reachable ONLY via an explicit "Different" swap.
// "easier"/"harder" are progression directions and must never escalate the
// user into novelty/sport-specific moves.
test("W4: easier/harder swaps never return a Tier-3 exercise (any context)", () => {
  const contexts: WorkoutInput[] = [
    { ...base, goal: "gain_muscle", location: "gym", hasEquipment: true, level: "intermediate" },
    { ...base, goal: "build_strength", location: "gym", hasEquipment: true, level: "advanced" },
    { ...base, goal: "tone", location: "home", hasEquipment: true, equipment: ["dumbbells", "bench"], level: "intermediate" },
  ];
  const patterns = ["push", "pull", "squat", "hinge", "lunge", "core"] as const;
  let checked = 0;
  for (const input of contexts) {
    for (const pattern of patterns) {
      // Walk several starting exercises so the swap explores the score range.
      const starts = ALL.filter((e) => e.movementPattern === pattern).slice(0, 8);
      for (const start of starts) {
        for (const dir of ["easier", "harder"] as SwapDirection[]) {
          const res = swapPlanExercise(input, pattern, start.id, [], dir, ALL);
          if (!res) continue;
          const tier = byId.get(res.id)!.tier;
          assert.notEqual(tier, 3, `tier-3 via "${dir}": ${res.name} (from ${start.name})`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 30, `too few swaps exercised the rule: ${checked}`);
});
