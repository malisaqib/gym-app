import { regionCuisineHint } from "../region.ts";
import type {
  ActivityLevel,
  FoodPreference,
  Goal,
  Region,
  Sex,
  TrainingLocation,
} from "@/lib/database.types";
import type { MealCandidateLists } from "./mealCandidates.ts";

/**
 * Groq chooses only catalog ids from explicit, profile-filtered candidate lists.
 * It never returns nutrition numbers; the deterministic planner owns portions,
 * calories, protein, validation, and repair.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export const SELECTION_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type SelectionSlot = (typeof SELECTION_SLOTS)[number];
const SLOT_SET = new Set<string>(SELECTION_SLOTS);
const MAX_PER_SLOT = 4;

export interface SelectedFood {
  id: string;
}

export type MealSelection = Record<SelectionSlot, SelectedFood[]>;

export type MealSelectionFallbackReason =
  | "missing_api_key"
  | "rate_limited"
  | "http_error"
  | "timeout"
  | "request_error"
  | "invalid_response"
  | "malformed_json"
  | "invalid_selection";

export type MealSelectionResult =
  | { selection: MealSelection; fallbackReason: null }
  | { selection: null; fallbackReason: MealSelectionFallbackReason };

export interface MealSelectionProfile {
  calorieTarget: number;
  proteinTargetG: number;
  weightKg: number | null;
  goal: Goal | null;
  sex: Sex | null;
  region: Region | null;
  foodPreference: FoodPreference | null;
  activityLevel: ActivityLevel | null;
  trainingLocation: TrainingLocation | null;
  vegetarian: boolean;
  excludeTags: string[];
  excludeFoods: string[];
  allowProteinPowder: boolean;
  usualMeals: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    foods?: string;
    keep?: string;
  };
  candidates: MealCandidateLists;
}

export interface MealSelectionRequestOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Strictly validate model output against the candidates exposed for each slot.
 * Any invalid entry rejects the whole response so the caller can safely fall
 * back to deterministic generation.
 */
export function parseMealSelection(
  raw: unknown,
  candidates: MealCandidateLists
): MealSelection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !SLOT_SET.has(key))) return null;
  if (SELECTION_SLOTS.some((slot) => !Array.isArray(record[slot]))) return null;

  const out: MealSelection = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const dayCounts = new Map<string, number>();
  let total = 0;

  for (const slot of SELECTION_SLOTS) {
    const list = record[slot] as unknown[];
    if (list.length > MAX_PER_SLOT) return null;
    const allowedIds = new Set(candidates[slot].map((candidate) => candidate.id));
    const slotIds = new Set<string>();

    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const value = item as Record<string, unknown>;
      if (Object.keys(value).some((key) => key !== "id")) return null;
      const id = typeof value.id === "string" ? value.id.trim() : "";
      if (!id || !allowedIds.has(id) || slotIds.has(id)) return null;

      slotIds.add(id);
      dayCounts.set(id, (dayCounts.get(id) ?? 0) + 1);
      if ((dayCounts.get(id) ?? 0) > 2) return null;
      out[slot].push({ id });
      total++;
    }
  }

  return total > 0 ? out : null;
}

function compactCandidates(candidates: MealCandidateLists): string {
  return JSON.stringify(
    Object.fromEntries(
      SELECTION_SLOTS.map((slot) => [
        slot,
        candidates[slot].map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          role: candidate.role,
          region: candidate.region,
          vegetarian: candidate.vegetarian,
          whey: candidate.whey,
          common: candidate.common,
          regionMatch: candidate.regionMatch,
        })),
      ])
    )
  );
}

export function buildMealSelectionPrompt(profile: MealSelectionProfile): string {
  const cuisine =
    regionCuisineHint(profile.region) ||
    "the user's everyday home food, using the candidate regions as guidance";
  const usual = [
    profile.usualMeals.breakfast && `breakfast: ${profile.usualMeals.breakfast}`,
    profile.usualMeals.lunch && `lunch: ${profile.usualMeals.lunch}`,
    profile.usualMeals.dinner && `dinner: ${profile.usualMeals.dinner}`,
    profile.usualMeals.foods && `go-to foods: ${profile.usualMeals.foods}`,
    profile.usualMeals.keep && `foods to keep: ${profile.usualMeals.keep}`,
  ]
    .filter(Boolean)
    .join("; ");

  return `You choose foods for a simple one-day diet plan. You choose WHAT only. Never calculate or return calories, protein, macros, grams, portions, or free-form food names.

USER CONTEXT:
- Targets for context only: ${profile.calorieTarget} kcal and ${profile.proteinTargetG} g protein.
- Weight: ${profile.weightKg ?? "unknown"} kg.
- Goal: ${profile.goal ?? "unknown"}.
- Sex: ${profile.sex ?? "unknown"}.
- Region/cuisine: ${cuisine}.
- Food style: ${profile.foodPreference ?? "normal"}.
- Daily activity: ${profile.activityLevel ?? "unknown"}.
- Training location: ${profile.trainingLocation ?? "unknown"}.
- Vegetarian: ${profile.vegetarian ? "yes" : "no"}.
- Avoid categories: ${profile.excludeTags.length ? profile.excludeTags.join(", ") : "none"}.
- Avoid foods: ${profile.excludeFoods.length ? profile.excludeFoods.join(", ") : "none"}.
- Protein powder: ${profile.allowProteinPowder ? "explicitly allowed" : "not allowed"}.
- Usual eating: ${usual || "not provided"}.

ALLOWED CANDIDATES:
${compactCandidates(profile.candidates)}

RULES:
- Choose ONLY ids present in the candidate list for that exact meal slot.
- Return ids only. Do not return names, portions, calories, protein, macros, or extra keys.
- Keep meals simple, realistic, familiar, and appropriate for the user's region and food style.
- Prefer regionMatch="specific", then "broad", then "global" when realistic.
- Prefer common=true foods for the main meal structure.
- Do not choose avoided foods. Candidate filtering is authoritative.
- Do not choose whey unless protein powder is explicitly allowed.
- Do not choose fast food for automatic generation.
- Avoid fancy nutrition-magazine meals.
- Use one protein and one carb in main meals when candidates allow it, plus at most one simple side.
- Snacks should normally be fruit; whey may be an optional addition only when allowed.
- Do not repeat the exact same id more than twice across the day.

Return ONLY valid JSON in exactly this shape:
{"breakfast":[{"id":"candidate_id"}],"lunch":[{"id":"candidate_id"}],"dinner":[{"id":"candidate_id"}],"snack":[{"id":"candidate_id"}]}`;
}

/** Ask Groq for candidate ids. Failures carry a safe internal fallback reason. */
export async function generateMealSelection(
  profile: MealSelectionProfile,
  options: MealSelectionRequestOptions = {}
): Promise<MealSelectionResult> {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) return { selection: null, fallbackReason: "missing_api_key" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildMealSelectionPrompt(profile) },
          { role: "user", content: "Choose my simple meals from the allowed candidate ids." },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        selection: null,
        fallbackReason: response.status === 429 ? "rate_limited" : "http_error",
      };
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { selection: null, fallbackReason: "invalid_response" };
    }

    try {
      const selection = parseMealSelection(JSON.parse(content), profile.candidates);
      return selection
        ? { selection, fallbackReason: null }
        : { selection: null, fallbackReason: "invalid_selection" };
    } catch {
      return { selection: null, fallbackReason: "malformed_json" };
    }
  } catch (error) {
    return {
      selection: null,
      fallbackReason:
        error instanceof Error && error.name === "AbortError" ? "timeout" : "request_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
