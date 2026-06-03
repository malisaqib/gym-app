import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";

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

export async function retrieveFoods(query: string, k = 8): Promise<RetrievedFood[]> {
  const q = query.trim();
  if (!q) return [];

  const embedding = await embedText(q);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_foods", {
    query_text: q,
    // pgvector accepts its text format "[a,b,c]" through PostgREST.
    query_embedding: JSON.stringify(embedding),
    match_count: k,
  });

  if (error) throw new Error(`Food retrieval failed: ${error.message}`);
  return (data ?? []) as RetrievedFood[];
}
