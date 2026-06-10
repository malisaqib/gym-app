// Persist the diet plan-pool classification into the foods table.
// Writes only plan_eligible / classification_status / classification_reason —
// never touches nutrition/name/source. Idempotent + re-runnable.
//
//   DRY RUN (default, no writes):  node --env-file=.env.local scripts/persist-classification.ts
//   APPLY:                         WRITE=1 node --env-file=.env.local scripts/persist-classification.ts
//
// Rules:
//   imported (non-curated): classifier verdict → classifier_eligible / classifier_excluded
//   curated:                eligible unless it hits a true-JUNK reason (so desi
//                           dish names the keyword list doesn't know stay eligible)
import { createClient } from "@supabase/supabase-js";
import { classifyFoodDetailed, JUNK_REASONS, type RawFoodRow } from "../lib/diet/foodClassify.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const WRITE = process.env.WRITE === "1";
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const SELECT = "id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source";

interface Verdict {
  id: string;
  plan_eligible: boolean;
  classification_status: string;
  classification_reason: string;
}

function verdictFor(row: RawFoodRow): Verdict {
  const r = classifyFoodDetailed(row);
  if (row.source === "curated") {
    // Hand-curated app foods are reviewed; only drop genuine junk seed rows
    // (cola, oils, candy bars), never a real dish with an unknown name.
    if (r.status === "excluded" && JUNK_REASONS.has(r.reason)) {
      return { id: row.id, plan_eligible: false, classification_status: "classifier_excluded", classification_reason: r.reason };
    }
    return { id: row.id, plan_eligible: true, classification_status: "reviewed_eligible", classification_reason: r.status === "eligible" ? r.reason : "curated" };
  }
  // Imported foods follow the classifier strictly.
  return r.status === "eligible"
    ? { id: row.id, plan_eligible: true, classification_status: "classifier_eligible", classification_reason: r.reason }
    : { id: row.id, plan_eligible: false, classification_status: "classifier_excluded", classification_reason: r.reason };
}

// --- fetch all rows ---------------------------------------------------------
const rows: RawFoodRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("foods").select(SELECT).range(from, from + 999);
  if (error) {
    console.error("fetch failed:", error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  rows.push(...(data as unknown as RawFoodRow[]));
  if (data.length < 1000) break;
}

const verdicts = rows.map(verdictFor);

// --- summary ----------------------------------------------------------------
const byStatus: Record<string, number> = {};
const byReason: Record<string, number> = {};
let eligible = 0;
for (const v of verdicts) {
  byStatus[v.classification_status] = (byStatus[v.classification_status] ?? 0) + 1;
  byReason[v.classification_reason] = (byReason[v.classification_reason] ?? 0) + 1;
  if (v.plan_eligible) eligible++;
}

console.log(`\n${WRITE ? "APPLYING" : "DRY RUN — no writes"} | ${rows.length} foods`);
console.log(`plan_eligible=true: ${eligible} | plan_eligible=false: ${rows.length - eligible}`);
console.log("\nby classification_status:", byStatus);
console.log("\nby reason (top 20):");
Object.entries(byReason)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([reason, count]) => console.log(`  ${reason.padEnd(20)} ${count}`));

if (!WRITE) {
  console.log("\nRe-run with WRITE=1 to persist. (No changes made.)");
  process.exit(0);
}

// --- apply: group identical verdicts, update by id batches ------------------
const groups = new Map<string, { v: Omit<Verdict, "id">; ids: string[] }>();
for (const v of verdicts) {
  const key = `${v.plan_eligible}|${v.classification_status}|${v.classification_reason}`;
  const g = groups.get(key);
  if (g) g.ids.push(v.id);
  else groups.set(key, { v: { plan_eligible: v.plan_eligible, classification_status: v.classification_status, classification_reason: v.classification_reason }, ids: [v.id] });
}

let written = 0;
for (const { v, ids } of groups.values()) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await sb.from("foods").update(v).in("id", chunk);
    if (error) {
      console.error("update failed:", error.message);
      process.exit(1);
    }
    written += chunk.length;
  }
  process.stdout.write(`\r  written ${written}/${rows.length}`);
}
console.log(`\n✅ Persisted classification for ${written} rows.`);
