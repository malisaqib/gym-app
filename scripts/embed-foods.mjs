// Backfills embeddings for catalog rows that don't have one yet (e.g. imported
// USDA foods). RESUMABLE: only touches embedding IS NULL rows, so you can run it
// repeatedly across Gemini quota windows until everything is embedded.
//   node --env-file=.env.local scripts/embed-foods.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";
const DIM = 768; // must match the vector(768) column + lib/embeddings.ts
const BATCH = 200;

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY");
  process.exit(1);
}

class QuotaError extends Error {}

async function embed(text, attempt = 0) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: `models/${MODEL}`, content: { parts: [{ text }] }, outputDimensionality: DIM }),
    }
  );
  if (res.status === 429) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      return embed(text, attempt + 1);
    }
    throw new QuotaError("Gemini rate/quota limit hit");
  }
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const v = (await res.json()).embedding.values;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let done = 0;

  try {
    for (;;) {
      const { data: rows, error } = await supabase
        .from("foods")
        .select("id, search_text")
        .is("embedding", null)
        .limit(BATCH);
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const values = await embed(row.search_text ?? row.id);
        const upd = await supabase
          .from("foods")
          .update({ embedding: JSON.stringify(values) })
          .eq("id", row.id);
        if (upd.error) throw new Error(upd.error.message);
        done++;
        if (done % 50 === 0) console.log(`  embedded ${done}…`);
      }
    }
    console.log(`✅ All caught up. Embedded ${done} rows this run.`);
  } catch (e) {
    if (e instanceof QuotaError) {
      console.log(`⏸️  Gemini quota reached after embedding ${done} rows this run. Re-run later to continue.`);
      process.exit(0);
    }
    throw e;
  }

  const { count } = await supabase
    .from("foods")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  console.log(`Remaining without embeddings: ${count}`);
}

main().catch((e) => {
  console.error("embed-foods failed:", e.message);
  process.exit(1);
});
