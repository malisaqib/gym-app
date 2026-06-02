import type {
  Experience,
  Goal,
  Lang,
  OnboardingEntry,
  Sex,
} from "@/lib/database.types";

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
export type Step = ChoiceStep | NumberStep | TextStep;

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
    key: "goal",
    kind: "choice",
    prompt: {
      en: "What's your main goal right now?",
      roman_urdu: "Abhi aap ka main goal kya hai?",
    },
    options: [
      { value: "lose_fat", label: { en: "Lose fat", roman_urdu: "Wazan/charbi kam karni hai" } },
      { value: "maintain", label: { en: "Stay the same", roman_urdu: "Wazan maintain karna hai" } },
      { value: "gain_muscle", label: { en: "Build muscle", roman_urdu: "Muscle banana hai" } },
    ],
  },
  {
    key: "sex",
    kind: "choice",
    prompt: {
      en: "What's your biological sex? (needed for the calorie math)",
      roman_urdu: "Aap ka biological sex kya hai? (calorie hisaab ke liye zaroori)",
    },
    options: [
      { value: "male", label: { en: "Male", roman_urdu: "Mard" } },
      { value: "female", label: { en: "Female", roman_urdu: "Aurat" } },
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
      en: "How much gym experience do you have?",
      roman_urdu: "Aap ko gym ka kitna tajurba hai?",
    },
    options: [
      { value: "beginner", label: { en: "New to this", roman_urdu: "Bilkul naya" } },
      { value: "intermediate", label: { en: "Some experience", roman_urdu: "Thoda tajurba" } },
      { value: "advanced", label: { en: "Experienced", roman_urdu: "Kaafi tajurba" } },
    ],
  },
  {
    // The one free-text step: open-ended, so the user can explain in detail.
    key: "notes",
    kind: "text",
    optional: true,
    prompt: {
      en: "Anything I should know? Injuries, health issues, or foods you avoid. (Optional)",
      roman_urdu:
        "Koi aisi baat jo mujhe pata honi chahiye? Injury, sehat ka masla, ya jo khana avoid karte hain. (Optional)",
    },
    placeholder: { en: "Type here, or skip", roman_urdu: "Yahan likhein, ya skip karein" },
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
  goal: Goal;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  trainingDays: number;
  experience: Experience;
  notes: string;
  preferredLanguage: Lang;
  transcript: OnboardingEntry[];
}
