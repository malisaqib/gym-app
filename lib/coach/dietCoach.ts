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

/**
 * Pull the phrase(s) the user wants to AVOID out of free text. We grab the words
 * after a negation cue up to the next conjunction/punctuation. The planner then
 * substring-matches these against catalog food names, so a loose capture like
 * "the whey protein shake thing" still correctly drops "Whey protein shake".
 */
function avoidPhrases(text: string): string[] {
  const t = text.toLowerCase();
  const phrases: string[] = [];
  // English: "no/avoid/without/skip/don't/exclude/hate/allergic to <stuff>"
  const re =
    /\b(?:no|not|without|avoid|skip|don'?t|can'?t|cannot|exclude|remove|hate|allergic to)\s+(.+?)(?=\b(?:but|and|since|because|cause|as|with|plz|please)\b|[,.;]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const p = m[1].replace(/\b(the|a|an|any|my|adding|having|eating|thing|things)\b/g, " ").trim();
    if (p.length >= 3) phrases.push(p);
  }
  // Roman Urdu: "<stuff> nahi/mat/chor"
  const reUrdu = /([a-z][a-z\s]{2,30}?)\s+(?:nahi|mat|chor)\b/g;
  while ((m = reUrdu.exec(t)) !== null) {
    const p = m[1].trim();
    if (p.length >= 3) phrases.push(p);
  }
  return [...new Set(phrases)];
}

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

  const foods = avoidPhrases(text);
  if (foods.length) out.excludeFoods = foods;
  return out;
}

/** Union two partial filters (OR vegetarian, union excludes). */
function unionPartial(a: Partial<DietFilter>, b: Partial<DietFilter>): Partial<DietFilter> {
  const out: Partial<DietFilter> = {};
  if (a.vegetarian || b.vegetarian) out.vegetarian = true;
  const region = a.regionFocus ?? b.regionFocus;
  if (region) out.regionFocus = region;
  const tags = [...new Set([...(a.excludeTags ?? []), ...(b.excludeTags ?? [])])];
  if (tags.length) out.excludeTags = tags;
  const foods = [...new Set([...(a.excludeFoods ?? []), ...(b.excludeFoods ?? [])])];
  if (foods.length) out.excludeFoods = foods;
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
{"vegetarian": boolean, "excludeTags": string[], "excludeFoods": string[], "regionFocus": "desi" | "western" | null}
- excludeTags: whole categories to drop, ONLY from: ${EXCLUDABLE.join(", ")}. Map foods to these (e.g. "no mutton/steak" -> "beef"; "no seafood/prawns" -> "fish").
- excludeFoods: any SPECIFIC item the user wants to avoid, as lowercase words in their wording (e.g. "whey protein shake", "biryani", "samosa"). Use this for anything that is NOT one of the categories above, including things they skip for budget/taste.
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
    // Always union the AI result with the deterministic parse, so a specific
    // "avoid X" is caught even when the model misses it.
    return unionPartial(sanitize(parsed), keywordPreferences(trimmed));
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
  if (Array.isArray(r.excludeFoods)) {
    const foods = r.excludeFoods
      .filter((f): f is string => typeof f === "string")
      .map((f) => f.toLowerCase().trim())
      .filter((f) => f.length >= 3)
      .slice(0, 12);
    if (foods.length) out.excludeFoods = [...new Set(foods)];
  }
  return out;
}
