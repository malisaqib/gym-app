// Backfills embeddings for rows that don't have one yet. RESUMABLE: only touches
// embedding IS NULL rows, so you can run it repeatedly across Gemini quota
// windows until the chosen scope is embedded.
//
//   DRY RUN catalog foods: SCOPE=catalog DRY_RUN=1 node --env-file=.env.local scripts/embed-foods.mjs
//   APPLY catalog foods:   node --env-file=.env.local scripts/embed-foods.mjs
//   Broad backfill:        SCOPE=all node --env-file=.env.local scripts/embed-foods.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";
const DIM = 768; // must match the vector(768) column + lib/embeddings.ts
const BATCH = 200;
const SCOPE = (process.env.SCOPE ?? "catalog").toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run") || process.argv.includes("--list");
const VALID_SCOPES = new Set(["all", "curated", "catalog"]);

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY");
  process.exit(1);
}
if (!VALID_SCOPES.has(SCOPE)) {
  console.error("Invalid SCOPE. Use one of: all, curated, catalog");
  process.exit(1);
}

class QuotaError extends Error {}

function scopedMissingEmbeddingQuery(query) {
  const scoped = query.is("embedding", null);
  if (SCOPE === "catalog") return scoped.eq("source", "curated").like("source_id", "catalog:%");
  if (SCOPE === "curated") return scoped.eq("source", "curated");
  return scoped;
}

function scopedUpdateQuery(query) {
  if (SCOPE === "catalog") return query.eq("source", "curated").like("source_id", "catalog:%");
  if (SCOPE === "curated") return query.eq("source", "curated");
  return query;
}

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

  const { count: startCount, error: countError } = await scopedMissingEmbeddingQuery(
    supabase.from("foods").select("id", { count: "exact", head: true })
  );
  if (countError) throw new Error(countError.message);

  console.log(`Scope: ${SCOPE} | rows missing embeddings: ${startCount ?? 0}${DRY_RUN ? " | DRY RUN" : ""}`);
  if (DRY_RUN) {
    const { data: rows, error } = await scopedMissingEmbeddingQuery(
      supabase
        .from("foods")
        .select("id,name,source,source_id,search_text")
        .order("source_id", { ascending: true })
        .limit(BATCH)
    );
    if (error) throw new Error(error.message);
    console.log(JSON.stringify(rows ?? [], null, 2));
    return;
  }

  try {
    for (;;) {
      const { data: rows, error } = await scopedMissingEmbeddingQuery(
        supabase
          .from("foods")
          .select("id, search_text")
          .limit(BATCH)
      );
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const values = await embed(row.search_text ?? row.id);
        const upd = await scopedUpdateQuery(
          supabase
            .from("foods")
            .update({ embedding: JSON.stringify(values) })
            .eq("id", row.id)
        ).select("id");
        if (upd.error) throw new Error(upd.error.message);
        if (!upd.data || upd.data.length !== 1) throw new Error(`scoped update skipped row ${row.id}`);
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

  const { count } = await scopedMissingEmbeddingQuery(
    supabase.from("foods").select("id", { count: "exact", head: true })
  );
  console.log(`Remaining without embeddings in scope "${SCOPE}": ${count}`);
}

main().catch((e) => {
  console.error("embed-foods failed:", e.message);
  process.exit(1);
});
