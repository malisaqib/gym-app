// Smoke-tests hybrid retrieval against the seeded catalog. OFFLINE dev utility.
//   node --env-file=.env.local scripts/test-retrieve.mjs
// (run after migration 0006 — match_foods — is applied)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";
const DIM = 768;

async function embed(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: `models/${MODEL}`, content: { parts: [{ text }] }, outputDimensionality: DIM }),
    }
  );
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const v = (await res.json()).embedding.values;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const QUERIES = [
  "roti",
  "ek pyali daal",
  "chicken biryani",
  "cheeseburger",
  "french fries",
  "grilled chicken breast",
  "anda",
  "sweet lassi",
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  for (const q of QUERIES) {
    const embedding = await embed(q);
    const { data, error } = await supabase.rpc("match_foods", {
      query_text: q,
      query_embedding: JSON.stringify(embedding),
      match_count: 3,
    });
    if (error) {
      console.log(`"${q}" -> ERROR: ${error.message}`);
      continue;
    }
    const top = (data ?? []).map((r) => `${r.name} [${r.region}] ${r.score.toFixed(2)}`).join("  |  ");
    console.log(`"${q}"\n   -> ${top}\n`);
  }
}

main().catch((e) => {
  console.error("test failed:", e.message);
  process.exit(1);
});
