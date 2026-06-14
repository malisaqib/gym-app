import type {
  FoodPreference,
  Goal,
  Lang,
  RelatableGoalKey,
  Timeline,
  TrainingLocation,
} from "@/lib/database.types";

/**
 * Phase 8 — Relatable goals.
 *
 * Users pick a RELATABLE goal ("look good in a shirt"); we map it to a PRACTICAL
 * goal the calorie engine understands (lose_fat / maintain / gain_muscle) and
 * build a friendly, plain explanation of how the plan connects to what they
 * actually want. Pure data + functions, so it's deterministic and testable.
 */

export type Localized = Record<Lang, string>;

export interface RelatableGoalDef {
  key: RelatableGoalKey;
  label: Localized; // shown as a button in onboarding
  goal: Goal; // the practical goal for the engine
  focus: Localized; // short phrase describing what we're really chasing
}

export const RELATABLE_GOALS: RelatableGoalDef[] = [
  {
    key: "wedding_event",
    goal: "lose_fat",
    label: { en: "Get fit for a wedding/event", roman_urdu: "Shadi/event ke liye fit hona" },
    focus: { en: "a leaner look in time for your event", roman_urdu: "event tak ek leaner look" },
  },
  {
    key: "shirt_look",
    goal: "lose_fat",
    label: { en: "Look better in a shirt", roman_urdu: "Shirt mein better look chahiye" },
    focus: {
      en: "a leaner upper body so shirts fit better",
      roman_urdu: "leaner upper body taake shirt achi lage",
    },
  },
  {
    key: "belly_fat",
    goal: "lose_fat",
    label: { en: "Reduce belly fat", roman_urdu: "Belly fat kam karni hai" },
    focus: {
      en: "overall fat loss — belly shrinks as total body fat drops (spot reduction isn't possible)",
      roman_urdu:
        "poori body ka fat kam karna — sirf pet ka spot reduction possible nahi, lekin total fat girne se pet bhi kam hota hai",
    },
  },
  {
    key: "build_muscle",
    goal: "gain_muscle",
    label: { en: "Build muscle / get stronger", roman_urdu: "Muscle banani / strong hona" },
    focus: {
      en: "building lean muscle with progressive training and enough protein",
      roman_urdu: "progressive training aur kaafi protein se lean muscle banana",
    },
  },
  {
    key: "skinny_bulk",
    goal: "gain_muscle",
    label: { en: "Skinny → healthy bulk", roman_urdu: "Skinny se healthy bulk" },
    focus: {
      en: "lean muscle gain with enough food to grow",
      roman_urdu: "lean muscle gain, grow karne ke liye kaafi khana",
    },
  },
  {
    key: "sports",
    goal: "maintain",
    label: { en: "Stamina for sports", roman_urdu: "Sports ke liye stamina" },
    focus: { en: "stamina, strength and performance", roman_urdu: "stamina, strength aur performance" },
  },
  {
    key: "general",
    goal: "maintain",
    label: { en: "General fitness & confidence", roman_urdu: "General fitness aur confidence" },
    focus: { en: "a balanced, sustainable routine", roman_urdu: "ek balanced, sustainable routine" },
  },
  {
    key: "gym_start",
    goal: "maintain",
    label: { en: "Start training (not sure how)", roman_urdu: "Start karna hai, samajh nahi aa raha" },
    focus: {
      en: "an easy beginner start you can actually stick to",
      roman_urdu: "asaan beginner start jo aap continue rakh sakein",
    },
  },
];

export function mapRelatableGoal(key: string): RelatableGoalDef {
  return (
    RELATABLE_GOALS.find((g) => g.key === key) ??
    RELATABLE_GOALS.find((g) => g.key === "general")!
  );
}

// --- plan guidance ---------------------------------------------------------

export interface PlanGuidance {
  headline: string; // "Goal samajh gaya: ..."
  diet: string; // simple diet guidance, tailored to food preference
  workout: string; // beginner workout pointer
  explanation: string; // how the plan connects to their goal
}

const TIMELINE_LABEL: Record<Timeline, Localized> = {
  no_deadline: { en: "no fixed deadline", roman_urdu: "koi deadline nahi" },
  "4_weeks": { en: "about 4 weeks", roman_urdu: "takriban 4 hafte" },
  "8_weeks": { en: "about 8 weeks", roman_urdu: "takriban 8 hafte" },
  "12_weeks": { en: "about 12 weeks", roman_urdu: "takriban 12 hafte" },
};

// One-line calorie/protein summary per practical goal.
const GOAL_PLAN: Record<Goal, Localized> = {
  lose_fat: {
    en: "Calories: a small deficit. Protein: kept high to protect muscle while you lean down.",
    roman_urdu: "Calories: thoda deficit. Protein: high rakhenge taake muscle bachi rahe.",
  },
  maintain: {
    en: "Calories: around maintenance. Protein: solid, to build a base and recover well.",
    roman_urdu: "Calories: maintenance ke aas paas. Protein: achi, base banane aur recovery ke liye.",
  },
  gain_muscle: {
    en: "Calories: a slight surplus to grow. Protein: high, to turn that food into muscle.",
    roman_urdu: "Calories: halka surplus grow karne ke liye. Protein: high, taake khana muscle banaye.",
  },
};

const DIET_BY_PREFERENCE: Record<FoodPreference, Localized> = {
  normal_desi: {
    en: "Roti/chawal band nahi karne — just control portions and add protein (anda, chicken, daal, dahi) to every meal.",
    roman_urdu: "Roti/chawal band nahi karne — bas portion control aur har meal mein protein (anda, chicken, daal, dahi).",
  },
  high_protein: {
    en: "Make protein the star of every meal: eggs, chicken, daal, dahi, milk. Carbs around your training.",
    roman_urdu: "Har meal mein protein ko priority (anda, chicken, daal, dahi, doodh). Carbs workout ke aas paas.",
  },
  budget: {
    en: "Cheap protein wins: eggs, daal, chana, dahi, milk. No expensive supplements needed.",
    roman_urdu: "Sasta protein: anday, daal, chana, dahi, doodh. Mehngay supplements ki zaroorat nahi.",
  },
  hostel_student: {
    en: "From the mess: take the protein dishes (anda, daal, chicken) and go easy on extra roti and fried items.",
    roman_urdu: "Mess se protein wali cheezen (anda, daal, chicken) zyada lo, extra roti aur fried kam.",
  },
  veg_limited: {
    en: "Hit protein from daal, chana, dahi, paneer and eggs (if you take them). Pair with rice or roti.",
    roman_urdu: "Protein daal, chana, dahi, paneer aur anday (agar lete hain) se poora karein. Sath chawal/roti.",
  },
};

/** Build friendly, plain-language plan guidance for the end of onboarding. */
export function buildPlanGuidance(input: {
  relatableGoalKey: string;
  timeline: string;
  foodPreference: string;
  trainingLocation: string;
  lang: Lang;
  // When a goal weight is set, the direction comes from current-vs-goal weight,
  // not the relatable goal. Pass it so the diet sentence can't contradict the
  // actual target (e.g. relatable "bulk" but the user set a lower goal weight).
  goalOverride?: Goal;
}): PlanGuidance {
  const lang = input.lang;
  const def = mapRelatableGoal(input.relatableGoalKey);
  const planGoal = input.goalOverride ?? def.goal;
  const timeline = (TIMELINE_LABEL[input.timeline as Timeline] ?? TIMELINE_LABEL.no_deadline)[lang];
  const diet =
    (DIET_BY_PREFERENCE[input.foodPreference as FoodPreference] ?? DIET_BY_PREFERENCE.normal_desi)[lang];

  const headline =
    lang === "roman_urdu"
      ? `Goal samajh gaya: ${def.focus.roman_urdu}.`
      : `Got it — your goal is ${def.focus.en}.`;

  const workout =
    lang === "roman_urdu"
      ? "Workout: Workout tab mein A/B beginner split follow karein, hafte mein 3 din. Sath 2–3 halki walks."
      : "Workout: follow the A/B beginner split in the Workout tab, 3 days a week, plus 2–3 light walks.";

  const explanation =
    lang === "roman_urdu"
      ? `${GOAL_PLAN[planGoal].roman_urdu} Timeline: ${timeline}. Ye plan seedha aap ke goal (${def.focus.roman_urdu}) se juda hai — ahista ahista, bina kisi shame ke.`
      : `${GOAL_PLAN[planGoal].en} Timeline: ${timeline}. This plan connects straight to your goal (${def.focus.en}) — steady and beginner-friendly.`;

  return { headline, diet, workout, explanation };
}
