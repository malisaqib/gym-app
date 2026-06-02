import { formatFoodTableForPrompt } from "@/lib/food/pakistaniFoods";

/**
 * Phase 4 — Food text parser (Groq / Llama).
 *
 * SERVER ONLY. Uses GROQ_API_KEY, which must never reach the browser. We call
 * Groq's OpenAI-compatible REST endpoint with plain fetch (no SDK dependency).
 *
 * The model turns a free-text meal ("do roti, ek pyali daal") into structured
 * per-item macros. It is grounded by the curated Pakistani food table for desi
 * dishes and falls back to its own knowledge for everything else.
 */

export interface ParsedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function buildSystemPrompt(): string {
  return `You are a nutrition parser for a Pakistan-focused fitness app.

Turn the user's meal description into structured food items with estimated
calories and macros. The text may be English, Roman Urdu, or a mix.

RULES:
- Do NOT assume the food is Pakistani. Handle ANY cuisine (desi, western, etc.).
- For South Asian dishes, use the REFERENCE TABLE below for accuracy. Match by
  name or alias, then scale by the quantity the user ate.
- For foods NOT in the table, use your own nutrition knowledge.
- Interpret Roman Urdu quantities: ek/aik=1, do=2, teen=3, char=4, adha=half,
  pyali/katori=small bowl, plate=plate, glass=glass.
- Every item's macros must be the TOTAL for the amount eaten, not per unit.
- Round all numbers to integers. If no food is found, return an empty list.

REFERENCE TABLE (per stated portion):
${formatFoodTableForPrompt()}

Respond with ONLY valid JSON in this exact shape:
{"items":[{"food_name":string,"quantity":number,"unit":string,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number}]}`;
}

// Coerce one raw model item into a clean ParsedFoodItem (defensive: never trust
// model output shape). Returns null if it isn't a usable food entry.
function coerceItem(raw: unknown): ParsedFoodItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.food_name === "string" ? r.food_name.trim() : "";
  if (!name) return null;

  const num = (v: unknown) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return {
    food_name: name,
    quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
    unit: typeof r.unit === "string" ? r.unit : "",
    calories: num(r.calories),
    protein_g: num(r.protein_g),
    carbs_g: num(r.carbs_g),
    fat_g: num(r.fat_g),
  };
}

/**
 * Parse a free-text meal into food items. Throws on configuration/network/parse
 * errors so the caller can surface a friendly message; returns [] only when the
 * model genuinely found no food.
 */
export async function parseFoodText(text: string): Promise<ParsedFoodItem[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Food AI is not configured (missing GROQ_API_KEY).");
  }

  // Abort the request if Groq doesn't respond in time, so the UI never hangs.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The food AI took too long to respond. Please try again.");
    }
    throw new Error("Couldn't reach the food AI. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from the food AI.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The food AI returned malformed data. Please try again.");
  }

  const rawItems = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map(coerceItem)
    .filter((item): item is ParsedFoodItem => item !== null);
}
