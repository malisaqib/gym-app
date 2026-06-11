import { retrieveFoods, lexicalRetrieveFoods, type RetrievedFood } from "@/lib/food/retrieve";
import { groundParsedFoodItems, regroundUnmatchedItems } from "@/lib/food/grounding";
import { aiConfigError, aiHttpError } from "@/lib/ai/errors";
import type { NutritionSource } from "@/lib/database.types";

/**
 * Phase 4 + RAG R3 — Food text parser (Groq / Llama, grounded by retrieval).
 *
 * SERVER ONLY. Uses GROQ_API_KEY (Groq) and, via retrieveFoods, GEMINI_API_KEY
 * (embeddings). Neither must reach the browser.
 *
 * Flow: retrieve the few most relevant catalog foods for THIS meal (hybrid
 * lexical + vector), inject only those into the prompt as grounded candidates,
 * then let Llama map the user's words to them and scale by quantity. If
 * retrieval fails (e.g. embedding quota), we degrade gracefully — the LLM still
 * parses unaided, so logging never breaks.
 */

export interface ParsedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  matched_food_id?: string | null;
  match_confidence?: number | null;
  nutrition_source?: NutritionSource | null;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function formatCandidates(candidates: RetrievedFood[]): string {
  if (candidates.length === 0) {
    return "(no database matches for this meal — use your own reliable nutrition knowledge for every item)";
  }
  return candidates
    .map((c) => {
      const names = [c.name, ...c.aliases].join(", ");
      return `- ${names} | ${c.portion} = ${c.calories} kcal, ${c.protein_g}g protein, ${c.carbs_g}g carbs, ${c.fat_g}g fat`;
    })
    .join("\n");
}

function buildSystemPrompt(candidates: RetrievedFood[]): string {
  return `You are a nutrition parser for a fitness app used by BOTH Western and South Asian users.

Turn the user's meal description into structured food items with calories and macros. The text may be English, Roman Urdu, or a mix.

CANDIDATE FOODS (retrieved from our database for THIS meal). When something the user mentions matches a candidate, USE that candidate's numbers and scale them by the quantity eaten. If an item matches NO candidate, use your own reliable nutrition knowledge.
${formatCandidates(candidates)}

RULES:
- Do NOT assume a cuisine. Handle Western and South Asian foods equally well.
- Interpret Roman Urdu quantities: ek/aik=1, do=2, teen=3, char=4, adha=half,
  pyali/katori=small bowl, plate=plate, glass=glass.
- Every item's macros must be the TOTAL for the amount eaten, not per unit.
- food_name is for display: use a short natural name from the user's words
  (e.g. "coffee shake"), not a long database/candidate label with commas.
- Round all numbers to integers. If no food is found, return an empty list.

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

  // Coerce + clamp: positive integer within a sane upper bound, so a model
  // hallucination (e.g. "99999 kcal") can't poison the day's totals.
  const num = (v: unknown, max: number) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, max);
  };

  const quantity = Number(r.quantity);
  return {
    food_name: name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 100) : 1,
    unit: typeof r.unit === "string" ? r.unit : "",
    calories: num(r.calories, 5000),
    protein_g: num(r.protein_g, 1000),
    carbs_g: num(r.carbs_g, 1000),
    fat_g: num(r.fat_g, 1000),
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
    throw aiConfigError();
  }

  // RAG: pull grounded candidates for this meal. Degrade gracefully on failure.
  let candidates: RetrievedFood[] = [];
  try {
    candidates = await retrieveFoods(text, 12);
  } catch {
    candidates = [];
  }

  // Abort if Groq doesn't respond in time, so the UI never hangs.
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
          { role: "system", content: buildSystemPrompt(candidates) },
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
    throw await aiHttpError(res, "food-parse");
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

  const items = rawItems
    .map(coerceItem)
    .filter((item): item is ParsedFoodItem => item !== null);

  // Pass 1: ground against the meal-wide candidates (+ trusted catalog).
  const grounded = groundParsedFoodItems(items, { candidates, rawText: text });
  // Pass 2 (step 4): items that still lack a trusted match get their OWN
  // retrieval by item name — multi-item meals stop sharing one skewed candidate
  // pool. LEXICAL-ONLY (no embedding round-trip) so logging stays fast; item
  // names are short and literal after the LLM split, so lexical recall is fine.
  return regroundUnmatchedItems(grounded, lexicalRetrieveFoods);
}
