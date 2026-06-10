// Imports USDA FoodData Central "SR Legacy" foods into the `foods` table
// (per-100g macros), WITHOUT embeddings — those are added later by
// scripts/embed-foods.mjs as Gemini quota allows. OFFLINE script.
//
// Prereq: download + extract SR Legacy into .usda/ (PowerShell):
//   Invoke-WebRequest https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip -OutFile .usda/sr.zip
//   Expand-Archive .usda/sr.zip .usda/sr -Force
// Then: node --env-file=.env.local scripts/import-usda.mjs
import { createClient } from "@supabase/supabase-js";
import { createReadStream, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DIR = ".usda/sr/FoodData_Central_sr_legacy_food_csv_2018-04";
const FOOD_CSV = `${DIR}/food.csv`;
const NUTR_CSV = `${DIR}/food_nutrient.csv`;
if (!existsSync(FOOD_CSV) || !existsSync(NUTR_CSV)) {
  console.error(`Missing CSVs under ${DIR} — download + extract SR Legacy first (see header).`);
  process.exit(1);
}

// USDA nutrient ids (per 100g).
const ENERGY = "1008", PROTEIN = "1003", FAT = "1004", CARB = "1005";

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

// 1. fdc_id -> description
const desc = new Map();
const foodLines = readFileSync(FOOD_CSV, "utf8").split(/\r?\n/);
for (let i = 1; i < foodLines.length; i++) {
  if (!foodLines[i]) continue;
  const f = parseCsvLine(foodLines[i]); // [fdc_id, data_type, description, ...]
  desc.set(f[0], f[2]);
}
console.log(`food.csv: ${desc.size} foods`);

// 2. accumulate macros by streaming the large nutrient file
const macros = new Map(); // fdc_id -> { kcal, p, f, c }
await new Promise((resolve, reject) => {
  const rl = createInterface({ input: createReadStream(NUTR_CSV) });
  let first = true;
  rl.on("line", (line) => {
    if (first) { first = false; return; }
    if (!line) return;
    const f = parseCsvLine(line); // [id, fdc_id, nutrient_id, amount, ...]
    const fdc = f[1], nid = f[2];
    if (nid !== ENERGY && nid !== PROTEIN && nid !== FAT && nid !== CARB) return;
    if (!desc.has(fdc)) return;
    const amt = parseFloat(f[3]);
    if (!Number.isFinite(amt)) return;
    let m = macros.get(fdc);
    if (!m) { m = {}; macros.set(fdc, m); }
    if (nid === ENERGY) m.kcal = amt;
    else if (nid === PROTEIN) m.p = amt;
    else if (nid === FAT) m.f = amt;
    else m.c = amt;
  });
  rl.on("close", resolve);
  rl.on("error", reject);
});

// 3. build rows (require an energy value)
const round1 = (n) => Math.round((n ?? 0) * 10) / 10;
const rows = [];
for (const [fdc, m] of macros) {
  if (m.kcal == null) continue;
  const name = desc.get(fdc);
  if (!name) continue;
  const calories = Math.round(m.kcal);
  const protein = round1(m.p);
  const carbs = round1(m.c);
  const fat = round1(m.f);
  rows.push({
    name,
    aliases: [],
    search_text: name,
    region: "western",
    portion: "100g",
    portion_grams: 100,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    source: "usda_sr",
    source_id: fdc,
    verified: false,
    brand: null,
    barcode: null,
    serving_name: "100g",
    serving_grams: 100,
    calories_per_100g: calories,
    protein_g_per_100g: protein,
    carbs_g_per_100g: carbs,
    fat_g_per_100g: fat,
    calories_per_serving: calories,
    protein_g_per_serving: protein,
    carbs_g_per_serving: carbs,
    fat_g_per_serving: fat,
    plan_eligible: false,
    classification_status: "unclassified",
    classification_reason: null,
    embedding: null, // filled later by embed-foods.mjs
  });
}
console.log(`Prepared ${rows.length} USDA foods (per 100g, no embeddings yet).`);

// 4. idempotent reload: clear previous usda_sr rows, then insert in chunks
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const del = await supabase.from("foods").delete().eq("source", "usda_sr");
if (del.error) { console.error("delete failed:", del.error.message); process.exit(1); }

for (let i = 0; i < rows.length; i += 500) {
  const ins = await supabase.from("foods").insert(rows.slice(i, i + 500));
  if (ins.error) { console.error("insert failed:", ins.error.message); process.exit(1); }
  console.log(`  inserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}

const { count } = await supabase.from("foods").select("id", { count: "exact", head: true });
console.log(`✅ Done. Total foods now: ${count}`);
