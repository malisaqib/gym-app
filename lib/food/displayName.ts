const NUMBER_WORDS = [
  "a",
  "an",
  "one",
  "two",
  "three",
  "four",
  "five",
  "ek",
  "aik",
  "do",
  "teen",
  "char",
  "chaar",
];

const NUMBER_WORD_SET = new Set(NUMBER_WORDS);
const SERVING_WORD_SET = new Set([
  "cup",
  "cups",
  "glass",
  "glasses",
  "plate",
  "plates",
  "bowl",
  "bowls",
  "katori",
  "katoris",
  "pyali",
  "pyalis",
  "serving",
  "servings",
  "portion",
  "portions",
  "scoop",
  "scoops",
  "slice",
  "slices",
  "piece",
  "pieces",
  "egg",
  "eggs",
  "roti",
  "rotis",
  "chapati",
  "chapatis",
  "paratha",
  "parathas",
  "naan",
  "naans",
  "kabab",
  "kababs",
  "kebab",
  "kebabs",
]);

function isQuantityToken(token: string): boolean {
  const t = token.toLowerCase();
  return /^\d+(?:\.\d+)?$/.test(t) || NUMBER_WORD_SET.has(t);
}

function stripParenthesizedQuantity(name: string): string {
  return name.replace(/\s*\(([^()]*)\)\s*$/, (match, inner: string) => {
    const tokens = inner.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return tokens.length === 2 && isQuantityToken(tokens[0]) && SERVING_WORD_SET.has(tokens[1]) ? "" : match;
  });
}

/**
 * Visible names should not carry the quantity when the UI also renders the live
 * amount beside it. Otherwise a scaled item can read "2 roti · 1 roti".
 */
export function displayNameForQuantity(name: string): string {
  const original = name.trim().replace(/\s+/g, " ");
  if (!original) return name;

  const words = original.split(/\s+/);
  if (words.length > 1 && isQuantityToken(words[0])) words.shift();
  if (words.length > 1 && !words[1].startsWith("(") && SERVING_WORD_SET.has(words[0].toLowerCase())) {
    words.shift();
    if (words[0]?.toLowerCase() === "of") words.shift();
  }

  let out = stripParenthesizedQuantity(words.join(" "));
  out = out.trim().replace(/\s+/g, " ");

  return out || original;
}
