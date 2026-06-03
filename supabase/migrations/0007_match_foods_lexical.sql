-- =============================================================================
-- RAG R1b — let match_foods return rows that have NO embedding yet
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- After the USDA bulk import, thousands of rows have no embedding yet (embedding
-- is filled in incrementally as Gemini quota allows). Previously match_foods
-- ignored those rows entirely. Now it includes them, ranked by LEXICAL
-- (trigram) similarity; rows that DO have an embedding additionally get the
-- semantic half of the score. So the imported catalog is usable immediately.
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
      + case
          when f.embedding is null then 0
          else 0.5 * greatest(0, 1 - (f.embedding <=> query_embedding))
        end
    )::real as score
  from public.foods f
  where f.search_text is not null
  order by score desc
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_foods(text, vector, int) to authenticated, anon;
