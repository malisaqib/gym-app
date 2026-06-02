import { formatFoodTableForPrompt } from "@/lib/food/pakistaniFoods";
import type { Lang } from "@/lib/database.types";

/**
 * Phase 9 — "What should I eat next?" meal coach.
 *
 * SERVER ONLY (uses GROQ_API_KEY). Given the user's REMAINING calories/protein
 * for the day and the food options they typed, it recommends the best meal.
 * This is the "coaching" LLM slot; it currently runs on Groq (same key as food
 * parsing) and can be swapped to Gemini/Claude later — it's isolated here.
 *
 * Hard rules baked into the prompt: never invent exact nutrition (use ranges),
 * prefer high-protein when protein is low, prefer lighter options when calories
 * are nearly used up, and reply in the user's language.
 */

export interface MealSuggestion {
  best_option: string;
  approx: string; // e.g. "450–550 kcal, 35–45g protein"
  why: string;
  avoid: string;
  coach_note: string; // one friendly Roman Urdu line
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function buildSystemPrompt(input: {
  hasTargets: boolean;
  remainingCalories: number | null;
  remainingProtein: number | null;
  lang: Lang;
}): string {
  const langName = input.lang === "roman_urdu" ? "Roman Urdu" : "English";

  const context = input.hasTargets
    ? `The user has about ${Math.max(0, input.remainingCalories ?? 0)} kcal and ${Math.max(
        0,
        input.remainingProtein ?? 0
      )} g protein REMAINING for today.${
        (input.remainingCalories ?? 0) <= 0
          ? " They have basically hit their calories — recommend a very light, high-protein option or suggest waiting."
          : ""
      }`
    : `The user has NOT set daily targets yet — give a general, beginner-friendly suggestion (don't ask for their numbers).`;

  return `You are a friendly Pakistani fitness coach. The user will tell you what food options they have, and you recommend the single best thing to eat next.

CONTEXT: ${context}

RULES:
- Be warm, simple and encouraging. No shame. Use real Pakistani food.
- NEVER invent exact nutrition. Use approximate RANGES (e.g. "450–550 kcal").
- If protein is low, prefer the higher-protein option.
- If calories are nearly used up, prefer the lighter option.
- Recommend mainly from the options the user actually mentions.
- Reply in ${langName}. The "coach_note" must always be one friendly Roman Urdu line.

Use this reference table for rough nutrition (per stated portion):
${formatFoodTableForPrompt()}

Respond with ONLY valid JSON in this exact shape:
{"best_option":string,"approx":string,"why":string,"avoid":string,"coach_note":string}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function suggestMealCoach(input: {
  question: string;
  hasTargets: boolean;
  remainingCalories: number | null;
  remainingProtein: number | null;
  lang: Lang;
}): Promise<MealSuggestion> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Coach AI is not configured (missing GROQ_API_KEY).");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(input) },
          { role: "user", content: input.question },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The coach took too long to respond. Please try again.");
    }
    throw new Error("Couldn't reach the coach. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Coach request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from the coach.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The coach returned malformed data. Please try again.");
  }

  return {
    best_option: str(parsed.best_option),
    approx: str(parsed.approx),
    why: str(parsed.why),
    avoid: str(parsed.avoid),
    coach_note: str(parsed.coach_note),
  };
}
