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
};

export function expandFoodQueries(query: string): string[] {
  const normalized = normalizeFoodText(query);
  if (!normalized) return [];
  const expanded = new Set<string>([query.trim()]);
  const direct = QUERY_EXPANSIONS[normalized] ?? [];
  direct.forEach((term) => expanded.add(term));

  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.length >= 3) expanded.add(token);
    for (const term of QUERY_EXPANSIONS[token] ?? []) expanded.add(term);
  }

  return [...expanded].filter((term) => term.trim().length >= 2);
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

function formAdjustment(food: RankableFood, lexical: number): number {
  if (lexical <= 0) return 0;
  const name = normalizeFoodText(food.name);
  let score = 0;
  if (/\b(raw|cooked|boiled|roasted|plain|fresh)\b/.test(name)) score += 8;
  if (/\b(beverages?|juice|smoothie|nectar|dried|sweetened|syrup|babyfood|powder|isolate)\b/.test(name)) score -= 25;
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
  return lexical + sourceBoost(food, lexical) + formAdjustment(food, lexical) + dbScore;
}

export function rankFoodsForSearch<T extends RankableFood>(query: string, foods: readonly T[]): T[] {
  return foods
    .map((food, index) => ({ food, index, score: foodSearchScore(query, food) }))
    .sort((a, b) => b.score - a.score || Number(b.food.score ?? 0) - Number(a.food.score ?? 0) || a.index - b.index)
    .map((x) => x.food);
}
