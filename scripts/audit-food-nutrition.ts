// Read-only nutrition data audit for the live `foods` table plus FOOD_CATALOG.
//
//   node --env-file=.env.local scripts/audit-food-nutrition.ts
//
// Optional:
//   STRICT=1       exit non-zero when error-level issues exist
//   AUDIT_JSON=... write the full issue list to a JSON file
//
// This script changes nothing in Supabase. It is meant to catch trust-breaking
// food data problems before they reach logging, search, or diet plans.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { FOOD_CATALOG, type CatalogFood } from "../lib/diet/foodCatalog.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const STRICT = process.env.STRICT === "1";
const JSON_OUT = process.env.AUDIT_JSON;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

type Severity = "error" | "warn" | "info";
type FoodKind = "db" | "catalog";

interface DbFoodRow {
  id: string;
  name: string;
  aliases?: string[] | null;
  region?: string | null;
  portion?: string | null;
  portion_grams?: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source?: string | null;
  verified?: boolean | null;
  brand?: string | null;
  serving_grams?: number | null;
  calories_per_100g?: number | null;
  protein_g_per_100g?: number | null;
  carbs_g_per_100g?: number | null;
  fat_g_per_100g?: number | null;
  plan_eligible?: boolean | null;
  classification_status?: string | null;
}

interface AuditFood {
  kind: FoodKind;
  id: string;
  name: string;
  aliases: string[];
  region: string | null;
  portion: string;
  portionGrams: number | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  verified: boolean | null;
  planEligible: boolean | null;
  classificationStatus: string | null;
  brand: string | null;
  per100?: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
}

interface Issue {
  severity: Severity;
  code: string;
  kind: FoodKind;
  id: string;
  name: string;
  message: string;
  details?: Record<string, unknown>;
}

const BASE_SELECT =
  "id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source";
const LAYERED_SELECT = [
  BASE_SELECT,
  "verified",
  "brand",
  "serving_grams",
  "calories_per_100g",
  "protein_g_per_100g",
  "carbs_g_per_100g",
  "fat_g_per_100g",
  "plan_eligible",
  "classification_status",
].join(",");

const SERVING_GRAMS: Record<string, number> = {
  plate: 350,
  plates: 350,
  katori: 200,
  pyali: 200,
  bowl: 250,
  bowls: 250,
  glass: 250,
  glasses: 250,
  cup: 200,
  cups: 200,
  mug: 250,
  serving: 200,
  servings: 200,
  portion: 200,
  portions: 200,
  can: 150,
  scoop: 30,
  scoops: 30,
  egg: 50,
  eggs: 50,
};

// "sweet" alone is NOT flagged — it false-positives on whole foods like sweet
// potato / sweet peppers / sweet cherries; only sweet bakery/recipe forms count.
const UNSAFE_PLAN_RE =
  /\b(fast ?food|restaurant|cola|soft drink|soda|candy|chocolate|cookies?|cakes?|desserts?|ice creams?|fries|fried|burger|pizza|samosa|pakora|shake|smoothie|sweet (?:rolls?|bread|cheese|yeast|recipe)|sweetened|whey|supplement|protein bar)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function leadingCount(value: string): number {
  if (value === "one" || value === "a" || value === "an") return 1;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function gramsFromPortion(portion: string): number | null {
  const explicit = portion.match(/(?:~|\(|\s|^)(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b/i);
  if (explicit) return Number(explicit[1]);

  const leading = portion.trim().match(/^(\d+(?:\.\d+)?|one|a|an)\s+([a-z]+)/i);
  if (leading && SERVING_GRAMS[leading[2]]) return leadingCount(leading[1]) * SERVING_GRAMS[leading[2]];
  return null;
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0.0%";
}

function toDbFood(row: DbFoodRow): AuditFood {
  return {
    kind: "db",
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    region: row.region ?? null,
    portion: row.portion ?? "",
    portionGrams: finiteNumber(row.portion_grams),
    servingGrams: finiteNumber(row.serving_grams),
    calories: Number(row.calories),
    protein: Number(row.protein_g),
    carbs: Number(row.carbs_g),
    fat: Number(row.fat_g),
    source: row.source ?? "unknown",
    verified: row.verified ?? null,
    planEligible: row.plan_eligible ?? null,
    classificationStatus: row.classification_status ?? null,
    brand: row.brand ?? null,
    per100: {
      calories: finiteNumber(row.calories_per_100g),
      protein: finiteNumber(row.protein_g_per_100g),
      carbs: finiteNumber(row.carbs_g_per_100g),
      fat: finiteNumber(row.fat_g_per_100g),
    },
  };
}

function toCatalogFood(food: CatalogFood): AuditFood {
  const grams = gramsFromPortion(food.portion);
  return {
    kind: "catalog",
    id: food.id,
    name: food.name,
    aliases: food.aliases ?? [],
    region: food.region,
    portion: food.portion,
    portionGrams: grams,
    servingGrams: grams,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    source: "food_catalog",
    verified: true,
    planEligible: true,
    classificationStatus: "catalog",
    brand: null,
  };
}

async function fetchFoods(select: string): Promise<DbFoodRow[]> {
  const rows: DbFoodRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("foods").select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as unknown as DbFoodRow[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function fetchDbFoods(): Promise<{ foods: AuditFood[]; layered: boolean }> {
  try {
    return { foods: (await fetchFoods(LAYERED_SELECT)).map(toDbFood), layered: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/column .* does not exist/i.test(msg)) throw e;
    console.warn("Layered food columns are missing; falling back to the legacy foods select.");
    return { foods: (await fetchFoods(BASE_SELECT)).map(toDbFood), layered: false };
  }
}

function addIssue(issues: Issue[], food: AuditFood, severity: Severity, code: string, message: string, details?: Record<string, unknown>) {
  issues.push({ severity, code, kind: food.kind, id: food.id, name: food.name, message, details });
}

function macroKcal(food: AuditFood): number {
  return food.protein * 4 + food.carbs * 4 + food.fat * 9;
}

function kcalPer100(food: AuditFood): number | null {
  const grams = food.servingGrams ?? food.portionGrams;
  return grams && grams > 0 ? (food.calories / grams) * 100 : null;
}

function nutrientPer100(value: number, food: AuditFood): number | null {
  const grams = food.servingGrams ?? food.portionGrams;
  return grams && grams > 0 ? (value / grams) * 100 : null;
}

function auditOne(food: AuditFood, issues: Issue[]) {
  if (!food.name.trim()) addIssue(issues, food, "error", "missing_name", "Food has no name.");
  if (!food.portion.trim()) addIssue(issues, food, "warn", "missing_portion", "Food has no portion label.");

  for (const [field, value] of Object.entries({
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      addIssue(issues, food, "error", "invalid_macro", `${field} is missing, non-finite, or negative.`, { field, value });
    }
  }

  const calories = food.calories;
  const fromMacros = macroKcal(food);
  if (calories === 0 && fromMacros > 10) {
    addIssue(issues, food, "error", "zero_calories_with_macros", "Calories are zero but macros contain energy.", {
      macroKcal: Math.round(fromMacros),
    });
  }
  if (calories > 0 && fromMacros > calories + Math.max(60, calories * 0.35)) {
    addIssue(issues, food, "warn", "macro_energy_exceeds_calories", "Protein/carbs/fat imply much more energy than calories.", {
      calories,
      macroKcal: Math.round(fromMacros),
    });
  }
  if (calories >= 100 && fromMacros < calories * 0.2) {
    addIssue(issues, food, "warn", "calories_without_macros", "Calories are high but macro fields explain very little energy.", {
      calories,
      macroKcal: Math.round(fromMacros),
    });
  }
  if (food.protein * 4 > calories + Math.max(30, calories * 0.3)) {
    addIssue(issues, food, "warn", "protein_exceeds_energy", "Protein grams are too high for the listed calories.", {
      calories,
      protein: food.protein,
    });
  }

  const grams = food.servingGrams ?? food.portionGrams;
  if (!grams || grams <= 0) {
    addIssue(issues, food, food.kind === "catalog" ? "warn" : "info", "missing_serving_grams", "No gram anchor for this serving; portion scaling will be less trustworthy.");
  } else {
    const kcal100 = kcalPer100(food)!;
    const p100 = nutrientPer100(food.protein, food)!;
    const c100 = nutrientPer100(food.carbs, food)!;
    const f100 = nutrientPer100(food.fat, food)!;
    if (kcal100 > 950) addIssue(issues, food, "error", "calories_per_100g_too_high", "Calories per 100g exceed a realistic food maximum.", { kcal100: Math.round(kcal100) });
    for (const [field, value] of Object.entries({ protein: p100, carbs: c100, fat: f100 })) {
      if (value > 105) addIssue(issues, food, "error", "grams_per_100g_too_high", `${field} exceeds 100g per 100g food.`, { field, value: Math.round(value) });
    }

    if (food.per100?.calories != null && Math.abs(food.per100.calories - kcal100) > Math.max(5, kcal100 * 0.05)) {
      addIssue(issues, food, "warn", "per100_backfill_mismatch", "Stored calories_per_100g does not match serving calories/grams.", {
        expected: Math.round(kcal100 * 10) / 10,
        stored: food.per100.calories,
      });
    }
  }

  if (food.kind === "db" && food.source === "curated" && food.verified === false) {
    addIssue(issues, food, "error", "curated_not_verified", "Curated DB row should be verified.");
  }

  // Info, not warn: classifier-approved-but-unverified is the ACCEPTED state for
  // imported plan foods (DB-flag-gated pool); human review upgrades them later.
  if (food.planEligible && food.verified === false) {
    addIssue(issues, food, "info", "plan_eligible_unverified", "Plan-eligible food is not verified (classifier-approved).");
  }

  // Curated/catalog rows are hand-reviewed — samosa/pakora/shakes are deliberate
  // plan snacks there. Only flag IMPORTED plan-eligible rows for review.
  const curatedReviewed = food.kind === "catalog" || food.source === "curated" || food.source === "food_catalog";
  const unsafeText = `${food.name} ${food.portion} ${food.aliases.join(" ")} ${food.brand ?? ""}`;
  if (food.planEligible && !curatedReviewed && UNSAFE_PLAN_RE.test(unsafeText)) {
    addIssue(issues, food, "warn", "possibly_unsafe_plan_food", "Plan-eligible food looks like a branded/fast-food/sweet/supplement item that needs review.");
  }
}

function auditDuplicates(foods: AuditFood[], issues: Issue[], scope: string) {
  const byName = new Map<string, AuditFood[]>();
  for (const food of foods) {
    const key = normalize(food.name);
    if (!key) continue;
    const group = byName.get(key);
    if (group) group.push(food);
    else byName.set(key, [food]);
  }

  for (const [key, group] of byName.entries()) {
    if (group.length < 2) continue;
    const anchor = group[0];
    addIssue(issues, anchor, "warn", "duplicate_normalized_name", `Duplicate normalized name in ${scope}: "${key}".`, {
      ids: group.map((f) => `${f.kind}:${f.id}`),
    });
  }
}

function buildExactKeyIndex(foods: AuditFood[]): Map<string, AuditFood[]> {
  const index = new Map<string, AuditFood[]>();
  for (const food of foods) {
    for (const raw of [food.name, ...food.aliases]) {
      const key = normalize(raw);
      if (!key) continue;
      const group = index.get(key);
      if (group) group.push(food);
      else index.set(key, [food]);
    }
  }
  return index;
}

function auditCatalogCoverage(dbFoods: AuditFood[], catalogFoods: AuditFood[], issues: Issue[]) {
  const dbIndex = buildExactKeyIndex(dbFoods);

  for (const food of catalogFoods) {
    const keys = [food.name, ...food.aliases].map(normalize).filter(Boolean);
    const matches = keys.flatMap((key) => dbIndex.get(key) ?? []);
    if (matches.length === 0) {
      addIssue(issues, food, "warn", "catalog_missing_from_foods", "Catalog food is not present in the Supabase foods search table by exact name/alias.");
      continue;
    }

    const sameName = matches.find((m) => normalize(m.name) === normalize(food.name));
    if (!sameName) continue;
    const a = kcalPer100(food);
    const b = kcalPer100(sameName);
    const pa = nutrientPer100(food.protein, food);
    const pb = nutrientPer100(sameName.protein, sameName);
    if (a != null && b != null && Math.abs(a - b) > Math.max(40, Math.min(a, b) * 0.25)) {
      addIssue(issues, food, "warn", "catalog_db_calorie_mismatch", "Catalog and DB have a large per-100g calorie mismatch for the same name.", {
        catalogKcal100: Math.round(a),
        dbKcal100: Math.round(b),
        dbId: sameName.id,
      });
    }
    if (pa != null && pb != null && Math.abs(pa - pb) > Math.max(5, Math.min(pa, pb) * 0.35)) {
      addIssue(issues, food, "warn", "catalog_db_protein_mismatch", "Catalog and DB have a large per-100g protein mismatch for the same name.", {
        catalogProtein100: Math.round(pa),
        dbProtein100: Math.round(pb),
        dbId: sameName.id,
      });
    }
  }
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

function printIssues(issues: Issue[]) {
  const bySeverity = countBy(issues.map((i) => i.severity));
  const byCode = new Map<string, number>();
  for (const issue of issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);

  console.log("\n=== issue summary ===");
  console.log(`errors: ${bySeverity.error ?? 0} | warnings: ${bySeverity.warn ?? 0} | info: ${bySeverity.info ?? 0}`);
  console.log("\nby code:");
  [...byCode.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([code, count]) => console.log(`  ${code.padEnd(32)} ${count}`));

  const priority = { error: 0, warn: 1, info: 2 } satisfies Record<Severity, number>;
  const sample = [...issues].sort((a, b) => priority[a.severity] - priority[b.severity] || a.code.localeCompare(b.code)).slice(0, 80);
  console.log("\n--- priority sample (first 80) ---");
  for (const issue of sample) {
    console.log(`[${issue.severity.toUpperCase()}] ${issue.code} | ${issue.kind}:${issue.id} | ${issue.name}`);
    console.log(`  ${issue.message}`);
    if (issue.details) console.log(`  ${JSON.stringify(issue.details)}`);
  }
}

const { foods: dbFoods, layered } = await fetchDbFoods();
const catalogFoods = FOOD_CATALOG.map(toCatalogFood);
const allFoods = [...dbFoods, ...catalogFoods];
const issues: Issue[] = [];

for (const food of allFoods) auditOne(food, issues);
auditDuplicates(dbFoods, issues, "foods table");
auditDuplicates(catalogFoods, issues, "FOOD_CATALOG");
auditCatalogCoverage(dbFoods, catalogFoods, issues);

const bySource = countBy(dbFoods.map((f) => f.source));
const verified = dbFoods.filter((f) => f.verified).length;
const planEligible = dbFoods.filter((f) => f.planEligible).length;
const withGramAnchor = allFoods.filter((f) => (f.servingGrams ?? f.portionGrams ?? 0) > 0).length;

console.log("\n=== food nutrition audit ===");
console.log(`DB foods:             ${dbFoods.length}`);
console.log(`FOOD_CATALOG foods:   ${catalogFoods.length}`);
console.log(`Layered DB columns:   ${layered ? "yes" : "no"}`);
console.log(`DB by source:         ${JSON.stringify(bySource)}`);
console.log(`DB verified=true:     ${verified} (${pct(verified, dbFoods.length)})`);
console.log(`DB plan_eligible=true:${planEligible} (${pct(planEligible, dbFoods.length)})`);
console.log(`Foods with gram anchor:${withGramAnchor}/${allFoods.length} (${pct(withGramAnchor, allFoods.length)})`);

printIssues(issues);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), summary: { dbFoods: dbFoods.length, catalogFoods: catalogFoods.length }, issues }, null, 2));
  console.log(`\nWrote JSON issue report to ${JSON_OUT}`);
}

if (STRICT && issues.some((i) => i.severity === "error")) {
  process.exit(1);
}
