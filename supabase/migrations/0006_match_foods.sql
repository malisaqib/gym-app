-- =============================================================================
-- RAG R2 — hybrid food retrieval RPC (lexical + vector)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- match_foods() ranks the catalog by a blend of:
--   * lexical  -> pg_trgm similarity(search_text, query_text)   [0..1]
--   * semantic -> cosine similarity of the query embedding       [0..1]
-- and returns the top `match_count`. The app calls this per food phrase, then
-- feeds only these few rows to the LLM (instead of stuffing the whole table).
--
-- Note: this scans the table to compute a blended score — perfect for a small
-- catalog. When we scale to thousands (R1b), switch to index-assisted candidate
-- generation (top-N by HNSW + top-N by trigram, then re-rank).
--
-- search_path includes `extensions` because Supabase installs pg_trgm / vector
-- there, so similarity() and the <=> operator resolve.
-- =============================================================================

create or replace function public.match_foods(
  query_text text,
  query_embedding vector(768),
  match_count int default 8
)
returns table (
  id uuid,
  name text,
  aliases text[],
  region text,
  portion text,
  portion_grams numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  source text,
  score real
)
language sql
stable
set search_path = public, extensions
as $$
  select
    f.id, f.name, f.aliases, f.region, f.portion, f.portion_grams,
    f.calories, f.protein_g, f.carbs_g, f.fat_g, f.source,
    (
      0.5 * similarity(f.search_text, query_text)
      + 0.5 * greatest(0, 1 - (f.embedding <=> query_embedding))
    )::real as score
  from public.foods f
  where f.embedding is not null
  order by score desc
  limit greatest(match_count, 1);
$$;

-- Let signed-in users (and the anon role, harmless via RLS) call it through the API.
grant execute on function public.match_foods(text, vector, int) to authenticated, anon;
