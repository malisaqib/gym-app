// Imports USDA FNDDS (Food and Nutrient Database for Dietary Studies — the
// "What We Eat in America" survey foods) into the `foods` table, per-100g,
// WITHOUT embeddings (added later by scripts/embed-foods.mjs as quota allows).
// OFFLINE script, idempotent: clears previous usda_fndds rows, then inserts.
//
// Unlike SR Legacy (raw ingredients), FNDDS is ~7k PREPARED DISHES AS EATEN —
// "chicken curry", "beef kabob", "rice pilaf" — exactly what users type when
// logging. Public domain (USDA), same FoodData Central CSV layout as SR.
//
// Prereq: download + extract the FDC "survey" CSV bundle into .usda/fndds:
//   Invoke-WebRequest https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip -OutFile .usda/fndds.zip
//   Expand-Archive .usda/fndds.zip .usda/fndds -Force
// Then: node --env-file=.env.local scripts/import-fndds.mjs
import { createClient } from "@supabase/supabase-js";
import { createReadStream, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Find the extracted CSV directory (the zip nests a dated folder).
function findCsvDir(root) {
  if (!existsSync(root)) return null;
  if (existsSync(join(root, "food.csv"))) return root;
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    if (statSync(p).isDirectory() && existsSync(join(p, "food.csv"))) return p;
  }
  return null;
}

const DIR = findCsvDir(".usda/fndds");
if (!DIR) {
  console.error("Missing food.csv under .usda/fndds — download + extract the survey CSV bundle first (see header).");
  process.exit(1);
}
const FOOD_CSV = join(DIR, "food.csv");
const NUTR_CSV = join(DIR, "food_nutrient.csv");

// USDA nutrient ids (per 100g). The survey bundle's food_nutrient.csv uses the
// LEGACY nutrient numbers (208/203/204/205) in its nutrient_id column, while
// other FDC bundles use the new ids (1008/1003/1004/1005) — accept both.
const ENERGY = new Set(["1008", "208"]);
const PROTEIN = new Set(["1003", "203"]);
const FAT = new Set(["1004", "204"]);
const CARB = new Set(["1005", "205"]);

// Quote-aware CSV line parser (descriptions contain commas inside quotes).
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// 1. fdc_id -> description (survey foods only, defensive on data_type).
const desc = new Map();
const foodLines = readFileSync(FOOD_CSV, "utf8").split(/\r?\n/);
for (let i = 1; i < foodLines.length; i++) {
  if (!foodLines[i]) continue;
  const f = parseCsvLine(foodLines[i]); // [fdc_id, data_type, description, ...]
  if (f[1] && !f[1].startsWith("survey_fndds")) continue; // "survey_fndds_food" in the survey bundle
  desc.set(f[0], f[2]);
}
console.log(`food.csv: ${desc.size} survey foods`);

// 2. accumulate macros by streaming the nutrient file.
const macros = new Map(); // fdc_id -> { kcal, p, f, c }
await new Promise((resolve, reject) => {
  const rl = createInterface({ input: createReadStream(NUTR_CSV) });
  let first = true;
  rl.on("line", (line) => {
    if (first) { first = false; return; }
    if (!line) return;
    const f = parseCsvLine(line); // [id, fdc_id, nutrient_id, amount, ...]
    const fdc = f[1], nid = f[2];
    if (!ENERGY.has(nid) && !PROTEIN.has(nid) && !FAT.has(nid) && !CARB.has(nid)) return;
    if (!desc.has(fdc)) return;
    const amt = parseFloat(f[3]);
    if (!Number.isFinite(amt)) return;
    let m = macros.get(fdc);
    if (!m) { m = {}; macros.set(fdc, m); }
    if (ENERGY.has(nid)) m.kcal = amt;
    else if (PROTEIN.has(nid)) m.p = amt;
    else if (FAT.has(nid)) m.f = amt;
    else m.c = amt;
  });
  rl.on("close", resolve);
  rl.on("error", reject);
});

// 3. build rows (require an energy value). Layered metadata: loggable but NOT
// verified / plan-eligible until the classifier pass + human review.
const round1 = (n) => Math.round((n ?? 0) * 10) / 10;
const rows = [];
for (const [fdc, m] of macros) {
  if (m.kcal == null) continue;
  const name = desc.get(fdc);
  if (!name) continue;
  rows.push({
    name,
    aliases: [],
    search_text: name,
    region: "global", // survey dishes span cuisines (curry, kebab, tamale…)
    portion: "100g",
    portion_grams: 100,
    calories: Math.round(m.kcal),
    protein_g: round1(m.p),
    carbs_g: round1(m.c),
    fat_g: round1(m.f),
    source: "usda_fndds",
    source_id: fdc,
    embedding: null, // filled later by embed-foods.mjs
    verified: false,
    plan_eligible: false,
    classification_status: "unclassified",
    serving_name: "100g",
    serving_grams: 100,
    calories_per_100g: Math.round(m.kcal),
    protein_g_per_100g: round1(m.p),
    carbs_g_per_100g: round1(m.c),
    fat_g_per_100g: round1(m.f),
    calories_per_serving: Math.round(m.kcal),
    protein_g_per_serving: round1(m.p),
    carbs_g_per_serving: round1(m.c),
    fat_g_per_serving: round1(m.f),
  });
}
console.log(`Prepared ${rows.length} FNDDS dishes (per 100g, no embeddings yet).`);

// 4. idempotent reload: clear previous usda_fndds rows, then insert in chunks.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const del = await supabase.from("foods").delete().eq("source", "usda_fndds");
if (del.error) { console.error("delete failed:", del.error.message); process.exit(1); }

for (let i = 0; i < rows.length; i += 500) {
  const ins = await supabase.from("foods").insert(rows.slice(i, i + 500));
  if (ins.error) { console.error("insert failed:", ins.error.message); process.exit(1); }
  console.log(`  inserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}

const { count } = await supabase.from("foods").select("id", { count: "exact", head: true });
console.log(`✅ Done. Total foods now: ${count}`);
