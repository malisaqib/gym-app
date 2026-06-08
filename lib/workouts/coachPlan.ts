import type { MuscleGroup } from "./exerciseDb.ts";
import type { CautionTag, MovementPattern, NormalizedDifficulty, NormalizedExercise } from "./enrich.ts";

export type { MovementPattern } from "./enrich.ts";

/**
 * Workout rebuild — Phases 2 + 3: deterministic templates + the plan generator.
 *
 * 100% rule-based + pure (no AI, no I/O). Given the user's merged profile and an
 * ENRICHED exercise list, it selects a safe, personalized program:
 *   - picks a goal×context template (Phase 2 ground truth),
 *   - filters the enriched pool by location/equipment, real difficulty, injuries,
 *     impact and focus-area bias,
 *   - fills each day compounds-first, no same-day duplicates,
 *   - adds sets/reps/rest, why, and easier/harder.
 * Truth rule: NO exercise burns belly fat; for belly-fat goals we attach the
 * education note and build full-body strength + low-impact cardio + core.
 */

export type WorkoutGoal =
  | "lose_belly_fat"
  | "lose_weight"
  | "gain_muscle"
  | "gain_weight"
  | "build_strength"
  | "tone"
  | "stay_fit";
export type FocusArea = "full_body" | "lower_body" | "glutes" | "upper_body";
export type Level = "beginner" | "intermediate" | "advanced";

export interface WorkoutInput {
  goal: WorkoutGoal;
  location: "home" | "gym" | "both";
  equipment: string[]; // EquipmentItem keys (dumbbells, bands, pullup_bar, …)
  hasEquipment: boolean;
  level: Level;
  daysPerWeek: number; // 2..6
  injuriesNote?: string;
  focusArea?: FocusArea; // default full_body
  overweight?: boolean; // optional conservative trigger
  lowImpactPreference?: boolean;
  sex?: "male" | "female"; // cosmetic only — NEVER drives difficulty/selection
}

export interface PlanExercise {
  id: string;
  name: string;
  pattern: MovementPattern;
  primaryMuscle: MuscleGroup | null;
  isCompound: boolean;
  difficulty: NormalizedExercise["normalizedDifficulty"];
  equipment: NormalizedExercise["normalizedEquipment"];
  sets: number;
  reps: string;
  restSeconds: number;
  whyThisExercise: string;
  instructions: string[];
  regression: string;
  progression: string;
  highImpact: boolean;
  cautionTags: CautionTag[];
}

export interface PlanDay {
  name: string;
  focus: string;
  isRest: boolean;
  warmup?: string;
  exercises: PlanExercise[];
}

export interface WorkoutPlan {
  goal: WorkoutGoal;
  location: WorkoutInput["location"];
  level: Level;
  daysPerWeek: number;
  focusArea: FocusArea;
  split: string;
  summary: string;
  progressionNote: string;
  disclaimer: string;
  bellyFatNote?: string;
  adjustments: string[];
  days: PlanDay[]; // length 7 (rest days included)
}

export const BELLY_FAT_NOTE =
  "Belly fat reduces through overall fat loss. This plan combines full-body strength, low-impact cardio, and core so you progress safely — your diet plan creates the calorie deficit that actually reduces fat across your whole body.";

const DISCLAIMER =
  "This is a general starting plan, not medical advice. Stop if anything hurts and see a qualified professional for pain or medical conditions.";
const WARMUP = "5 min easy cardio + 1–2 light warm-up sets on your first big lift.";

// --- goal helpers -----------------------------------------------------------

type Style = "fatloss" | "muscle" | "strength" | "general";

function styleForGoal(goal: WorkoutGoal): Style {
  switch (goal) {
    case "lose_belly_fat":
    case "lose_weight":
      return "fatloss";
    case "gain_muscle":
    case "gain_weight":
      return "muscle";
    case "build_strength":
      return "strength";
    default:
      return "general"; // tone, stay_fit
  }
}

/** Map the app's stored goals to a workout goal (used when wiring in Phase 4). */
export function resolveWorkoutGoal(
  relatable: string | null | undefined,
  practical: string | null | undefined
): WorkoutGoal {
  switch (relatable) {
    case "belly_fat":
      return "lose_belly_fat";
    case "shirt_look":
      return "tone";
    case "skinny_bulk":
      return "gain_muscle";
    case "wedding_event":
      return "lose_weight";
    case "sports":
    case "general":
    case "gym_start":
      return "stay_fit";
  }
  if (practical === "lose_fat") return "lose_weight";
  if (practical === "gain_muscle") return "gain_muscle";
  return "stay_fit";
}

const GOAL_LABEL: Record<WorkoutGoal, string> = {
  lose_belly_fat: "Lose belly fat",
  lose_weight: "Lose weight",
  gain_muscle: "Gain muscle",
  gain_weight: "Gain weight",
  build_strength: "Build strength",
  tone: "Tone / look better",
  stay_fit: "Stay fit",
};
const LOCATION_LABEL = { home: "Home", gym: "Gym", both: "Home + Gym" } as const;
const FOCUS_LABEL: Record<FocusArea, string> = {
  full_body: "Full body",
  lower_body: "Lower body",
  glutes: "Glutes",
  upper_body: "Upper body",
};

// --- eligibility (the safety gate) -----------------------------------------

const COMPOUND_PATTERNS = new Set<MovementPattern>(["squat", "hinge", "push", "pull", "lunge", "carry"]);
const isCompoundPattern = (p: MovementPattern) => COMPOUND_PATTERNS.has(p);

function injuryFlags(note: string | undefined): Set<CautionTag> {
  const f = new Set<CautionTag>();
  if (!note) return f;
  const t = note.toLowerCase();
  if (/knee/.test(t)) f.add("knee");
  if (/(back|spine|disc|hernia|lumbar)/.test(t)) f.add("back");
  if (/(shoulder|rotator)/.test(t)) f.add("shoulder");
  if (/(wrist|elbow)/.test(t)) f.add("wrist");
  return f;
}

function isConservative(input: WorkoutInput, flags: Set<CautionTag>): boolean {
  return input.level === "beginner" || flags.size > 0 || !!input.overweight || !!input.lowImpactPreference;
}

interface EquipCtx {
  pullupBar: boolean;
  machine: boolean;
  cable: boolean;
  barbell: boolean;
  dumbbell: boolean;
  bench: boolean;
  bodyweightOnly: boolean;
}

function equipCtx(input: WorkoutInput): EquipCtx {
  const gym = input.location === "gym" || input.location === "both";
  const eq = new Set(input.equipment);
  const has = (k: string) => gym || (input.hasEquipment && eq.has(k));
  return {
    pullupBar: has("pullup_bar"),
    machine: has("machines"),
    cable: has("machines"),
    barbell: has("barbell_rack"),
    dumbbell: has("dumbbells"),
    bench: has("bench"),
    bodyweightOnly: input.location === "home" && !input.hasEquipment,
  };
}

function eligible(e: NormalizedExercise, ctx: EquipCtx, input: WorkoutInput, flags: Set<CautionTag>, conservative: boolean): boolean {
  // equipment availability
  if (e.requiresPullupBar && !ctx.pullupBar) return false;
  if (e.requiresMachine && !ctx.machine) return false;
  if (e.requiresCable && !ctx.cable) return false;
  if (e.requiresBarbell && !ctx.barbell) return false;
  if (e.requiresDumbbell && !ctx.dumbbell) return false;
  if (e.requiresBench && !ctx.bench) return false;
  // no-equipment home → bodyweight-safe only
  if (ctx.bodyweightOnly && !e.homeBodyweightSafe) return false;
  // real difficulty
  if (input.level === "beginner" && e.normalizedDifficulty !== "beginner") return false;
  if (input.level === "intermediate" && e.normalizedDifficulty === "advanced") return false;
  // injuries (actual conditions, never gender)
  if (e.cautionTags.some((c) => flags.has(c))) return false;
  // impact — conservative users avoid jumping/plyo
  if (conservative && e.highImpact) return false;
  return true;
}

// --- templates (Phase 2 ground truth) --------------------------------------

type Role = "compound" | "accessory" | "core" | "cardio";
interface Slot {
  pattern: MovementPattern;
  role: Role;
  muscle?: MuscleGroup;
}
interface TemplateDay {
  focus: string;
  slots: Slot[];
}

const C = (pattern: MovementPattern): Slot => ({ pattern, role: "compound" });
const A = (pattern: MovementPattern, muscle?: MuscleGroup): Slot => ({ pattern, role: "accessory", muscle });
const CORE: Slot = { pattern: "core", role: "core" };
const CARDIO: Slot = { pattern: "cardio", role: "cardio" };

// Fat loss / belly fat: full-body strength + low-impact cardio + core. Never split.
function fatLossDays(days: number): TemplateDay[] {
  const FB: TemplateDay = { focus: "Full Body", slots: [C("squat"), C("push"), C("pull"), C("hinge"), CORE] };
  const FBC: TemplateDay = { focus: "Full Body + Core", slots: [C("squat"), C("push"), C("pull"), C("hinge"), CORE, CORE] };
  const CC: TemplateDay = { focus: "Low-impact Cardio + Core", slots: [CARDIO, CARDIO, CORE, CORE] };
  const LG: TemplateDay = { focus: "Lower + Glutes", slots: [C("squat"), C("hinge"), A("lunge", "glutes"), A("hinge", "glutes"), CORE] };
  const UP: TemplateDay = { focus: "Upper + Posture", slots: [C("push"), C("pull"), A("pull", "middle back"), CORE] };
  switch (days) {
    case 2:
      return [FBC, FB];
    case 3:
      return [FBC, CC, LG];
    case 4:
      return [FB, CC, LG, FB];
    case 5:
      return [FBC, CC, LG, UP, FB];
    default:
      return [FBC, CC, LG, UP, FB, CC]; // 6 (intermediate+ only)
  }
}

// Muscle / weight gain. Beginners: full-body / upper-lower. Inter/adv: splits.
function muscleDays(days: number, level: Level): TemplateDay[] {
  const Upper: TemplateDay = {
    focus: "Upper",
    slots: [C("push"), C("pull"), A("push", "shoulders"), A("pull", "biceps"), A("isolation", "triceps")],
  };
  const Lower: TemplateDay = {
    focus: "Lower",
    slots: [C("squat"), C("hinge"), A("lunge", "quadriceps"), A("isolation", "calves"), CORE],
  };
  if (level === "beginner") {
    const FBA: TemplateDay = { focus: "Full Body A", slots: [C("squat"), C("push"), C("pull"), C("hinge"), CORE] };
    const FBB: TemplateDay = { focus: "Full Body B", slots: [C("hinge"), C("push"), C("pull"), C("lunge"), CORE] };
    const FBC2: TemplateDay = { focus: "Full Body C", slots: [C("squat"), C("push"), C("pull"), A("isolation", "biceps"), CORE] };
    switch (days) {
      case 2:
        return [FBA, FBB];
      case 3:
        return [FBA, FBB, FBC2];
      case 4:
        return [Upper, Lower, Upper, Lower];
      default:
        return [Upper, Lower, FBA, Upper, Lower]; // 5 (6 capped to 5 for beginners)
    }
  }
  const Push: TemplateDay = { focus: "Push", slots: [C("push"), C("push"), A("push", "shoulders"), A("isolation", "triceps")] };
  const Pull: TemplateDay = { focus: "Pull", slots: [C("pull"), C("pull"), A("pull", "middle back"), A("isolation", "biceps")] };
  const Legs: TemplateDay = { focus: "Legs", slots: [C("squat"), C("hinge"), A("lunge", "quadriceps"), A("isolation", "calves"), CORE] };
  const ShouldersArms: TemplateDay = {
    focus: "Shoulders + Arms",
    slots: [C("push"), A("isolation", "shoulders"), A("isolation", "biceps"), A("isolation", "triceps")],
  };
  switch (days) {
    case 2:
      return [Upper, Lower];
    case 3:
      return [Push, Pull, Legs];
    case 4:
      return [Upper, Lower, Push, Pull];
    case 5:
      return [Push, Pull, Legs, ShouldersArms, Upper];
    default:
      return [Push, Pull, Legs, Push, Pull, Legs]; // 6
  }
}

// Strength: compound-led, fewer accessories (lower reps come from the scheme).
function strengthDays(days: number, level: Level): TemplateDay[] {
  if (level === "beginner") return muscleDays(days, "beginner");
  const Squat: TemplateDay = { focus: "Squat focus", slots: [C("squat"), C("push"), C("pull"), CORE] };
  const Hinge: TemplateDay = { focus: "Hinge focus", slots: [C("hinge"), C("push"), C("pull"), CORE] };
  const Press: TemplateDay = { focus: "Press focus", slots: [C("push"), C("squat"), C("pull"), A("isolation", "triceps")] };
  switch (days) {
    case 2:
      return [Squat, Hinge];
    case 3:
      return [Squat, Press, Hinge];
    case 4:
      return [Squat, Press, Hinge, { focus: "Pull focus", slots: [C("pull"), C("hinge"), A("pull", "middle back"), A("isolation", "biceps")] }];
    case 5:
      return [Squat, Press, Hinge, { focus: "Pull focus", slots: [C("pull"), C("hinge"), A("pull", "middle back"), CORE] }, Squat];
    default:
      return [Squat, Press, Hinge, Squat, Press, Hinge];
  }
}

// General / tone: balanced full-body (beginner) or upper/lower, moderate reps.
function generalDays(days: number, level: Level): TemplateDay[] {
  const FB: TemplateDay = { focus: "Full Body", slots: [C("squat"), C("push"), C("pull"), C("hinge"), CORE] };
  if (level === "beginner" || days <= 3) {
    return Array.from({ length: days }, (_, i) => ({ ...FB, focus: days > 1 ? `Full Body ${String.fromCharCode(65 + i)}` : "Full Body" }));
  }
  return muscleDays(days, level);
}

function templateFor(style: Style, days: number, level: Level): { split: string; days: TemplateDay[] } {
  let tdays: TemplateDay[];
  if (style === "fatloss") tdays = fatLossDays(days);
  else if (style === "muscle") tdays = muscleDays(days, level);
  else if (style === "strength") tdays = strengthDays(days, level);
  else tdays = generalDays(days, level);
  return { split: splitLabel(tdays, style), days: tdays };
}

function splitLabel(days: TemplateDay[], style: Style): string {
  const focuses = new Set(days.map((d) => d.focus.replace(/\s+[A-C]$/, "").replace(/ \+.*/, "")));
  if (style === "fatloss") return "Full-body + cardio + core";
  if (focuses.has("Push") || focuses.has("Pull") || focuses.has("Legs")) return "Push / Pull / Legs";
  if (focuses.has("Upper") || focuses.has("Lower")) return "Upper / Lower";
  return "Full Body";
}

// Focus-area bias: add extra volume to the chosen region (deterministic).
function applyFocusBias(days: TemplateDay[], focus: FocusArea): TemplateDay[] {
  if (focus === "full_body") return days;
  return days.map((d) => {
    const extra: Slot[] = [];
    if (focus === "glutes") extra.push(A("hinge", "glutes"), A("lunge", "glutes"));
    else if (focus === "lower_body") extra.push(C("squat"), A("hinge", "hamstrings"));
    else if (focus === "upper_body") extra.push(A("push", "chest"), A("pull", "middle back"));
    // keep days from getting huge
    const slots = [...d.slots, ...extra].slice(0, 8);
    return { ...d, slots };
  });
}

// --- sets / reps / rest -----------------------------------------------------

function isStaticCore(e: NormalizedExercise): boolean {
  return /\b(plank|hollow|bird ?dog|dead ?bug|hold|wall sit|side plank)\b/i.test(e.name);
}

function schemeFor(goal: WorkoutGoal, level: Level, role: Role, e: NormalizedExercise): { sets: number; reps: string; rest: number } {
  if (role === "cardio") return { sets: 1, reps: "10–20 min", rest: 0 };
  if (role === "core") {
    return isStaticCore(e) ? { sets: 3, reps: "20–45 sec", rest: 45 } : { sets: 3, reps: "12–20", rest: 45 };
  }
  const compound = role === "compound";
  if (goal === "build_strength" && level !== "beginner")
    return compound ? { sets: 5, reps: "4–6", rest: 150 } : { sets: 3, reps: "6–10", rest: 90 };
  if (goal === "gain_muscle" || goal === "gain_weight")
    return compound ? { sets: 4, reps: "6–10", rest: 90 } : { sets: 3, reps: "10–15", rest: 60 };
  if (goal === "lose_belly_fat" || goal === "lose_weight")
    return compound ? { sets: 3, reps: "10–12", rest: 60 } : { sets: 3, reps: "12–15", rest: 45 };
  if (level === "beginner") return compound ? { sets: 3, reps: "8–12", rest: 60 } : { sets: 3, reps: "10–15", rest: 45 };
  return compound ? { sets: 3, reps: "8–12", rest: 75 } : { sets: 3, reps: "10–15", rest: 60 };
}

const PROGRESSION: Record<Level, string> = {
  beginner: "Add 1 rep each session with clean form. When you hit the top of every set, add a little load or a harder variation.",
  intermediate: "Beat last session: add reps within the range, then a small load once you reach the top.",
  advanced: "Double progression with intent — push the last set close to (not to) failure and manage weekly fatigue.",
};

// --- selection --------------------------------------------------------------

function pickForSlot(
  slot: Slot,
  pool: NormalizedExercise[],
  usedWeek: Set<string>,
  usedDay: Set<string>
): NormalizedExercise | null {
  let cands = pool.filter((e) => e.movementPattern === slot.pattern);
  if (slot.muscle) {
    const byMuscle = cands.filter((e) => e.primaryMuscle === slot.muscle);
    if (byMuscle.length) cands = byMuscle; // don't empty the pool if the muscle is unavailable
  }
  if (slot.role === "compound") {
    const comp = cands.filter((e) => isCompoundPattern(e.movementPattern));
    if (comp.length) cands = comp;
  }
  cands = [...cands].sort((a, b) => a.name.localeCompare(b.name));
  const notDay = cands.filter((e) => !usedDay.has(e.id));
  return notDay.find((e) => !usedWeek.has(e.id)) ?? notDay[0] ?? null;
}

// 7-day layout with rests baked in for recovery.
function weekSchedule(days: number): boolean[] {
  const T = true;
  const R = false;
  switch (days) {
    case 2:
      return [T, R, R, T, R, R, R];
    case 3:
      return [T, R, T, R, T, R, R];
    case 4:
      return [T, T, R, T, T, R, R];
    case 5:
      return [T, T, T, R, T, T, R];
    case 6:
      return [T, T, T, R, T, T, T];
    default:
      return [T, R, T, R, T, R, R];
  }
}

// --- the generator ----------------------------------------------------------

export function buildWorkoutPlan(input: WorkoutInput, enriched: NormalizedExercise[]): WorkoutPlan {
  const focusArea = input.focusArea ?? "full_body";
  const flags = injuryFlags(input.injuriesNote);
  const conservative = isConservative(input, flags);
  const adjustments: string[] = [];

  // Clamp days; beginners are capped at 5 (6 needs intermediate+).
  let days = Math.max(2, Math.min(6, Math.round(input.daysPerWeek) || 3));
  if (input.level === "beginner" && days === 6) {
    days = 5;
    adjustments.push("6 days is a lot starting out — set to 5. You can do more once you're consistent.");
  }

  const style = styleForGoal(input.goal);
  const { split, days: rawTemplate } = templateFor(style, days, input.level);
  const template = applyFocusBias(rawTemplate, focusArea);

  const ctx = equipCtx(input);
  const pool = enriched.filter((e) => eligible(e, ctx, input, flags, conservative));

  const usedWeek = new Set<string>();
  const schedule = weekSchedule(days);
  const trainingFocuses = template; // one per training day, in order

  const out: PlanDay[] = [];
  let ti = 0;
  for (let i = 0; i < 7; i += 1) {
    if (!schedule[i]) {
      out.push({ name: `Day ${i + 1}`, focus: "Rest", isRest: true, exercises: [] });
      continue;
    }
    const tday = trainingFocuses[ti % trainingFocuses.length];
    ti += 1;

    const usedDay = new Set<string>();
    const built: PlanExercise[] = [];
    for (const slot of tday.slots) {
      const chosen = pickForSlot(slot, pool, usedWeek, usedDay);
      if (!chosen) continue; // skip a slot we can't fill safely (e.g. no-bar pulls)
      usedDay.add(chosen.id);
      usedWeek.add(chosen.id);
      built.push(makePlanExercise(chosen, slot.role, input.goal, input.level));
    }

    // Compounds first, then everything else (stable within group).
    const ordered = built
      .map((ex, idx) => ({ ex, idx }))
      .sort((a, b) => Number(b.ex.isCompound) - Number(a.ex.isCompound) || a.idx - b.idx)
      .map((x) => x.ex);

    out.push({ name: `Day ${i + 1}`, focus: tday.focus, isRest: false, warmup: WARMUP, exercises: ordered });
  }

  if (flags.size > 0) adjustments.push(`Adjusted around your note (${[...flags].join(", ")}) — riskier movements were left out.`);
  if (conservative && input.level === "beginner") adjustments.push("Kept impact low and movements simple while you build a base.");

  const summary = `Built for: ${LOCATION_LABEL[input.location]} · ${cap(input.level)} · ${
    ctx.bodyweightOnly ? "Bodyweight" : "With equipment"
  } · ${GOAL_LABEL[input.goal]} · ${FOCUS_LABEL[focusArea]} · ${days} days/week`;

  return {
    goal: input.goal,
    location: input.location,
    level: input.level,
    daysPerWeek: days,
    focusArea,
    split,
    summary,
    progressionNote: PROGRESSION[input.level],
    disclaimer: DISCLAIMER,
    bellyFatNote: input.goal === "lose_belly_fat" ? BELLY_FAT_NOTE : undefined,
    adjustments,
    days: out,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function makePlanExercise(e: NormalizedExercise, role: Role, goal: WorkoutGoal, level: Level): PlanExercise {
  const sc = schemeFor(goal, level, role, e);
  return {
    id: e.id,
    name: e.name,
    pattern: e.movementPattern,
    primaryMuscle: e.primaryMuscle,
    isCompound: isCompoundPattern(e.movementPattern),
    difficulty: e.normalizedDifficulty,
    equipment: e.normalizedEquipment,
    sets: sc.sets,
    reps: sc.reps,
    restSeconds: sc.rest,
    whyThisExercise: e.whyThisExercise,
    instructions: e.instructions,
    regression: e.regression,
    progression: e.progression,
    highImpact: e.highImpact,
    cautionTags: e.cautionTags,
  };
}

function roleForPattern(p: MovementPattern): Role {
  if (p === "core") return "core";
  if (p === "cardio") return "cardio";
  return isCompoundPattern(p) ? "compound" : "accessory";
}

/**
 * Phase 5 — directional swap. "easier"/"harder" move along a difficulty
 * continuum; "different" is a lateral swap at the same level.
 */
export type SwapDirection = "easier" | "different" | "harder";

const DIFF_RANK: Record<NormalizedDifficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * A coarse "how demanding is this exercise" score, used ONLY to order swaps
 * easier↔harder. Difficulty dominates; loadable equipment and impact add to it.
 * Deterministic and exported so the swap contract is unit-tested.
 */
export function loadScore(e: NormalizedExercise): number {
  let s = DIFF_RANK[e.normalizedDifficulty] * 4;
  if (e.highImpact) s += 1;
  if (e.requiresBarbell) s += 3;
  else if (e.requiresMachine || e.requiresCable || e.requiresDumbbell) s += 2;
  return s;
}

/**
 * Deterministic, context-safe swap: another eligible exercise of the SAME
 * movement pattern the user can actually do (never a pull-up without a bar, never
 * a gym machine at home, never above their level).
 *
 *  - "different": the next valid exercise at (preferably) the same difficulty.
 *  - "easier":   the closest valid exercise that is genuinely LESS demanding.
 *  - "harder":   the closest valid exercise that is genuinely MORE demanding.
 *
 * Returns null when nothing fits in that direction — e.g. a bodyweight beginner
 * asking "harder" has no tougher *different* movement available, so the UI falls
 * back to the per-exercise make-it-harder cue (which scales the SAME movement).
 */
export function swapPlanExercise(
  input: WorkoutInput,
  pattern: MovementPattern,
  currentId: string,
  excludeIds: string[],
  direction: SwapDirection,
  enriched: NormalizedExercise[]
): PlanExercise | null {
  const flags = injuryFlags(input.injuriesNote);
  const conservative = isConservative(input, flags);
  const ctx = equipCtx(input);
  const exclude = new Set(excludeIds);
  const pool = enriched.filter(
    (e) => e.movementPattern === pattern && !exclude.has(e.id) && eligible(e, ctx, input, flags, conservative)
  );
  if (!pool.length) return null;

  const current = enriched.find((e) => e.id === currentId);
  const currentScore = current ? loadScore(current) : null;

  let chosen: NormalizedExercise | null = null;
  if (direction === "different" || currentScore === null) {
    // Lateral: prefer the same difficulty band as the current move, else any.
    const byName = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    const same = currentScore === null ? [] : byName.filter((e) => loadScore(e) === currentScore);
    chosen = same[0] ?? byName[0];
  } else if (direction === "easier") {
    // Closest easier: highest score still strictly below the current one.
    chosen =
      pool
        .filter((e) => loadScore(e) < currentScore)
        .sort((a, b) => loadScore(b) - loadScore(a) || a.name.localeCompare(b.name))[0] ?? null;
  } else {
    // Closest harder: lowest score still strictly above the current one.
    chosen =
      pool
        .filter((e) => loadScore(e) > currentScore)
        .sort((a, b) => loadScore(a) - loadScore(b) || a.name.localeCompare(b.name))[0] ?? null;
  }

  if (!chosen) return null;
  return makePlanExercise(chosen, roleForPattern(pattern), input.goal, input.level);
}
