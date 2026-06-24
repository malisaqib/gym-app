/**
 * No dedicated profile column exists yet, so only explicit powder language
 * opts in. Generic shake text is deliberately insufficient.
 */
export function explicitProteinPowderOptIn(text: string): boolean {
  return /\b(whey|protein\s*(?:powder|shake)|protein supplement)\b/i.test(text);
}
