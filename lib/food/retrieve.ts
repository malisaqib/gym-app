import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { expandFoodQueryTerms, rankFoodsForSearch } from "@/lib/food/searchRank";

/**
 * SERVER ONLY. RAG retrieval: embed the query and ask Postgres (match_foods) for
 * the best-matching catalog rows by a lexical + vector blend. These rows are
 * what we feed to the LLM as grounded candidates.
 */
export interface RetrievedFood {
  id: string;
  name: string;
  aliases: string[];
  region: string;
  portion: string;
  portion_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  score: number;
}

const FOOD_SELECT = "id,name,aliases,region,portion,portion_grams,calories,protein_g,carbs_g,fat_g,source";

function safeLexicalQuery(query: string): string {
  return query.replace(/[^a-zA-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

async function lexicalFoods(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  limit: number
): Promise<RetrievedFood[]> {
  const terms = expandFoodQueryTerms(query)
    .map((t) => ({ ...t, safe: safeLexicalQuery(t.term) }))
    .filter((t) => t.safe.length >= 2);

  // All term queries in PARALLEL — the sequential version made multi-word
  // queries (and therefore logging) noticeably slow.
  const results = await Promise.all(
    terms.map(async (t) => {
      const like = `%${t.safe}%`;
      const { data, error } = await supabase
        .from("foods")
        .select(FOOD_SELECT)
        .or(`name.ilike.${like},search_text.ilike.${like}`)
        .order("verified", { ascending: false })
        .limit(Math.max(limit, 1));
      return { t, rows: error || !data ? [] : (data as Omit<RetrievedFood, "score">[]) };
    })
  );

  const out: RetrievedFood[] = [];
  const seen = new Set<string>();
  for (const { t, rows } of results) {
    for (const food of rows) {
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      // Attach the user's word ONLY for true synonyms (aam -> mango), so "aam"
      // ranks/grounds onto mango rows. NEVER the whole query for token hits —
      // that previously made a plain beef steak "exactly match" "beef kebab".
      const alias = t.sourceWord !== t.term ? t.sourceWord : null;
      out.push({
        ...food,
        aliases: alias ? [...(food.aliases ?? []), alias] : food.aliases ?? [],
        score: 0,
      });
    }
  }
  return out;
}

/**
 * Fast lexical-only retrieval (no embedding round-trip). Used where latency
 * matters more than semantic recall: as-you-type search and the per-item
 * grounding pass (item names are short and literal after the LLM split).
 */
export async function lexicalRetrieveFoods(query: string, k = 8): Promise<RetrievedFood[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const candidates = await lexicalFoods(supabase, q, Math.max(k * 3, 20));
  return rankFoodsForSearch(q, candidates).slice(0, k);
}

function mergeFoods(...groups: RetrievedFood[][]): RetrievedFood[] {
  const seen = new Set<string>();
  const out: RetrievedFood[] = [];
  for (const group of groups) {
    for (const food of group) {
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      out.push(food);
    }
  }
  return out;
}

export async function retrieveFoods(query: string, k = 8): Promise<RetrievedFood[]> {
  const q = query.trim();
  if (!q) return [];

  const embedding = await embedText(q);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_foods", {
    query_text: q,
    // pgvector accepts its text format "[a,b,c]" through PostgREST.
    query_embedding: JSON.stringify(embedding),
    match_count: Math.max(k * 3, 20),
  });

  if (error) throw new Error(`Food retrieval failed: ${error.message}`);

  const lexical = await lexicalFoods(supabase, q, Math.max(k * 3, 20));
  const candidates = mergeFoods((data ?? []) as RetrievedFood[], lexical);
  return rankFoodsForSearch(q, candidates).slice(0, k);
}
