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

export interface NormalizedExercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup | null;
  secondaryMuscles: MuscleGroup[];
  instructions: string[];
  rawLevel: Exercise["level"];
  normalizedDifficulty: NormalizedDifficulty;
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
const RE_LUNGE = /\b(lunge|split squat|step[- ]?up)\b/i;
const RE_SQUAT = /\bsquat\b/i;
const RE_HINGE = /\b(deadlift|romanian|rdl|good ?morning|hip thrust|glute bridge|swing|hyperextension|back extension|pull[- ]?through)\b/i;
const RE_CORE = /\b(plank|crunch|sit[- ]?ups?|dead ?bug|bird ?dog|leg raise|hollow|russian twist|mountain climber|wood ?chop|oblique|toes[- ]?to[- ]?bar|knee raise)\b/i;
const RE_CARRY = /\b(carry|farmer|yoke|suitcase|waiter)\b/i;

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
  if (raw.mechanic === "compound") {
    if (raw.force === "push") return "push";
    if (raw.force === "pull") return "pull";
  }
  if (raw.mechanic === "isolation") return "isolation";
  if (raw.force === "push") return "push";
  if (raw.force === "pull") return "pull";
  return "isolation";
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
