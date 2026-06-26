export interface RankableFood {
  name: string;
  aliases?: string[] | null;
  source?: string | null;
  score?: number | null;
}

export type FoodSearchQuality = "verified" | "recent" | "imported" | "estimated";

export function normalizeFoodText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const QUERY_EXPANSIONS: Record<string, string[]> = {
  aam: ["mango"],
  anda: ["egg"],
  anday: ["egg"],
  doodh: ["milk"],
  dahi: ["yogurt", "curd"],
  chawal: ["rice"],
  gosht: ["beef", "mutton"],
  murgh: ["chicken"],
  murghi: ["chicken"],
  machli: ["fish"],
  aloo: ["potato"],
  sabzi: ["vegetable"],
  chana: ["chickpea"],
  cholay: ["chickpea"],
  lobia: ["black eyed peas"],
  // Spelling bridges to USDA/FNDDS dish names.
  kebab: ["kabob"],
  kabab: ["kabob", "kebab"],
  kebabs: ["kabob"],
  kababs: ["kabob", "kebab"],
  handi: ["curry"],
  karahi: ["curry"],
  daal: ["dal", "lentil"],
  dhal: ["dal", "lentil"],
  salan: ["curry"],
  keema: ["ground beef"],
  qeema: ["ground beef"],
};

export interface ExpandedQueryTerm {
  term: string;
  /**
   * The user's word this term stands for. Differs from `term` ONLY for true
   * dictionary synonyms (aam -> mango), where callers may attach it as an alias
   * so "aam" exact-matches mango rows. Token-split terms must NOT carry the full
   * query: appending "beef kebab" onto every row found via the token "beef" made
   * grounding believe a plain steak WAS a beef kebab.
   */
  sourceWord: string;
}

export function expandFoodQueryTerms(query: string): ExpandedQueryTerm[] {
  const normalized = normalizeFoodText(query);
  if (!normalized) return [];
  const out = new Map<string, ExpandedQueryTerm>();
  const add = (term: string, sourceWord: string) => {
    const t = term.trim();
    if (t.length >= 2 && !out.has(t)) out.set(t, { term: t, sourceWord });
  };

  add(query.trim(), query.trim());
  for (const term of QUERY_EXPANSIONS[normalized] ?? []) add(term, query.trim());

  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.length >= 3) add(token, token);
    for (const term of QUERY_EXPANSIONS[token] ?? []) add(term, token);
  }

  return [...out.values()];
}

export function expandFoodQueries(query: string): string[] {
  return expandFoodQueryTerms(query).map((t) => t.term);
}

export function qualityForFoodSource(source: string | null | undefined): FoodSearchQuality {
  if (source === "curated") return "verified";
  if (source === "user_estimate") return "estimated";
  return "imported";
}

export function labelForFoodQuality(quality: FoodSearchQuality): string {
  if (quality === "verified") return "Verified";
  if (quality === "recent") return "Recent";
  if (quality === "estimated") return "Estimated";
  return "Imported";
}

const wordsOf = (value: string) => normalizeFoodText(value).split(/\s+/).filter(Boolean);

function wordMatches(word: string, token: string): boolean {
  return word === token || word === `${token}s` || token === `${word}s`;
}

function hasToken(words: string[], token: string): boolean {
  return words.some((word) => wordMatches(word, token));
}

function startsWithTokens(words: string[], tokens: string[]): boolean {
  if (tokens.length === 0 || words.length < tokens.length) return false;
  return tokens.every((token, index) => wordMatches(words[index], token));
}

const OBSCURE_IMPORTED_TERMS = [
  "straw",
  "enoki",
  "shiitake",
  "maitake",
  "morel",
  "chanterelle",
  "wood ear",
  "cloud ear",
  "truffle",
  "bamboo shoot",
  "bamboo shoots",
  "hearts of palm",
  "cactus",
  "nopales",
  "seaweed",
  "kelp",
  "dulse",
  "burdock",
  "fiddlehead",
  "taro leaves",
  "cassava leaves",
  "chayote shoots",
];

function hasSpecificObscureQuery(query: string, term: string): boolean {
  const queryWords = wordsOf(query);
  return wordsOf(term).every((word) => hasToken(queryWords, word));
}

// A bare single-word query ("banana", "chana", "fish") means the PLAIN food, not
// a compound/derived dish that merely starts with it. These terms, when present
// in a candidate's name/aliases but NOT in the query, drop that candidate below
// the plain food — so "banana" wins over "Banana shake" and "chana" over "Chana
// chaat", while "banana shake" / "chana chaat" (the term IS in the query) are
// untouched. Only applies to single-token queries, so multi-word searches and
// the grounding score bands are unaffected.
const COMPOUND_TERMS = new Set([
  "shake",
  "milkshake",
  "smoothie",
  "chaat",
  "fried",
  "curry",
  "salan",
  "sandwich",
  "burger",
  "pizza",
  "juice",
]);
const COMPOUND_PENALTY = 60;

function compoundPenalty(query: string, food: RankableFood): number {
  const queryWords = wordsOf(query);
  if (queryWords.length !== 1) return 0; // only bare base-word queries
  const querySet = new Set(queryWords);
  const foodWords = [...wordsOf(food.name), ...(food.aliases ?? []).flatMap(wordsOf)];
  const hasFoodOnlyCompound = foodWords.some(
    (word) => COMPOUND_TERMS.has(word) && !querySet.has(word)
  );
  return hasFoodOnlyCompound ? -COMPOUND_PENALTY : 0;
}

function formAdjustment(query: string, food: RankableFood, lexical: number): number {
  if (lexical <= 0) return 0;
  const name = normalizeFoodText(food.name);
  let score = 0;
  if (/\b(raw|cooked|boiled|roasted|plain|fresh)\b/.test(name)) score += 8;
  if (/\b(beverages?|juice|smoothie|nectar|dried|sweetened|syrup|babyfood|powder|isolate)\b/.test(name)) score -= 25;
  if (qualityForFoodSource(food.source) === "imported") {
    const obscureTerm = OBSCURE_IMPORTED_TERMS.find((term) => hasSpecificObscureQuery(food.name, term));
    if (obscureTerm && !hasSpecificObscureQuery(query, obscureTerm)) score -= 40;
  }
  score += compoundPenalty(query, food);
  return score;
}

function tokenScore(query: string, food: RankableFood): number {
  const q = normalizeFoodText(query);
  if (q.length < 2) return 0;

  const name = normalizeFoodText(food.name);
  const aliases = (food.aliases ?? []).map(normalizeFoodText).filter(Boolean);
  const nameWords = wordsOf(food.name);
  const aliasWords = aliases.flatMap(wordsOf);
  const hayWords = [...nameWords, ...aliasWords];
  const tokens = q.split(/\s+/).filter(Boolean);

  let score = 0;
  if (name === q) score += 90;
  else if (startsWithTokens(nameWords, tokens)) score += 60;
  else if (tokens.length > 0 && tokens.every((t) => hasToken(nameWords, t))) score += 35;

  if (aliases.some((a) => a === q)) score += 80;
  else if (aliases.some((a) => startsWithTokens(wordsOf(a), tokens))) score += 50;
  else if (tokens.length > 0 && tokens.every((t) => hasToken(aliasWords, t))) score += 30;

  if (tokens.length > 0 && tokens.every((t) => hasToken(nameWords, t))) score += 25;
  else if (tokens.length > 0 && tokens.every((t) => hasToken(hayWords, t))) score += 15;

  return score;
}

function sourceBoost(food: RankableFood, lexical: number): number {
  if (lexical <= 0) return 0;
  const quality = qualityForFoodSource(food.source);
  if (quality === "verified") return 35;
  if (quality === "estimated") return 10;
  return 0;
}

export function foodSearchScore(query: string, food: RankableFood): number {
  const lexical = tokenScore(query, food);
  const dbScore = Number(food.score ?? 0) * 10;
  return lexical + sourceBoost(food, lexical) + formAdjustment(query, food, lexical) + dbScore;
}

export function rankFoodsForSearch<T extends RankableFood>(query: string, foods: readonly T[]): T[] {
  return foods
    .map((food, index) => ({ food, index, score: foodSearchScore(query, food) }))
    .sort((a, b) => b.score - a.score || Number(b.food.score ?? 0) - Number(a.food.score ?? 0) || a.index - b.index)
    .map((x) => x.food);
}
