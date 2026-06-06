import type {
  ActivityLevel,
  Experience,
  FoodPreference,
  Lang,
  OnboardingEntry,
  RelatableGoalKey,
  Sex,
  Timeline,
  TrainingLocation,
} from "@/lib/database.types";
import { RELATABLE_GOALS } from "@/lib/onboarding/goals";

/**
 * Phase 3 — Onboarding content & shape.
 *
 * This file is pure data + types (no React), so it can be imported by both the
 * client chat UI and the server action. The whole conversation is driven by the
 * STEPS array below, which keeps the UI component generic: to add or reword a
 * question (or fix a translation) you only touch this file.
 */

// A piece of text in both supported languages.
export type Localized = Record<Lang, string>;

// A pickable answer (used by button groups and the dropdown).
export interface Choice {
  value: string; // the structured value we store (e.g. "lose_fat")
  label: Localized; // what the user sees / "says"
}

interface BaseStep {
  key: string; // maps to a field we collect
  prompt: Localized; // the bot's question
}

// "choice" = button group, "select" = dropdown, "number" = numeric input,
// "text" = free text (only used when the user must explain something).
export interface ChoiceStep extends BaseStep {
  kind: "choice" | "select";
  options: Choice[];
}
export interface NumberStep extends BaseStep {
  kind: "number";
  placeholder: Localized;
  min: number;
  max: number;
}
export interface TextStep extends BaseStep {
  kind: "text";
  placeholder: Localized;
  optional?: boolean;
}
// A single compact screen with several optional free-text fields (keeps the
// "usual eating" capture to ONE step so onboarding stays fast). Always skippable.
export interface EatingField {
  key: "usualBreakfast" | "usualLunch" | "usualDinner" | "usualFoods" | "dislikedFoods";
  label: Localized;
  placeholder: Localized;
}
export interface EatingStep extends BaseStep {
  kind: "eating";
  fields: EatingField[];
}
export type Step = ChoiceStep | NumberStep | TextStep | EatingStep;

// Dropdown options 0–7 days, generated to avoid repetition.
const trainingDayOptions: Choice[] = Array.from({ length: 8 }, (_, n) => ({
  value: String(n),
  label: {
    en: n === 1 ? "1 day" : `${n} days`,
    roman_urdu: n === 1 ? "1 din" : `${n} din`,
  },
}));

export const STEPS: Step[] = [
  {
    // Relatable goal (Phase 8) — mapped to a practical goal on the server.
    key: "relatableGoal",
    kind: "choice",
    prompt: {
      en: "What are you really here for?",
      roman_urdu: "Aap asal mein kis liye aaye hain?",
    },
    options: RELATABLE_GOALS.map((g) => ({ value: g.key, label: g.label })),
  },
  {
    key: "timeline",
    kind: "choice",
    prompt: {
      en: "Any timeline in mind?",
      roman_urdu: "Koi timeline hai zehan mein?",
    },
    options: [
      { value: "no_deadline", label: { en: "No deadline", roman_urdu: "Koi deadline nahi" } },
      { value: "4_weeks", label: { en: "4 weeks", roman_urdu: "4 hafte" } },
      { value: "8_weeks", label: { en: "8 weeks", roman_urdu: "8 hafte" } },
      { value: "12_weeks", label: { en: "12 weeks", roman_urdu: "12 hafte" } },
    ],
  },
  {
    key: "age",
    kind: "number",
    prompt: { en: "How old are you?", roman_urdu: "Aap ki umar kitni hai?" },
    placeholder: { en: "Years, e.g. 24", roman_urdu: "Saal, masalan 24" },
    min: 13,
    max: 99,
  },
  {
    key: "sex",
    kind: "choice",
    prompt: {
      en: "Gender? (needed for the calorie math)",
      roman_urdu: "Gender? (calorie hisaab ke liye zaroori)",
    },
    options: [
      { value: "male", label: { en: "Male", roman_urdu: "Mard" } },
      { value: "female", label: { en: "Female", roman_urdu: "Aurat" } },
    ],
  },
  {
    key: "heightCm",
    kind: "number",
    prompt: {
      en: "How tall are you, in centimetres?",
      roman_urdu: "Aap ka qad kitna hai, centimetre mein?",
    },
    placeholder: { en: "cm, e.g. 170", roman_urdu: "cm, masalan 170" },
    min: 120,
    max: 230,
  },
  {
    key: "weightKg",
    kind: "number",
    prompt: {
      en: "And your current weight, in kilograms?",
      roman_urdu: "Aur aap ka mojooda wazan, kilogram mein?",
    },
    placeholder: { en: "kg, e.g. 75", roman_urdu: "kg, masalan 75" },
    min: 30,
    max: 250,
  },
  {
    // Target weight (Phase 2). Same number = "just maintain".
    key: "goalWeightKg",
    kind: "number",
    prompt: {
      en: "What weight would you like to reach?",
      roman_urdu: "Aap kaunsa wazan reach karna chahte hain?",
    },
    placeholder: {
      en: "kg, e.g. 65 — or your current weight to maintain",
      roman_urdu: "kg, masalan 65 — ya mojooda wazan maintain karne ke liye",
    },
    min: 30,
    max: 250,
  },
  {
    // Honest WHOLE-DAY activity (not training count) — this drives the calorie
    // engine's activity factor. See lib/nutrition/engine.ts.
    key: "activityLevel",
    kind: "choice",
    prompt: {
      en: "Outside workouts, how active is your day?",
      roman_urdu: "Workout ke ilawa, aap ka din kitna active hota hai?",
    },
    options: [
      { value: "sedentary", label: { en: "Mostly sitting", roman_urdu: "Zyada tar baithay" } },
      { value: "light", label: { en: "Lightly active", roman_urdu: "Thoda active" } },
      { value: "moderate", label: { en: "Moderately active", roman_urdu: "Theek thaak active" } },
      { value: "very", label: { en: "Very active", roman_urdu: "Bohat active" } },
      { value: "extra", label: { en: "On my feet all day", roman_urdu: "Saara din chalte phirte" } },
    ],
  },
  {
    key: "trainingLocation",
    kind: "choice",
    prompt: {
      en: "Where will you train?",
      roman_urdu: "Aap kahan train karenge?",
    },
    options: [
      { value: "home", label: { en: "Home", roman_urdu: "Ghar" } },
      { value: "gym", label: { en: "Gym", roman_urdu: "Gym" } },
      { value: "both", label: { en: "Both", roman_urdu: "Dono" } },
    ],
  },
  {
    key: "trainingDays",
    kind: "select",
    prompt: {
      en: "How many days a week can you realistically train?",
      roman_urdu: "Aap haftay mein sach much kitnay din train kar saktay hain?",
    },
    options: trainingDayOptions,
  },
  {
    key: "experience",
    kind: "choice",
    prompt: {
      en: "How much training experience do you have?",
      roman_urdu: "Aap ko training ka kitna tajurba hai?",
    },
    options: [
      { value: "beginner", label: { en: "New to this", roman_urdu: "Bilkul naya" } },
      { value: "intermediate", label: { en: "Some experience", roman_urdu: "Thoda tajurba" } },
      { value: "advanced", label: { en: "Experienced", roman_urdu: "Kaafi tajurba" } },
    ],
  },
  {
    key: "foodPreference",
    kind: "choice",
    prompt: {
      en: "What's your food style?",
      roman_urdu: "Aap ka khane ka style kya hai?",
    },
    options: [
      { value: "normal_desi", label: { en: "Normal desi", roman_urdu: "Normal desi" } },
      { value: "high_protein", label: { en: "High protein", roman_urdu: "High protein" } },
      { value: "budget", label: { en: "Budget", roman_urdu: "Budget" } },
      { value: "hostel_student", label: { en: "Hostel / student", roman_urdu: "Hostel / student" } },
      { value: "veg_limited", label: { en: "Veg / little meat", roman_urdu: "Veg / kam meat" } },
    ],
  },
  {
    // Usual eating — one compact, fully optional screen. Powers the diet plan
    // (Phase 3 seeds meals from these). Skippable so onboarding stays fast.
    key: "eating",
    kind: "eating",
    prompt: {
      en: "Last thing — how do you usually eat? All optional, skip if you like.",
      roman_urdu: "Aakhri baat — aap aam tor par kya khaate hain? Sab optional, chahein to skip karein.",
    },
    fields: [
      {
        key: "usualBreakfast",
        label: { en: "Usual breakfast", roman_urdu: "Aam nashta" },
        placeholder: { en: "e.g. paratha + egg, or oats", roman_urdu: "misal: paratha + anda, ya oats" },
      },
      {
        key: "usualLunch",
        label: { en: "Usual lunch", roman_urdu: "Aam dopahar ka khana" },
        placeholder: { en: "e.g. roti + chicken salan", roman_urdu: "misal: roti + chicken salan" },
      },
      {
        key: "usualDinner",
        label: { en: "Usual dinner", roman_urdu: "Aam raat ka khana" },
        placeholder: { en: "e.g. rice + daal", roman_urdu: "misal: chawal + daal" },
      },
      {
        key: "usualFoods",
        label: { en: "Foods you eat a lot", roman_urdu: "Jo aksar khaate hain" },
        placeholder: { en: "e.g. eggs, chicken, yogurt", roman_urdu: "misal: anday, chicken, dahi" },
      },
      {
        key: "dislikedFoods",
        label: { en: "Anything you don't or won't eat", roman_urdu: "Jo nahi khaate / pasand nahi" },
        placeholder: { en: "allergies, dislikes — e.g. no beef", roman_urdu: "allergy/dislike — misal: beef nahi" },
      },
    ],
  },
];

// Static UI strings (everything that isn't a question), in both languages.
export const UI: Record<string, Localized> = {
  headerTitle: { en: "Your Coach", roman_urdu: "Aap ka Coach" },
  intro: {
    en: "Assalam-o-alaikum! I'm your coach. A few quick questions, then I'll set your daily calorie and protein targets.",
    roman_urdu:
      "Assalam-o-alaikum! Main aap ka coach hoon. Chand chhotay sawal, phir main aap ke rozana calorie aur protein targets bana dunga.",
  },
  next: { en: "Next", roman_urdu: "Aage" },
  send: { en: "Send", roman_urdu: "Bhejein" },
  save: { en: "Save", roman_urdu: "Save" },
  skip: { en: "Skip", roman_urdu: "Skip" },
  choosePlaceholder: { en: "Choose…", roman_urdu: "Chunein…" },
  calculating: { en: "Crunching the numbers…", roman_urdu: "Hisaab lagaya ja raha hai…" },
  doneTitle: {
    en: "All set! Here are your daily targets:",
    roman_urdu: "Sab tayyar! Ye rahe aap ke rozana targets:",
  },
  caloriesLabel: { en: "Calories", roman_urdu: "Calories" },
  proteinLabel: { en: "Protein", roman_urdu: "Protein" },
  safetyNote: {
    en: "I kept your calories at a safe minimum instead of a steeper cut — slow and steady is safer.",
    roman_urdu:
      "Main ne aap ki calories ko mehfooz had par rakha, zyada kami nahi ki — ahista ahista behtar hai.",
  },
  // Goal-weight summary (placeholders {w}=goal kg, {d}=date, {c}=kcal, {p}=protein,
  // {carb}/{fat}=grams) — filled in the component.
  goalReachLine: {
    en: "To reach {w} kg by {d},",
    roman_urdu: "{w} kg tak {d} tak pohanchne ke liye,",
  },
  goalAim: {
    en: "aim for about {c} kcal/day and {p} g protein.",
    roman_urdu: "rozana takriban {c} kcal aur {p} g protein ka target rakhein.",
  },
  maintainLine: {
    en: "To stay around {w} kg, aim for about {c} kcal/day and {p} g protein.",
    roman_urdu: "~{w} kg ke aas paas rehne ke liye, rozana takriban {c} kcal aur {p} g protein.",
  },
  macrosLine: {
    en: "Carbs ~{carb} g · Fat ~{fat} g",
    roman_urdu: "Carbs ~{carb} g · Fat ~{fat} g",
  },
  paceCappedNote: {
    en: "That timeline would need a faster-than-healthy pace, so I set a safe one — here's the realistic date.",
    roman_urdu: "Is timeline ke liye sehatmand se zyada tez raftaar chahiye thi, is liye main ne mehfooz raftaar rakhi — ye haqeeqi tareekh hai.",
  },
  goToDashboard: { en: "See my dashboard", roman_urdu: "Mera dashboard dekhein" },
  genericError: {
    en: "Something went wrong saving your answers. Please try again.",
    roman_urdu: "Aap ke jawabat save karne mein masla hua. Dobara koshish karein.",
  },
  invalidNumber: {
    en: "Please enter a valid number.",
    roman_urdu: "Baraye meharbani sahih number darj karein.",
  },
};

// The structured payload the chat UI sends to the server action.
export interface OnboardingInput {
  relatableGoal: RelatableGoalKey;
  timeline: Timeline;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number; // target weight (same as current = maintain)
  activityLevel: ActivityLevel; // honest whole-day activity
  trainingLocation: TrainingLocation;
  trainingDays: number;
  experience: Experience;
  foodPreference: FoodPreference;
  // Usual eating (all optional; "" when skipped).
  usualBreakfast: string;
  usualLunch: string;
  usualDinner: string;
  usualFoods: string;
  dislikedFoods: string;
  preferredLanguage: Lang;
  transcript: OnboardingEntry[];
}
