import {
  filterExercises,
  type Category,
  type Exercise,
  type Equipment,
  type Force,
  type Level,
  type Mechanic,
  type MuscleGroup,
} from "./exerciseDb.ts";
import type { ExperienceLevel, TrainingEmphasis, TrainingSetup } from "./trainingSetup";

/**
 * Workout rebuild — Phase 3: the deterministic program generator.
 *
 * Program logic should be reviewed by a qualified coach before public launch.
 *
 * 100% deterministic + pure: given the user's setup + emphasis + the exercise
 * list, it returns a structured weekly program. There is NO AI here — exercises
 * are SELECTED (never invented) from the vendored database via the Phase 1
 * filter. The AI layer (Phase 5) only swaps/adjusts within these same results.
 *
 * The exercise list is injected (not imported) so this module stays unit
 * testable under `node --test` without the bundler-style JSON import. App code
 * calls generateProgram(setup, emphasis, ALL_EXERCISES).
 */

export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "lunge"
  | "core"
  | "biceps"
  | "triceps"
  | "shoulders_iso"
  | "glutes"
  | "calves";

export type DayFocus = "full" | "upper" | "lower" | "push" | "pull" | "legs";

export interface ProgramExercise {
  exerciseId: string;
  name: string;
  pattern: MovementPattern;
  isCompound: boolean;
  sets: number;
  repRange: string;
  restSeconds: number;
  targetMuscles: MuscleGroup[];
  note?: string; // beginner-only "why this movement" + form cue
}

export interface ProgramDay {
  name: string; // "Day 1"…"Day 7"
  focus: string; // display label, e.g. "Full Body A", "Push", "Rest"
  isRest: boolean;
  warmup?: string;
  exercises: ProgramExercise[];
}

export interface WeeklyProgram {
  level: ExperienceLevel;
  emphasis: TrainingEmphasis;
  daysPerWeek: number;
  split: string;
  progression: string;
  disclaimer: string;
  adjustedForInjuries: string[];
  days: ProgramDay[]; // always length 7 (rest days included)
}

// --- exercise selection specs ---------------------------------------------

const PATTERN_SPEC: Record<
  MovementPattern,
  { muscles: MuscleGroup[]; mechanic?: Mechanic; force?: Force; compound: boolean }
> = {
  squat: { muscles: ["quadriceps"], mechanic: "compound", compound: true },
  hinge: { muscles: ["hamstrings", "glutes"], mechanic: "compound", compound: true },
  horizontal_push: { muscles: ["chest"], mechanic: "compound", force: "push", compound: true },
  vertical_push: { muscles: ["shoulders"], mechanic: "compound", force: "push", compound: true },
  horizontal_pull: { muscles: ["middle back", "lats"], mechanic: "compound", force: "pull", compound: true },
  vertical_pull: { muscles: ["lats"], mechanic: "compound", force: "pull", compound: true },
  lunge: { muscles: ["quadriceps", "glutes"], mechanic: "compound", compound: true },
  core: { muscles: ["abdominals"], compound: false },
  biceps: { muscles: ["biceps"], mechanic: "isolation", compound: false },
  triceps: { muscles: ["triceps"], mechanic: "isolation", compound: false },
  shoulders_iso: { muscles: ["shoulders"], mechanic: "isolation", compound: false },
  glutes: { muscles: ["glutes"], mechanic: "isolation", compound: false },
  calves: { muscles: ["calves"], compound: false },
};

// Keep auto-selection to sane resistance-training categories (no plyometrics /
// olympic lifts / stretches in an auto plan).
const ALLOWED_CATEGORIES: Category[] = ["strength", "powerlifting"];

const PATTERN_NOTE: Record<MovementPattern, string> = {
  squat: "Builds your legs and core. Chest up, push through your heels.",
  hinge: "Strengthens hamstrings and glutes. Hinge at the hips, keep your back flat.",
  horizontal_push: "Works chest, shoulders and triceps. Lower under control, full range.",
  vertical_push: "Builds strong shoulders. Brace your core, don't overarch.",
  horizontal_pull: "Strengthens upper back and posture. Pull with your elbows, squeeze.",
  vertical_pull: "Back width and grip. Pull your chest toward the bar.",
  lunge: "Single-leg strength and balance. Don't let the knee cave in.",
  core: "Trains your midsection to brace and protect your spine.",
  biceps: "Arm accessory. Slow, controlled reps beat heavy swinging.",
  triceps: "Arm accessory that also helps your pressing.",
  shoulders_iso: "Shoulder accessory for balanced, healthy delts.",
  glutes: "Glute accessory for hips and posture.",
  calves: "Calf accessory — full range, brief pause at the top.",
};

const ALL_EQUIPMENT: Equipment[] = [
  "body only",
  "dumbbell",
  "barbell",
  "kettlebells",
  "cable",
  "machine",
  "bands",
  "medicine ball",
  "exercise ball",
  "e-z curl bar",
];

// --- equipment + level resolution -----------------------------------------

export function resolveEquipment(setup: TrainingSetup): Equipment[] {
  // A gym (or home+gym) gives the full toolbox.
  if (setup.trainingLocation === "gym" || setup.trainingLocation === "both") return ALL_EQUIPMENT;
  if (!setup.hasEquipment) return ["body only"];

  const eq = new Set<Equipment>(["body only"]);
  for (const item of setup.equipment) {
    if (item === "dumbbells") eq.add("dumbbell");
    else if (item === "bands") eq.add("bands");
    else if (item === "kettlebell") eq.add("kettlebells");
    else if (item === "barbell_rack") {
      eq.add("barbell");
      eq.add("e-z curl bar");
    } else if (item === "machines") {
      eq.add("machine");
      eq.add("cable");
    }
    // "bench" / "pullup_bar" have no distinct dataset equipment value (a bench
    // just enables existing dumbbell/barbell work; pull-ups read as "body only").
  }
  return [...eq];
}

function allowedLevels(level: ExperienceLevel): Level[] {
  if (level === "beginner") return ["beginner"]; // form-first, keep it simple
  if (level === "intermediate") return ["beginner", "intermediate"];
  return ["beginner", "intermediate", "expert"]; // advanced: everything
}

function canDoPullups(setup: TrainingSetup): boolean {
  return setup.trainingLocation !== "home" || setup.equipment.includes("pullup_bar");
}

// --- splits ----------------------------------------------------------------

function splitForDays(level: ExperienceLevel, days: number): DayFocus[] {
  if (level === "beginner") {
    // No PPL / bro-splits for beginners — full body & upper/lower only.
    switch (days) {
      case 2:
        return ["full", "full"];
      case 3:
        return ["full", "full", "full"];
      case 4:
        return ["upper", "lower", "upper", "lower"];
      case 5:
        return ["upper", "lower", "full", "upper", "lower"];
      default:
        return ["upper", "lower", "full", "upper", "lower", "full"]; // 6
    }
  }
  // intermediate + advanced share structure; volume/level differ.
  switch (days) {
    case 2:
      return ["upper", "lower"];
    case 3:
      return ["push", "pull", "legs"];
    case 4:
      return ["upper", "lower", "upper", "lower"];
    case 5:
      return ["push", "pull", "legs", "upper", "lower"];
    default:
      return ["push", "pull", "legs", "push", "pull", "legs"]; // 6
  }
}

// A 7-day layout (true = train) with rest days baked in for recovery.
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

function buildSlots(focus: DayFocus, level: ExperienceLevel): MovementPattern[] {
  const adv = level === "advanced";
  const inter = level !== "beginner";

  switch (focus) {
    case "full": {
      const s: MovementPattern[] = ["squat", "horizontal_push", "horizontal_pull", "hinge"];
      if (inter) s.push("vertical_push");
      s.push("core");
      if (adv) s.push("biceps");
      return s;
    }
    case "upper": {
      const s: MovementPattern[] = ["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"];
      if (inter) s.push("biceps", "triceps");
      if (adv) s.push("shoulders_iso");
      return s;
    }
    case "lower":
    case "legs": {
      const s: MovementPattern[] = ["squat", "hinge", "lunge", "calves", "core"];
      if (adv) s.push("glutes");
      return s;
    }
    case "push": {
      const s: MovementPattern[] = ["horizontal_push", "vertical_push", "triceps"];
      if (inter) s.push("shoulders_iso");
      if (adv) s.push("triceps");
      return s;
    }
    case "pull": {
      const s: MovementPattern[] = ["vertical_pull", "horizontal_pull", "biceps"];
      if (adv) s.push("shoulders_iso", "biceps");
      return s;
    }
  }
}

// --- sets / reps / rest ----------------------------------------------------

interface SetScheme {
  sets: number;
  repRange: string;
  restSeconds: number;
}

function schemeFor(
  level: ExperienceLevel,
  emphasis: TrainingEmphasis,
  isCompound: boolean,
  isStatic: boolean
): SetScheme {
  if (isStatic) return { sets: 3, repRange: "20–45 sec", restSeconds: 45 };

  // Beginners: simple and form-first, regardless of emphasis.
  if (level === "beginner") {
    return isCompound ? { sets: 3, repRange: "8–12", restSeconds: 60 } : { sets: 3, repRange: "10–15", restSeconds: 45 };
  }

  switch (emphasis) {
    case "strength":
      return isCompound
        ? { sets: 5, repRange: "4–6", restSeconds: 150 }
        : { sets: 3, repRange: "8–12", restSeconds: 75 };
    case "muscleGain":
      return isCompound
        ? { sets: 4, repRange: "6–10", restSeconds: 90 }
        : { sets: 3, repRange: "10–15", restSeconds: 60 };
    case "fatLoss":
      return isCompound
        ? { sets: 3, repRange: "10–12", restSeconds: 60 }
        : { sets: 3, repRange: "12–15", restSeconds: 45 };
    default: // general
      return isCompound
        ? { sets: 4, repRange: "8–12", restSeconds: 90 }
        : { sets: 3, repRange: "10–15", restSeconds: 60 };
  }
}

// --- injuries --------------------------------------------------------------

interface InjuryFilter {
  nameRe: RegExp | null;
  muscles: Set<MuscleGroup>;
  patterns: Set<MovementPattern>;
  notes: string[];
}

const INJURY_RULES: {
  test: RegExp;
  names?: RegExp;
  muscles?: MuscleGroup[];
  patterns?: MovementPattern[];
  note: string;
}[] = [
  {
    test: /knee/i,
    names: /(lunge|jump|pistol|sissy|skater|box)/i,
    patterns: ["lunge"],
    note: "Eased load on the knees (less deep-knee and jumping work).",
  },
  {
    test: /(back|spine|disc|hernia|lumbar)/i,
    names: /(deadlift|good ?morning|bent[- ]?over|clean|snatch)/i,
    muscles: ["lower back"],
    note: "Reduced lower-back strain (gentler hinging and spinal loading).",
  },
  {
    test: /(shoulder|rotator)/i,
    names: /(overhead|military|behind[- ]?the[- ]?neck|upright row|push press|snatch|jerk)/i,
    patterns: ["vertical_push"],
    note: "Gentler on the shoulders (limited overhead pressing).",
  },
  {
    test: /(wrist|elbow)/i,
    names: /(skullcrusher|skull crusher|dips?)/i,
    note: "Reduced strain on the wrists/elbows.",
  },
];

function buildInjuryFilter(note: string): InjuryFilter {
  const f: InjuryFilter = { nameRe: null, muscles: new Set(), patterns: new Set(), notes: [] };
  if (!note.trim()) return f;

  const nameParts: string[] = [];
  for (const rule of INJURY_RULES) {
    if (!rule.test.test(note)) continue;
    f.notes.push(rule.note);
    if (rule.names) nameParts.push(rule.names.source);
    rule.muscles?.forEach((m) => f.muscles.add(m));
    rule.patterns?.forEach((p) => f.patterns.add(p));
  }
  if (nameParts.length) f.nameRe = new RegExp(nameParts.join("|"), "i");
  return f;
}

function passesInjury(ex: Exercise, injury: InjuryFilter): boolean {
  if (injury.nameRe && injury.nameRe.test(ex.name)) return false;
  if (ex.primaryMuscles.some((m) => injury.muscles.has(m))) return false;
  return true;
}

// --- selection -------------------------------------------------------------

interface SelectCtx {
  equipment: Equipment[];
  levels: Level[];
  injury: InjuryFilter;
}

function pickUnused(candidates: Exercise[], used: Set<string>, offset: number): Exercise {
  for (let i = 0; i < candidates.length; i += 1) {
    const ex = candidates[(offset + i) % candidates.length];
    if (!used.has(ex.id)) return ex;
  }
  return candidates[offset % candidates.length];
}

function selectExercise(
  all: Exercise[],
  pattern: MovementPattern,
  ctx: SelectCtx,
  used: Set<string>,
  offset: number
): Exercise | null {
  const spec = PATTERN_SPEC[pattern];

  // Progressive relaxation so a slot still fills from whatever equipment exists.
  const attempts = [
    { equipment: ctx.equipment, level: ctx.levels, muscleGroups: spec.muscles, mechanic: spec.mechanic, category: ALLOWED_CATEGORIES },
    { equipment: ctx.equipment, level: ctx.levels, muscleGroups: spec.muscles, mechanic: spec.mechanic },
    { equipment: ctx.equipment, level: ctx.levels, muscleGroups: spec.muscles },
    { equipment: ctx.equipment, level: ctx.levels, muscleGroups: spec.muscles, includeSecondaryMuscles: true },
  ];

  for (const f of attempts) {
    let cands = filterExercises(all, f);

    // Prefer the intended force direction, but don't let it empty the slot.
    if (spec.force) {
      const byForce = cands.filter((e) => e.force === spec.force);
      if (byForce.length) cands = byForce;
    }

    // Injury filtering — fall back to unfiltered if it would empty the slot.
    const safe = cands.filter((e) => passesInjury(e, ctx.injury));
    if (safe.length) cands = safe;

    if (cands.length === 0) continue;

    cands = [...cands].sort((a, b) => a.name.localeCompare(b.name));
    return pickUnused(cands, used, offset);
  }
  return null;
}

// --- progression text ------------------------------------------------------

const PROGRESSION: Record<ExperienceLevel, string> = {
  beginner:
    "Add 1 rep each session with clean form. When you hit the top of the range on every set, add a little load or move to a harder variation.",
  intermediate:
    "Beat last session: add reps within the range, then add a small load once you reach the top. Small, steady weekly jumps.",
  advanced:
    "Double progression with intent: push the last set close to (not to) failure, rotate variations, and manage fatigue across the week.",
};

const WARMUP = "5 min easy cardio + 1–2 light warm-up sets on your first big lift.";

const DISCLAIMER =
  "This is a general starting plan, not medical advice. Stop if anything hurts and see a qualified professional for pain or medical conditions.";

// --- labels ----------------------------------------------------------------

const FOCUS_LABEL: Record<DayFocus, string> = {
  full: "Full Body",
  upper: "Upper",
  lower: "Lower",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

function splitLabel(focuses: DayFocus[]): string {
  const set = new Set(focuses);
  const hasPPL = set.has("push") || set.has("pull") || set.has("legs");
  const hasUL = set.has("upper") || set.has("lower");
  if (set.size === 1 && set.has("full")) return "Full Body";
  if (hasPPL && hasUL) return "PPL + Upper/Lower";
  if (hasPPL) return "Push / Pull / Legs";
  if (hasUL) return "Upper / Lower";
  return "Custom";
}

// --- the generator ---------------------------------------------------------

export function generateProgram(
  setup: TrainingSetup,
  emphasis: TrainingEmphasis,
  exercises: Exercise[]
): WeeklyProgram {
  const focuses = splitForDays(setup.experienceLevel, setup.trainingDaysPerWeek);
  const schedule = weekSchedule(setup.trainingDaysPerWeek);
  const equipment = resolveEquipment(setup);
  const levels = allowedLevels(setup.experienceLevel);
  const injury = buildInjuryFilter(setup.injuriesNote);
  const pullups = canDoPullups(setup);

  const ctx: SelectCtx = { equipment, levels, injury };

  // For A/B/C suffixing when a focus repeats in the week.
  const totals: Partial<Record<DayFocus, number>> = {};
  for (const f of focuses) totals[f] = (totals[f] ?? 0) + 1;
  const running: Partial<Record<DayFocus, number>> = {};

  // Vary exercise choices across same-focus days; track per-program usage too.
  const used = new Set<string>();

  const days: ProgramDay[] = [];
  let focusIdx = 0;
  let trainingCount = 0;

  for (let i = 0; i < 7; i += 1) {
    if (!schedule[i]) {
      days.push({ name: `Day ${i + 1}`, focus: "Rest", isRest: true, exercises: [] });
      continue;
    }

    const focus = focuses[focusIdx];
    focusIdx += 1;
    trainingCount += 1;
    running[focus] = (running[focus] ?? 0) + 1;
    const suffix = (totals[focus] ?? 0) > 1 ? ` ${String.fromCharCode(64 + (running[focus] ?? 1))}` : "";

    // Build the day's movement slots, drop injury-excluded patterns, and swap
    // pull-ups for a horizontal pull if there's no bar.
    let slots = buildSlots(focus, setup.experienceLevel).filter((p) => !injury.patterns.has(p));
    if (!pullups) slots = slots.map((p) => (p === "vertical_pull" ? "horizontal_pull" : p));

    const usedInDay = new Set<string>();
    const built: ProgramExercise[] = [];

    slots.forEach((pattern, slotIndex) => {
      const ex = selectExercise(exercises, pattern, ctx, usedInDay, trainingCount + slotIndex);
      if (!ex) return;
      usedInDay.add(ex.id);
      used.add(ex.id);

      const isCompound = ex.mechanic === "compound";
      const isStatic = ex.force === "static";
      const scheme = schemeFor(setup.experienceLevel, emphasis, isCompound, isStatic);

      built.push({
        exerciseId: ex.id,
        name: ex.name,
        pattern,
        isCompound,
        sets: scheme.sets,
        repRange: scheme.repRange,
        restSeconds: scheme.restSeconds,
        targetMuscles: ex.primaryMuscles,
        note: setup.experienceLevel === "beginner" ? PATTERN_NOTE[pattern] : undefined,
      });
    });

    // Guarantee compounds-first ordering regardless of any fallback selections.
    const ordered = built
      .map((ex, idx) => ({ ex, idx }))
      .sort((a, b) => Number(b.ex.isCompound) - Number(a.ex.isCompound) || a.idx - b.idx)
      .map((x) => x.ex);

    days.push({
      name: `Day ${i + 1}`,
      focus: `${FOCUS_LABEL[focus]}${suffix}`,
      isRest: false,
      warmup: WARMUP,
      exercises: ordered,
    });
  }

  return {
    level: setup.experienceLevel,
    emphasis,
    daysPerWeek: setup.trainingDaysPerWeek,
    split: splitLabel(focuses),
    progression: PROGRESSION[setup.experienceLevel],
    disclaimer: DISCLAIMER,
    adjustedForInjuries: injury.notes,
    days,
  };
}
