import { regionCuisineHint } from "../region.ts";
import type { FoodPreference, Region, Sex } from "@/lib/database.types";

/**
 * Phase 1 (hybrid diet generator) — the GROQ "what" layer.
 *
 * Groq decides WHICH simple, repeatable foods make up the day (per meal slot)
 * and returns ONLY food names + rough portion hints — NEVER calorie/protein
 * numbers. The deterministic math layer (Phase 2) matches those names to the DB
 * and scales portions to hit the targets. NOTHING here does nutrition math.
 *
 * SERVER ONLY (uses GROQ_API_KEY). On ANY failure — no key, timeout, non-200,
 * malformed JSON, or an empty result — `generateMealSelection` returns null,
 * which is the caller's signal to fall back to the existing deterministic
 * selection (buildPlan). The parse/validate half is pure and unit-tested.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export const SELECTION_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type SelectionSlot = (typeof SELECTION_SLOTS)[number];

// Keep plans simple and repeatable (the product rule): a few familiar foods per
// meal, not a magazine spread.
const MAX_PER_SLOT = 4;

/** One food Groq chose. `portion` is a plain-words HINT only — never used for math. */
export interface SelectedFood {
  name: string;
  portion?: string;
}

export type MealSelection = Record<SelectionSlot, SelectedFood[]>;

/** The slice of profile/preferences the selector needs (decoupled from the DB row). */
export interface MealSelectionProfile {
  calorieTarget: number;
  proteinTargetG: number;
  sex: Sex | null;
  region: Region | null;
  foodPreference: FoodPreference | null;
  vegetarian: boolean;
  excludeTags: string[]; // categories to avoid (beef/chicken/fish/egg/dairy/nuts)
  excludeFoods: string[]; // specific foods to avoid
  allowProteinPowder: boolean; // may an optional whey/shake be suggested?
  usualFoods?: string | null; // go-to foods to prefer (optional)
}

// --- validation (pure, unit-tested) -----------------------------------------

/** Coerce one list entry (string or {name, portion}) into a SelectedFood, or null. */
function coerceFood(item: unknown): SelectedFood | null {
  if (typeof item === "string") {
    const name = item.trim().slice(0, 60);
    return name ? { name } : null;
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const name = (typeof o.name === "string" ? o.name : "").trim().slice(0, 60);
    if (!name) return null;
    const portion = typeof o.portion === "string" ? o.portion.trim().slice(0, 40) : "";
    return portion ? { name, portion } : { name };
  }
  return null;
}

/**
 * Validate/sanitise Groq's raw JSON into a MealSelection. Never trusts the
 * model's shape: unknown keys are ignored, bad entries dropped, each slot capped.
 * Returns null when nothing usable came back (→ deterministic fallback).
 */
export function parseMealSelection(raw: unknown): MealSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: MealSelection = { breakfast: [], lunch: [], dinner: [], snack: [] };
  let total = 0;
  for (const slot of SELECTION_SLOTS) {
    const list = r[slot];
    if (!Array.isArray(list)) continue;
    const foods: SelectedFood[] = [];
    for (const item of list) {
      const food = coerceFood(item);
      if (food) foods.push(food);
      if (foods.length >= MAX_PER_SLOT) break;
    }
    out[slot] = foods;
    total += foods.length;
  }
  return total > 0 ? out : null;
}

// --- prompt ------------------------------------------------------------------

function buildSelectionPrompt(p: MealSelectionProfile): string {
  const hint = regionCuisineHint(p.region);
  const cuisine = hint || "the user's everyday home food (bi-cuisine — desi or Western, whichever fits)";
  const avoidTags = p.excludeTags.length ? p.excludeTags.join(", ") : "none";
  const avoidFoods = p.excludeFoods.length ? p.excludeFoods.join(", ") : "none";
  const vegNote = p.vegetarian
    ? "VEGETARIAN: no meat or fish at all (eggs & dairy are fine unless avoided below)."
    : "Meat is fine.";
  const powderNote = p.allowProteinPowder
    ? "A whey/protein shake is allowed as ONE optional protein source if it helps."
    : "Do NOT include protein powder or whey shakes.";
  const usualLine = p.usualFoods?.trim()
    ? `\n- Foods they already eat a lot (prefer these): ${p.usualFoods.trim()}.`
    : "";

  return `You plan a SIMPLE one-day meal list for a fitness beginner. You ONLY choose WHICH foods go in each meal — you never compute or state any calories or macros.

USER:
- Daily targets (context for sizing only — do NOT output any numbers for these): about ${p.calorieTarget} kcal and ${p.proteinTargetG} g protein.
- Cuisine to lean toward: ${cuisine}.
- Food style: ${p.foodPreference ?? "normal"}.
- ${vegNote}
- Avoid these categories: ${avoidTags}.
- Avoid these specific foods: ${avoidFoods}.
- ${powderNote}${usualLine}

RULES:
- Keep it SIMPLE and repeatable — real everyday home eating, NOT a nutrition magazine. A few familiar foods, repeated, is good.
- Use only 2–3 protein sources across the WHOLE day (e.g. chicken, eggs, beef/mutton${p.allowProteinPowder ? ", optional shake" : ""}). The same protein at lunch and dinner is fine.
- Each main meal = one protein + one carb (roti/rice/bread) + optionally one simple side (salad/yogurt/sabzi).
- Snacks are FRUIT only (e.g. banana, apple, orange).
- NEVER include any food in the avoid lists, and respect the vegetarian rule.
- Give rough portions in plain words ("3 eggs", "2 roti", "1 cup rice"). These are hints only, NOT exact amounts.

Respond with ONLY valid JSON in EXACTLY this shape (no commentary, no other keys):
{"breakfast":[{"name":"eggs","portion":"3"},{"name":"paratha","portion":"1"}],"lunch":[{"name":"chicken","portion":"1 piece"},{"name":"rice","portion":"1 cup"}],"dinner":[...],"snack":[{"name":"banana","portion":"1"}]}`;
}

// --- the Groq call -----------------------------------------------------------

/**
 * Ask Groq to pick the day's foods. Returns the validated selection, or null on
 * any failure (the caller then uses the deterministic selection). Never throws.
 */
export async function generateMealSelection(profile: MealSelectionProfile): Promise<MealSelection | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null; // no key → deterministic fallback

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSelectionPrompt(profile) },
          { role: "user", content: "Plan my simple day of meals." },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null; // malformed JSON → fallback
    }
    return parseMealSelection(parsed);
  } catch {
    return null; // timeout / network / anything → fallback
  } finally {
    clearTimeout(timeout);
  }
}
