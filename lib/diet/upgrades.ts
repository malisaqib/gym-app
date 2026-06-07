import type { Lang } from "@/lib/database.types";

/**
 * Deterministic, opt-in "gentle upgrade" suggestions for the diet plan (Phase 2).
 *
 * Pure + tested. The rule is strict on TONE: we NEVER label a food bad/junk or
 * remove it. Each suggestion is an OPTIONAL smaller-portion or swap idea the user
 * can take or ignore, framed around keeping the food they love. No AI, no macros
 * changed here — this only reads the user's own words (their usual / keep foods)
 * and returns friendly nudges the UI shows as dismissible cards.
 */

export interface MealUpgrade {
  id: string;
  text: string;
}

interface UpgradeRule {
  id: string;
  test: RegExp; // the food/pattern we recognise
  guard?: RegExp; // optional extra condition that must ALSO be present
  en: string;
  roman_urdu: string;
}

// Order matters: the most useful, least-naggy ideas first. Output is capped so
// the user never feels lectured.
const RULES: UpgradeRule[] = [
  {
    id: "chai-sugar",
    test: /\b(chai|tea)\b/,
    guard: /\b(sugar|cheeni|cheene|meethi|sweet)\b|\d\s*(spoon|chamach|sugar|cheeni)/,
    en: "Chai's a lovely ritual — try one less spoon of sugar when you can. Same comfort, fewer empty calories.",
    roman_urdu: "Chai acha ritual hai — jab ho sake ek chamach cheeni kam karein. Maza wahi, calories kam.",
  },
  {
    id: "paratha",
    test: /\bparath[ae]?\b/,
    en: "Love paratha? Some days 1 instead of 2 — or add an egg or yogurt so it keeps you full longer.",
    roman_urdu: "Paratha pasand hai? Kabhi 2 ki jagah 1 — ya sath anda/dahi taake pet zyada der bhara rahe.",
  },
  {
    id: "fizzy",
    test: /\b(soft ?drinks?|cola|coke|pepsi|sprite|soda|fizzy|7up|seven ?up|mountain dew|dew)\b/,
    en: "Keep your drink — maybe swap one fizzy glass for water or fresh lassi. Easy calories saved, no big change.",
    roman_urdu: "Drink rakhein — kabhi ek fizzy glass ki jagah pani ya taza lassi. Asaan calories bachat.",
  },
  {
    id: "biryani",
    test: /\b(biryani|biriani|pulao|pilau|fried rice)\b/,
    en: "Biryani's a favourite — try a slightly smaller plate with extra salad or raita to balance it out.",
    roman_urdu: "Biryani favourite hai — thori chhoti plate sath salad ya raita se balance ho jati hai.",
  },
  {
    id: "fried",
    test: /\b(samosa|pakora|pakore|fries|fried|nimko|chips|roll|shawarma)\b/,
    en: "Fried treats can stay — a smaller portion, or baked/air-fried when it's easy, keeps them in your week.",
    roman_urdu: "Fried cheezein reh sakti hain — chhoti portion ya baked, taake hafte mein shaamil rahein.",
  },
  {
    id: "sweets",
    test: /\b(mithai|jalebi|gulab jamun|barfi|halwa|kheer|ice ?cream|cake|dessert|sweets?|chocolate)\b/,
    en: "Sweets can stay — enjoy a small piece rather than skipping them entirely. Balance beats banning.",
    roman_urdu: "Mithai reh sakti hai — poori chhornay ke bajaye chhota tukra enjoy karein. Balance behtar hai.",
  },
  {
    id: "juice",
    test: /\b(juice|nestle|fruit juice|packaged juice|squash|rooh afza|rooh-afza)\b/,
    en: "Packaged juice → a whole fruit when you can: more fiber, fills you up, the sweetness stays.",
    roman_urdu: "Packaged juice → jab ho sake poora phal: zyada fiber, pet bhara, mithas wahi.",
  },
  {
    id: "naan",
    test: /\bnaan\b/,
    en: "Naan's delicious — 1 is often plenty; pair it with extra protein so the meal still satisfies.",
    roman_urdu: "Naan mazedar hai — aksar 1 kaafi; sath thora extra protein taake meal poora lage.",
  },
];

/**
 * Scan the user's free-text usual/keep foods and return up to `max` gentle,
 * opt-in upgrade ideas. Deterministic for a given input.
 */
export function suggestUpgrades(text: string, lang: Lang = "en", max = 3): MealUpgrade[] {
  const t = ` ${(text ?? "").toLowerCase()} `;
  if (!t.trim()) return [];
  const out: MealUpgrade[] = [];
  for (const r of RULES) {
    if (!r.test.test(t)) continue;
    if (r.guard && !r.guard.test(t)) continue;
    out.push({ id: r.id, text: lang === "roman_urdu" ? r.roman_urdu : r.en });
    if (out.length >= max) break;
  }
  return out;
}
