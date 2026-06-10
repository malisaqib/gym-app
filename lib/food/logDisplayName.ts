import type { ParsedFoodItem } from "./parse.ts";
import { normalizeFoodText } from "./searchRank.ts";

const QUANTITY_WORDS = [
  "a",
  "an",
  "one",
  "two",
  "three",
  "four",
  "five",
  "half",
  "ek",
  "aik",
  "do",
  "teen",
  "char",
  "chaar",
  "adha",
];

const SERVING_WORDS = [
  "cup",
  "cups",
  "glass",
  "glasses",
  "plate",
  "plates",
  "bowl",
  "bowls",
  "katori",
  "pyali",
  "serving",
  "servings",
  "scoop",
  "scoops",
  "g",
  "gram",
  "grams",
];

function cleanTypedFoodName(text: string): string {
  let out = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\-]+|[,.;:\-]+$/g, "");

  out = out.replace(/^(?:today\s+)?i\s+(?:had|ate|drank)\s+/i, "");
  out = out.replace(/^(?:had|ate|drank)\s+/i, "");

  out = out.replace(new RegExp(`^(?:\\d+(?:\\.\\d+)?|${QUANTITY_WORDS.join("|")})\\s+`, "i"), "");
  out = out.replace(new RegExp(`^(?:${SERVING_WORDS.join("|")})\\s+(?:of\\s+)?`, "i"), "");

  return out.trim();
}

function looksLikeDatabaseLabel(name: string): boolean {
  return /[,/()]| fast food|restaurant|commercial|prepared/i.test(name);
}

/**
 * Free-text logging should display what the user meant, not a long USDA-style
 * candidate label. Nutrition can still come from the matched candidate.
 */
export function displayNameForLoggedFood(rawText: string, item: ParsedFoodItem, itemCount: number): string {
  const parsedName = item.food_name.trim();
  if (itemCount !== 1) return parsedName;

  const typed = cleanTypedFoodName(rawText);
  const words = normalizeFoodText(typed).split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return parsedName;

  const parsedNorm = normalizeFoodText(parsedName);
  const typedNorm = normalizeFoodText(typed);
  const typedMatchesParsed = words.every((word) => parsedNorm.includes(word));

  if (looksLikeDatabaseLabel(parsedName) || typedMatchesParsed) return typed;
  return parsedName;
}
