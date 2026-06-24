import type { Lang, Region } from "@/lib/database.types";

/**
 * Region is a single profile field that steers the LLM's FOOD SUGGESTIONS
 * toward cuisine-appropriate options (a Pakistani user gets desi staples, a
 * US/Canada user gets Western ones). Diet Plan candidate selection also uses
 * it, while calorie/protein math and the food-logging RAG pipeline stay unchanged.
 *
 * Single source of truth for the allowed values, their bilingual labels (used by
 * onboarding + Settings dropdowns), and the cuisine lean passed to the LLM.
 */

// Order shown in the dropdown.
export const REGIONS: Region[] = ["pakistan", "india", "middle_east", "us_canada", "uk_europe", "other"];

export const REGION_LABELS: Record<Region, Record<Lang, string>> = {
  pakistan: { en: "Pakistan", roman_urdu: "Pakistan" },
  india: { en: "India", roman_urdu: "India" },
  middle_east: { en: "Middle East", roman_urdu: "Middle East" },
  us_canada: { en: "USA / Canada", roman_urdu: "USA / Canada" },
  uk_europe: { en: "UK / Europe", roman_urdu: "UK / Europe" },
  other: { en: "Other", roman_urdu: "Other" },
};

/** Narrow an untrusted value to a Region (for server-side validation). */
export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as string[]).includes(value);
}

/**
 * A short cuisine lean for the LLM food-suggestion prompts. Empty for "other"
 * (or unset) so the model stays bi-cuisine and doesn't get a false steer. This
 * Diet Plan candidate filtering separately uses the structured Region value.
 */
export function regionCuisineHint(region: Region | null | undefined): string {
  switch (region) {
    case "pakistan":
      return "Pakistani / South Asian (desi) home food";
    case "india":
      return "Indian / South Asian home food";
    case "middle_east":
      return "Middle Eastern home food";
    case "us_canada":
      return "American / Western everyday food";
    case "uk_europe":
      return "British / European (Western) everyday food";
    default:
      return ""; // "other" or unset → no steer; stay bi-cuisine
  }
}
