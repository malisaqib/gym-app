import type { Exercise, MuscleGroup } from "./exerciseDb.ts";

/**
 * Workout rebuild — Phase 1: deterministic ENRICHMENT layer over the raw
 * free-exercise-db records. We NEVER edit data/exercises.json; instead we derive
 * app-level, safety-aware fields in code.
 *
 * Root cause this fixes: the raw tags are too coarse. A pull-up is tagged
 * equipment "body only" + level "beginner", so a naive equipment/level filter
 * lets it through for a home/bodyweight/beginner user. Here we derive
 * `requiresPullupBar`, real difficulty, `homeBodyweightSafe`, impact, cautions,
 * movement pattern, etc., so the generator (Phase 3) can select SAFELY.
 *
 * Pure + deterministic + unit-tested. No AI, no I/O.
 */

export type NormalizedDifficulty = "beginner" | "intermediate" | "advanced";
export type MovementPattern =
  | "push"
  | "pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "cardio"
  | "mobility"
  | "carry"
  | "isolation";
export type NormalizedEquipment =
  | "bodyweight"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "cable"
  | "machine"
  | "bands"
  | "ball"
  | "foam roller"
  | "pullup bar"
  | "other";
export type Location = "home" | "gym" | "both";
export type GoalTag =
  | "fat_loss"
  | "belly_fat"
  | "muscle_gain"
  | "strength"
  | "tone"
  | "general_fitness"
  | "mobility";
export type CautionTag = "knee" | "back" | "shoulder" | "wrist";
export type ExerciseTier = 1 | 2 | 3;

export interface NormalizedExercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup | null;
  secondaryMuscles: MuscleGroup[];
  instructions: string[];
  rawLevel: Exercise["level"];
  normalizedDifficulty: NormalizedDifficulty;
  tier: ExerciseTier;
  rawEquipment: Exercise["equipment"];
  normalizedEquipment: NormalizedEquipment;
  location: Location;
  movementPattern: MovementPattern;
  goalTags: GoalTag[];
  requiresPullupBar: boolean;
  requiresMachine: boolean;
  requiresCable: boolean;
  requiresBarbell: boolean;
  requiresDumbbell: boolean;
  requiresBench: boolean;
  beginnerSafe: boolean;
  homeBodyweightSafe: boolean;
  highImpact: boolean;
  cautionTags: CautionTag[];
  regression: string;
  progression: string;
  whyThisExercise: string;
}

// --- name pattern signals (the dataset tags aren't enough; names carry intent) -
const RE_PULLUP_BAR = /\b(pull[- ]?ups?|chin[- ]?ups?|v[- ]?bar|muscle[- ]?ups?)\b|\bhang(ing)?\b|toes[- ]?to[- ]?bar/i;
const RE_ADVANCED = /\b(muscle[- ]?up|planche|one[- ]?arm|single[- ]?arm|pistol|handstand|front lever|back lever|human flag|iron cross|sissy|nordic|dragon flag|l[- ]?sit|skin the cat)\b/i;
const RE_HIGH_IMPACT = /\b(jump|jumping|burpee|box jump|hop|bound|plyo|skater|tuck|broad jump|depth jump|jumping jack|star jump)\b/i;
const RE_LUNGE = /\b(lunges?|split squats?|step[- ]?ups?)\b/i;
const RE_SQUAT = /\b(squats?|leg press(es)?)\b/i;
const RE_HINGE = /\b(deadlifts?|romanian|rdl|good ?mornings?|hip thrusts?|glute bridges?|swings?|hyperextensions?|back extensions?|pull[- ]?throughs?)\b/i;
const RE_CORE = /\b(plank|crunch|sit[- ]?ups?|dead ?bug|bird ?dog|leg raise|hollow|russian twist|mountain climber|wood ?chop|oblique|toes[- ]?to[- ]?bar|knee raise)\b/i;
const RE_CARRY = /\b(carry|farmer|yoke|suitcase|waiter)\b/i;

// --- TIER signals (Phase 1) -------------------------------------------------
// TIER is "fundamental vs novelty" and is SEPARATE from difficulty/level: a lift
// the dataset tags "beginner" (e.g. Barbell Bench Press) is still a Tier-1
// fundamental and stays eligible at every level. Tier drives eligibility +
// priority (Phase 2 selector); level is only a soft ranking preference.
//   Tier 1 — fundamental barbell/dumbbell/cable/machine lifts (always preferred)
//   Tier 2 — standard accessories (flyes, raises, curls, pushdowns, leg curl…)
//   Tier 3 — novelty / obscure / sport-specific (alternating, bounds, atlas
//            stones, olympic lifts, plyo) — never in the default plan; reachable
//            only via an explicit "Different" swap.
const RE_NOVELTY =
  /\b(alternat(e|ing)|bound|diagonal|around the worlds?|anti[- ]?gravity|clock|car drivers?|atlas|tire|sledge|zercher|sandbag|behind the neck|guillotine|renegade|kipping|jumps?|skater|burpee|windmill|turkish|get[- ]?ups?|muscle[- ]?ups?|planche|front lever|back lever|human flag|iron cross|skin the cat|flag|plyo)\b/i;
const RE_FUNDAMENTAL =
  /\b(bench press|incline (bench press|press|dumbbell press|barbell press)|decline (press|bench press)|chest press|dumbbell bench press|overhead press|shoulder press|military press|arnold press|push press|lat ?pulldown|pulldown|pull[- ]?ups?|chin[- ]?ups?|seated (cable )?rows?|bent[- ]?over rows?|barbell rows?|dumbbell rows?|t[- ]?bar rows?|pendlay rows?|machine rows?|squats?|front squats?|hack squats?|leg press|deadlifts?|romanian deadlifts?|rdl|hip thrusts?|good ?mornings?|dips?|push[- ]?ups?)\b/i;
const RE_ACCESSORY =
  /\b(flye?|lateral raise|side raise|rear delt|reverse fly|face pull|curls?|push[- ]?downs?|triceps?|skull ?crushers?|extensions?|leg curls?|leg extensions?|calf raises?|shrugs?|pull[- ]?overs?|kickbacks?|crossovers?|pec deck|raises?)\b/i;

const LEG_MUSCLES = new Set(["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"]);
// A real "pull" trains the back/arms. The dataset tags many ab/leg-raise moves
// (Flutter Kicks, Leg Pull-In, Hip Circles) as force:"pull"; those are NOT back
// work and must never land in a back/pull slot — they're routed to core instead.
const BACK_PULL_MUSCLES = new Set(["lats", "middle back", "traps", "lower back", "shoulders", "biceps", "forearms"]);

function normalizedEquipmentOf(raw: Exercise, requiresPullupBar: boolean): NormalizedEquipment {
  if (requiresPullupBar) return "pullup bar";
  switch (raw.equipment) {
    case "body only":
      return "bodyweight";
    case "dumbbell":
      return "dumbbell";
    case "barbell":
    case "e-z curl bar":
      return "barbell";
    case "kettlebells":
      return "kettlebell";
    case "cable":
      return "cable";
    case "machine":
      return "machine";
    case "bands":
      return "bands";
    case "medicine ball":
    case "exercise ball":
      return "ball";
    case "foam roll":
      return "foam roller";
    default:
      return "other";
  }
}

function movementPatternOf(raw: Exercise, lower: string): MovementPattern {
  if (raw.category === "cardio") return "cardio";
  if (raw.category === "stretching" || raw.equipment === "foam roll") return "mobility";
  if (RE_CARRY.test(lower)) return "carry";
  if (raw.primaryMuscles[0] === "abdominals" || RE_CORE.test(lower)) return "core";
  if (RE_LUNGE.test(lower)) return "lunge";
  if (RE_SQUAT.test(lower)) return "squat";
  if (RE_HINGE.test(lower)) return "hinge";
  // Plyometric leg drills (jumps/bounds) are squat/hinge-pattern explosions, NOT
  // presses — without this, force:"push" routes a leg bound into the chest pool.
  if (raw.category === "plyometrics" && LEG_MUSCLES.has(raw.primaryMuscles[0] ?? "")) {
    return /\b(deadlift|swing|hip|glute|good ?morning)\b/i.test(lower) ? "hinge" : "squat";
  }
  if (raw.mechanic === "compound") {
    if (raw.force === "push") return "push";
    if (raw.force === "pull") return pullPatternFor(raw.primaryMuscles[0]);
  }
  if (raw.mechanic === "isolation") return "isolation";
  if (raw.force === "push") return "push";
  if (raw.force === "pull") return pullPatternFor(raw.primaryMuscles[0]);
  return "isolation";
}

// A "pull" is only a real back/arm pull. A pull-forced move targeting any other
// muscle (a leg-raise / hip move mis-tagged force:"pull") is core work, NOT back.
function pullPatternFor(primaryMuscle: string | undefined): MovementPattern {
  return BACK_PULL_MUSCLES.has(primaryMuscle ?? "") ? "pull" : "core";
}

function cautionTagsOf(raw: Exercise, lower: string): CautionTag[] {
  const tags = new Set<CautionTag>();
  if (/\b(lunge|jump|pistol|sissy|skater|box jump|step[- ]?up|deep squat|split squat|hop)\b/i.test(lower)) tags.add("knee");
  if (
    raw.primaryMuscles.includes("lower back") ||
    /\b(deadlift|good ?morning|bent[- ]?over|clean|snatch|hyperextension|sit[- ]?ups?|leg raise|toes[- ]?to[- ]?bar|romanian)\b/i.test(lower)
  )
    tags.add("back");
  if (/\b(overhead|military|behind the neck|upright row|dips?|snatch|jerk|push press|handstand|pull[- ]?ups?|chin[- ]?ups?|muscle[- ]?ups?)\b/i.test(lower)) tags.add("shoulder");
  if (/\b(plank|push[- ]?ups?|handstand|planche|front lever|mountain climber|burpee)\b/i.test(lower)) tags.add("wrist");
  return [...tags];
}

/**
 * Fundamental (1) vs accessory (2) vs novelty/obscure (3). Deterministic, from
 * name + category only. NOTE: independent of difficulty/level — a "beginner"-
 * tagged Barbell Bench Press is Tier 1.
 */
function deriveTier(raw: Exercise, lower: string): ExerciseTier {
  // Sport-specific / explosive categories aren't default-plan material.
  if (raw.category === "strongman" || raw.category === "olympic weightlifting" || raw.category === "plyometrics") return 3;
  // Cardio fundamentals stay eligible for the cardio slot (checked before the
  // novelty rule so a cardio move is never mistaken for novelty); mobility is neutral.
  if (raw.category === "cardio") return 1;
  if (RE_NOVELTY.test(lower)) return 3;
  if (raw.category === "stretching" || raw.equipment === "foam roll") return 2;
  if (RE_FUNDAMENTAL.test(lower)) return 1;
  if (RE_ACCESSORY.test(lower)) return 2;
  return 2;
}

function goalTagsOf(pattern: MovementPattern): GoalTag[] {
  switch (pattern) {
    case "mobility":
      return ["mobility"];
    case "cardio":
      return ["fat_loss", "belly_fat", "general_fitness"];
    case "core":
      return ["belly_fat", "tone", "general_fitness"];
    case "isolation":
      return ["muscle_gain", "tone", "general_fitness"];
    default: // squat / hinge / lunge / push / pull / carry — compounds
      return ["muscle_gain", "strength", "tone", "fat_loss", "general_fitness"];
  }
}

const REGRESSION: Record<MovementPattern, string> = {
  push: "Make it easier: drop to your knees or push against a wall / incline.",
  pull: "Make it easier: use a band, or row at a higher (more upright) angle.",
  squat: "Make it easier: sit back to a chair / box and reduce the depth.",
  hinge: "Make it easier: shorten the range and keep the load light.",
  lunge: "Make it easier: hold a support, reduce depth, or do step-ups.",
  core: "Make it easier: shorten the hold or do fewer reps.",
  cardio: "Make it easier: slow the pace or march in place.",
  mobility: "Make it easier: reduce the range and move slowly.",
  carry: "Make it easier: use a lighter load over a shorter distance.",
  isolation: "Make it easier: reduce the load and the reps.",
};
const PROGRESSION: Record<MovementPattern, string> = {
  push: "Make it harder: elevate your feet, slow the tempo, or add load.",
  pull: "Make it harder: lower the angle, add a pause, or add load.",
  squat: "Make it harder: add load (goblet) or a pause at the bottom.",
  hinge: "Make it harder: add load and a slow lowering phase.",
  lunge: "Make it harder: add load or increase the step length.",
  core: "Make it harder: extend the hold or add a slow, controlled movement.",
  cardio: "Make it harder: raise the pace or the incline.",
  mobility: "Make it harder: increase the range gradually.",
  carry: "Make it harder: heavier load or longer distance.",
  isolation: "Make it harder: add load or slow the tempo.",
};
const WHY: Record<MovementPattern, string> = {
  push: "Builds pressing strength in your chest, shoulders and triceps.",
  pull: "Strengthens your back and improves posture.",
  squat: "Builds lower-body strength through your quads and glutes.",
  hinge: "Strengthens hamstrings, glutes and lower back the safe way.",
  lunge: "Single-leg strength and balance for everyday movement.",
  core: "Trains your midsection to brace and protect your spine.",
  cardio: "Raises your heart rate to support overall fat loss and conditioning.",
  mobility: "Improves mobility so you move and recover better.",
  carry: "Builds full-body stability and a strong grip.",
  isolation: "Targets the muscle directly to build and shape it.",
};

/** Derive the app-level, safety-aware fields for ONE raw exercise. Pure. */
export function normalizeExercise(raw: Exercise): NormalizedExercise {
  const lower = raw.name.toLowerCase();

  const requiresPullupBar = RE_PULLUP_BAR.test(lower);
  const requiresMachine = raw.equipment === "machine";
  const requiresCable = raw.equipment === "cable";
  const requiresBarbell = raw.equipment === "barbell" || raw.equipment === "e-z curl bar";
  const requiresDumbbell = raw.equipment === "dumbbell";
  // A bench is needed for "bench" moves, and incline/decline work UNLESS it's a
  // bodyweight incline (which can use stairs/a couch at home).
  const requiresBench = /\bbench\b/i.test(lower) || (/(incline|decline)/i.test(lower) && raw.equipment !== "body only");

  const normalizedEquipment = normalizedEquipmentOf(raw, requiresPullupBar);
  const location: Location = requiresMachine || requiresCable || requiresBarbell ? "gym" : "both";

  // Real difficulty: start from raw level, then correct known mislabels. Advanced
  // skill moves are advanced even if tagged "body only"/"beginner"; pull-up family
  // is never true-beginner-safe.
  let normalizedDifficulty: NormalizedDifficulty = raw.level === "expert" ? "advanced" : raw.level;
  if (RE_ADVANCED.test(lower)) normalizedDifficulty = "advanced";
  else if (requiresPullupBar && normalizedDifficulty === "beginner") normalizedDifficulty = "intermediate";

  const beginnerSafe = normalizedDifficulty === "beginner";
  // Can a no-equipment home user do it? Equipment-only gate (difficulty handled
  // separately by beginnerSafe). Pull-up/bench moves are NOT bodyweight-safe.
  const homeBodyweightSafe = raw.equipment === "body only" && !requiresPullupBar && !requiresBench;

  const movementPattern = movementPatternOf(raw, lower);
  const highImpact = raw.category === "plyometrics" || RE_HIGH_IMPACT.test(lower);
  const cautionTags = cautionTagsOf(raw, lower);
  const primaryMuscle = raw.primaryMuscles[0] ?? null;

  const whyThisExercise =
    movementPattern === "isolation" && primaryMuscle
      ? `Targets your ${primaryMuscle} directly to build and shape it.`
      : WHY[movementPattern];

  return {
    id: raw.id,
    name: raw.name,
    primaryMuscle,
    secondaryMuscles: raw.secondaryMuscles,
    instructions: raw.instructions,
    rawLevel: raw.level,
    normalizedDifficulty,
    tier: deriveTier(raw, lower),
    rawEquipment: raw.equipment,
    normalizedEquipment,
    location,
    movementPattern,
    goalTags: goalTagsOf(movementPattern),
    requiresPullupBar,
    requiresMachine,
    requiresCable,
    requiresBarbell,
    requiresDumbbell,
    requiresBench,
    beginnerSafe,
    homeBodyweightSafe,
    highImpact,
    cautionTags,
    regression: REGRESSION[movementPattern],
    progression: PROGRESSION[movementPattern],
    whyThisExercise,
  };
}

/** Enrich a whole list (the generator will call this once over ALL_EXERCISES). */
export function enrichExercises(list: Exercise[]): NormalizedExercise[] {
  return list.map(normalizeExercise);
}
