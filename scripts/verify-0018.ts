// Read-only verifier for migration 0018 (layered food schema).
// Confirms the new columns exist and the backfills/flags look right. Changes nothing.
//   node --env-file=.env.local scripts/verify-0018.ts
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// 1) Do the new columns exist yet?
const probe = await sb
  .from("foods")
  .select("id, verified, plan_eligible, classification_status, serving_grams, calories_per_100g")
  .limit(1);

if (probe.error) {
  if (/column .* does not exist/i.test(probe.error.message)) {
    console.log("❌ Migration 0018 NOT applied yet — new columns are missing.");
    console.log(`   (${probe.error.message})`);
    console.log("\n   Apply it in the Supabase SQL editor, then re-run this script.");
    process.exit(0);
  }
  console.error("Probe failed:", probe.error.message);
  process.exit(1);
}

console.log("✅ Migration 0018 columns exist. Checking backfills + flags...\n");

async function n(build: () => PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await build();
  return count ?? 0;
}

const total = await n(() => sb.from("foods").select("id", { count: "exact", head: true }));
const curated = await n(() => sb.from("foods").select("id", { count: "exact", head: true }).eq("source", "curated"));
const curatedVerified = await n(() =>
  sb.from("foods").select("id", { count: "exact", head: true }).eq("source", "curated").eq("verified", true)
);
const importedVerified = await n(() =>
  sb.from("foods").select("id", { count: "exact", head: true }).neq("source", "curated").eq("verified", true)
);
const planEligible = await n(() => sb.from("foods").select("id", { count: "exact", head: true }).eq("plan_eligible", true));
const servingBackfilled = await n(() => sb.from("foods").select("id", { count: "exact", head: true }).not("serving_grams", "is", null));
const per100Backfilled = await n(() => sb.from("foods").select("id", { count: "exact", head: true }).not("calories_per_100g", "is", null));
const withGrams = await n(() => sb.from("foods").select("id", { count: "exact", head: true }).gt("portion_grams", 0));

console.log(`total foods:                 ${total}`);
console.log(`curated rows:                ${curated}`);
console.log(`curated & verified=true:     ${curatedVerified}   (expect == curated)`);
console.log(`imported & verified=true:    ${importedVerified}   (expect 0 unless reviewed)`);
console.log(`plan_eligible=true:          ${planEligible}   (expect 0 — runtime classifier gates plans for now)`);
console.log(`serving_grams backfilled:    ${servingBackfilled}`);
console.log(`calories_per_100g backfilled:${per100Backfilled}   (rows with portion_grams>0: ${withGrams})`);

const ok = curatedVerified === curated && total > 0;
console.log(`\n${ok ? "✅ Looks correct." : "⚠ Check the numbers above."}`);
