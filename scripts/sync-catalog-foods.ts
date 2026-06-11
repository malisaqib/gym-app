// Sync FOOD_CATALOG (the hand-verified, desi-first meal catalog in code) into
// the live `foods` table so search, RAG grounding, and diet plans all read ONE
// trusted source with identical macros. Catalog values are authoritative.
//
//   DRY RUN (default):  node --env-file=.env.local scripts/sync-catalog-foods.ts
//   APPLY:              WRITE=1 node --env-file=.env.local scripts/sync-catalog-foods.ts
//
// Behaviour:
//   - Matches each catalog food against existing source='curated' rows only
//     (by source_id 'catalog:<id>', then normalized name, then alias overlap).
//     USDA rows are never modified.
//   - Match found  -> UPDATE the row to the catalog's name/macros/portion and
//     mark verified=true, plan_eligible=true, classification_status='reviewed_eligible'.
//   - No match     -> INSERT a new curated row (embedding null; match_foods
//     ranks embedding-less rows lexically, so it is searchable immediately;
//     run scripts/embed-foods.mjs later to add the semantic half).
//   - Existing curated rows NOT in the catalog are left alone (they still serve
//     logging search).
import { createClient } from "@supabase/supabase-js";
import { FOOD_CATALOG, type CatalogFood } from "../lib/diet/foodCatalog.ts";
import { normalizeFoodText } from "../lib/food/searchRank.ts";
import { gramsForServingUnit } from "../lib/food/quantity.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const WRITE = process.env.WRITE === "1";
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

interface DbRow {
  id: string;
  name: string;
  aliases: string[] | null;
  source: string | null;
  source_id: string | null;
  portion: string | null;
  portion_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Same portion→grams inference the grounding layer uses, so the DB row scales
// identically to the in-code catalog ("1 katori (~200g)" → 200, "2 roti" → unit serving).
function gramsFromPortion(portion: string): number | null {
  const explicit = portion.match(/(?:~|\(|\s|^)(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b/i);
  if (explicit) return Number(explicit[1]);
  const leadingUnit = portion.trim().match(/^(?:\d+(?:\.\d+)?|one|a|an)\s+([a-z]+)/i)?.[1];
  return leadingUnit ? gramsForServingUnit(leadingUnit) : null;
}

function searchTextFor(name: string, aliases: string[]): string {
  return [name, ...aliases].join(" ");
}

function per100(value: number, grams: number | null): number | null {
  return grams && grams > 0 ? Math.round((value / grams) * 100 * 10) / 10 : null;
}

function rowPayload(f: CatalogFood) {
  const grams = gramsFromPortion(f.portion);
  const aliases = [...new Set((f.aliases ?? []).map((a) => a.trim()).filter(Boolean))];
  return {
    name: f.name,
    aliases,
    search_text: searchTextFor(f.name, aliases),
    region: f.region,
    portion: f.portion,
    portion_grams: grams,
    calories: f.calories,
    protein_g: f.protein,
    carbs_g: f.carbs,
    fat_g: f.fat,
    source: "curated",
    source_id: `catalog:${f.id}`,
    verified: true,
    plan_eligible: true,
    classification_status: "reviewed_eligible",
    classification_reason: "catalog",
    serving_name: f.portion,
    serving_grams: grams,
    calories_per_100g: per100(f.calories, grams),
    protein_g_per_100g: per100(f.protein, grams),
    carbs_g_per_100g: per100(f.carbs, grams),
    fat_g_per_100g: per100(f.fat, grams),
    calories_per_serving: f.calories,
    protein_g_per_serving: f.protein,
    carbs_g_per_serving: f.carbs,
    fat_g_per_serving: f.fat,
  };
}

// --- load existing curated rows ----------------------------------------------
const { data: curatedRows, error } = await sb
  .from("foods")
  .select("id,name,aliases,source,source_id,portion,portion_grams,calories,protein_g,carbs_g,fat_g")
  .eq("source", "curated")
  .returns<DbRow[]>();
if (error) {
  console.error("fetch failed:", error.message);
  process.exit(1);
}

const bySourceId = new Map<string, DbRow>();
const byName = new Map<string, DbRow>(); // normalized DB name → row
const byAlias = new Map<string, DbRow>(); // normalized DB alias → row
for (const row of curatedRows ?? []) {
  if (row.source_id) bySourceId.set(row.source_id, row);
  const nameKey = normalizeFoodText(row.name);
  if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);
  for (const key of (row.aliases ?? []).map(normalizeFoodText)) {
    if (key && !byAlias.has(key)) byAlias.set(key, row);
  }
}

// Match priority: stable source_id, then name↔name, then name↔alias (either
// direction). Alias↔alias overlap is deliberately NOT a match — generic aliases
// like "sandwich"/"burger" would merge DIFFERENT foods (e.g. the catalog
// "Chicken sandwich" must never absorb the DB "Turkey sandwich").
function findExisting(f: CatalogFood): DbRow | null {
  const viaSourceId = bySourceId.get(`catalog:${f.id}`);
  if (viaSourceId) return viaSourceId;
  const nameKey = normalizeFoodText(f.name);
  if (nameKey) {
    const hit = byName.get(nameKey) ?? byAlias.get(nameKey); // catalog name == db name/alias
    if (hit) return hit;
  }
  for (const key of (f.aliases ?? []).map(normalizeFoodText)) {
    const hit = key ? byName.get(key) : undefined; // catalog alias == db NAME only
    if (hit) return hit;
  }
  return null;
}

// --- plan the sync ------------------------------------------------------------
interface Change {
  food: CatalogFood;
  action: "insert" | "update";
  existing?: DbRow;
  macroChange?: string;
}

const changes: Change[] = [];
const claimed = new Set<string>(); // a DB row can absorb only one catalog food
for (const f of FOOD_CATALOG) {
  const existing = findExisting(f);
  if (existing && !claimed.has(existing.id)) {
    claimed.add(existing.id);
    const macroChange =
      Number(existing.calories) !== f.calories || Number(existing.protein_g) !== f.protein
        ? `${existing.calories}kcal/${existing.protein_g}P -> ${f.calories}kcal/${f.protein}P`
        : undefined;
    changes.push({ food: f, action: "update", existing, macroChange });
  } else {
    changes.push({ food: f, action: "insert" });
  }
}

const inserts = changes.filter((c) => c.action === "insert");
const updates = changes.filter((c) => c.action === "update");
const renames = updates.filter((c) => c.existing && normalizeFoodText(c.existing.name) !== normalizeFoodText(c.food.name));
const macroChanges = updates.filter((c) => c.macroChange);

console.log(`\n${WRITE ? "APPLYING" : "DRY RUN — no writes"} | catalog ${FOOD_CATALOG.length} foods | existing curated rows ${curatedRows?.length ?? 0}`);
console.log(`updates: ${updates.length} (renames ${renames.length}, macro changes ${macroChanges.length}) | inserts: ${inserts.length}\n`);
if (inserts.length) {
  console.log("--- inserts ---");
  inserts.forEach((c) => console.log(`  + ${c.food.name} (${c.food.portion}, ${c.food.calories}kcal/${c.food.protein}P)`));
}
if (macroChanges.length) {
  console.log("--- macro changes (db -> catalog) ---");
  macroChanges.forEach((c) => console.log(`  ~ ${c.food.name}: ${c.macroChange}`));
}
if (renames.length) {
  console.log("--- canonical renames (db name -> catalog name) ---");
  renames.forEach((c) => console.log(`  ~ "${c.existing!.name}" -> "${c.food.name}"`));
}

if (!WRITE) {
  console.log("\nRe-run with WRITE=1 to apply. (No changes made.)");
  process.exit(0);
}

let applied = 0;
for (const c of changes) {
  const payload = rowPayload(c.food);
  if (c.action === "update" && c.existing) {
    // Merge aliases (keep anything the DB already knew, e.g. Roman Urdu spellings),
    // and keep the old display name searchable as an alias after a rename.
    const merged = [...new Set([...(c.existing.aliases ?? []), ...payload.aliases,
      ...(normalizeFoodText(c.existing.name) !== normalizeFoodText(c.food.name) ? [c.existing.name] : [])])].filter(Boolean);
    const renamed = normalizeFoodText(c.existing.name) !== normalizeFoodText(c.food.name);
    const { error } = await sb
      .from("foods")
      .update({
        ...payload,
        aliases: merged,
        search_text: searchTextFor(payload.name, merged),
        // Name/alias text changed → stale embedding; null it so embed-foods re-embeds.
        ...(renamed ? { embedding: null } : {}),
      })
      .eq("id", c.existing.id);
    if (error) {
      console.error(`update failed for ${c.food.name}:`, error.message);
      process.exit(1);
    }
  } else {
    const { error } = await sb.from("foods").insert(payload);
    if (error) {
      console.error(`insert failed for ${c.food.name}:`, error.message);
      process.exit(1);
    }
  }
  applied++;
  process.stdout.write(`\r  applied ${applied}/${changes.length}`);
}
console.log(`\n✅ Synced ${applied} catalog foods (${updates.length} updates, ${inserts.length} inserts).`);
console.log("   Tip: run scripts/embed-foods.mjs to add embeddings for new/renamed rows.");
