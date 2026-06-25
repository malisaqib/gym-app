import type { ProteinPowderPreference } from "@/lib/database.types";

/** Clear legacy language only. Generic shake text is deliberately insufficient. */
export function explicitProteinPowderOptIn(text: string): boolean {
  return /\b(whey|protein\s*(?:powder|shake)|protein supplement)\b/i.test(text);
}

/**
 * The stored preference is authoritative. Null/unknown keeps the backwards-
 * compatible legacy inference for clear powder language only.
 */
export function resolveProteinPowderPreference(
  preference: ProteinPowderPreference | null | undefined,
  legacyText: string
): boolean {
  if (preference === "enabled") return true;
  if (preference === "disabled") return false;
  return explicitProteinPowderOptIn(legacyText);
}
