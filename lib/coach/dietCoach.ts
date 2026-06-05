import type { Lang } from "@/lib/database.types";
import type { DietFilter } from "@/lib/diet/planner";

/**
 * SERVER ONLY. The AI's ONLY job here is INTERPRETATION: turn the user's free
 * text ("I don't eat beef, hostel food only") into a structured filter delta the
 * deterministic planner understands. It never invents foods or numbers. Falls
 * back to a simple keyword parser when there's no key or the call fails, so the
 * generator always works without AI.
 */

// The tags the planner understands for exclusion (must match foodCatalog tags).
const EXCLUDABLE = ["beef", "chicken", "fish", "egg", "dairy", "nuts"] as const;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/** Deterministic, dependency-free parse — also the fallback when AI is off. */
export function keywordPreferences(text: string): Partial<DietFilter> {
  const t = ` ${text.toLowerCase()} `;
  const out: Partial<DietFilter> = {};

  if (/\b(veg|vegetarian|no meat|meat nahi|sabzi only)\b/.test(t)) out.vegetarian = true;
  if (/\b(desi|pakistani|local)\b/.test(t)) out.regionFocus = "desi";
  else if (/\b(western|continental)\b/.test(t)) out.regionFocus = "western";

  const exclude: string[] = [];
  for (const tag of EXCLUDABLE) {
    // "no beef", "without beef", "don't eat beef", "beef nahi", "avoid beef"
    const re = new RegExp(`(no|without|avoid|skip|dont|don't|na?hi)\\s+\\w*\\s*${tag}|${tag}\\s+(nahi|mat)`, "i");
    if (re.test(t)) exclude.push(tag);
  }
  if (exclude.length) out.excludeTags = exclude;
  return out;
}

export async function parsePreferences(text: string, lang: Lang): Promise<Partial<DietFilter>> {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return keywordPreferences(trimmed);

  const langName = lang === "roman_urdu" ? "Roman Urdu" : "English";
  const system = `You convert a user's food preferences into JSON for a meal planner. The text may be ${langName} or a mix.
Return ONLY this JSON shape:
{"vegetarian": boolean, "excludeTags": string[], "regionFocus": "desi" | "western" | null}
- excludeTags may ONLY contain values from: ${EXCLUDABLE.join(", ")}. Map foods to these (e.g. "no mutton/steak" -> "beef"; "no seafood/prawns" -> "fish").
- vegetarian=true only if they clearly avoid all meat/fish.
- regionFocus only if they clearly prefer desi or western food; otherwise null.
Do not add other keys.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: trimmed },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return keywordPreferences(trimmed);
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    return sanitize(parsed);
  } catch {
    return keywordPreferences(trimmed);
  } finally {
    clearTimeout(timeout);
  }
}

// Never trust the model's shape: keep only known keys/values.
function sanitize(raw: unknown): Partial<DietFilter> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<DietFilter> = {};
  if (typeof r.vegetarian === "boolean") out.vegetarian = r.vegetarian;
  if (r.regionFocus === "desi" || r.regionFocus === "western") out.regionFocus = r.regionFocus;
  if (Array.isArray(r.excludeTags)) {
    const tags = r.excludeTags.filter(
      (t): t is string => typeof t === "string" && (EXCLUDABLE as readonly string[]).includes(t)
    );
    if (tags.length) out.excludeTags = [...new Set(tags)];
  }
  return out;
}
