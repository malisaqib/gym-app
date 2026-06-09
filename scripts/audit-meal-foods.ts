// Diet Phase 1 — AUDIT the food classifier against the live `foods` table.
// Read-only: fetches every row, runs the deterministic classifier, and prints
// what's KEPT vs EXCLUDED, role/region/veg/tag coverage, and samples — so we can
// judge classification quality on the REAL ~8k rows before wiring it into the
// planner. Changes nothing in the DB.
//
//   node --env-file=.env.local scripts/audit-meal-foods.ts
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { createClient } from "@supabase/supabase-js";
import { classifyFood, type RawFoodRow } from "../lib/diet/foodClassify.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// Page through all rows (Supabase caps at 1000/request).
async function fetchAll(): Promise<RawFoodRow[]> {
  const all: RawFoodRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("foods")
      .select("id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("fetch failed:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    all.push(...(data as RawFoodRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

function pct(n: number, total: number) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

const rows = await fetchAll();
const bySource = new Map<string, number>();
for (const r of rows) bySource.set(r.source ?? "?", (bySource.get(r.source ?? "?") ?? 0) + 1);

const kept: RawFoodRow[] = [];
const excluded: RawFoodRow[] = [];
const roleCount: Record<string, number> = {};
const regionCount: Record<string, number> = {};
const tagCount: Record<string, number> = {};
let vegKept = 0;

for (const r of rows) {
  const f = classifyFood(r);
  if (!f) {
    excluded.push(r);
    continue;
  }
  kept.push(r);
  roleCount[f.role] = (roleCount[f.role] ?? 0) + 1;
  regionCount[f.region] = (regionCount[f.region] ?? 0) + 1;
  if (f.vegetarian) vegKept++;
  for (const t of f.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
}

console.log(`\n=== foods table: ${rows.length} rows ===`);
console.log("by source:", Object.fromEntries(bySource));
console.log(`\nKEPT ${kept.length} (${pct(kept.length, rows.length)})  |  EXCLUDED ${excluded.length} (${pct(excluded.length, rows.length)})`);
console.log("\nrole distribution (kept):", roleCount);
console.log("region (kept):", regionCount);
console.log("tags (kept):", tagCount);
console.log(`vegetarian (kept): ${vegKept} (${pct(vegKept, kept.length)})`);

const sample = (arr: RawFoodRow[], n: number) =>
  arr.slice(0, n).map((r) => `  ${r.name}`).join("\n");

console.log(`\n--- 25 KEPT samples ---\n${sample(kept, 25)}`);
console.log(`\n--- 25 EXCLUDED samples ---\n${sample(excluded, 25)}`);

// Spot-check a few classified outputs in full.
console.log("\n--- classified detail (first 8 kept) ---");
for (const r of kept.slice(0, 8)) {
  const f = classifyFood(r)!;
  console.log(`  ${f.name} | ${f.role} | ${f.portion} | ${f.calories}kcal ${f.protein}gP | veg=${f.vegetarian} | tags=[${f.tags.join(",")}] | slots=[${f.slots.join(",")}]`);
}
