import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { expandFoodQueries, rankFoodsForSearch } from "@/lib/food/searchRank";

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
  const out: RetrievedFood[] = [];
  const seen = new Set<string>();
  for (const term of expandFoodQueries(query)) {
    const safe = safeLexicalQuery(term);
    if (safe.length < 2) continue;
    const like = `%${safe}%`;
    const { data, error } = await supabase
      .from("foods")
      .select(FOOD_SELECT)
      .or(`name.ilike.${like},search_text.ilike.${like}`)
      .limit(Math.max(limit, 1));
    if (error || !data) continue;
    for (const food of data as Omit<RetrievedFood, "score">[]) {
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      out.push({
        ...food,
        aliases: term === query ? food.aliases : [...(food.aliases ?? []), query],
        score: 0,
      });
    }
  }
  return out;
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
