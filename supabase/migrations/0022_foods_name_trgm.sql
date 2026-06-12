-- =============================================================================
-- Trigram index on foods.name (search performance)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- The as-you-type lexical search filters with
--   name.ilike.%term% OR search_text.ilike.%term%
-- search_text has had a trigram index since 0005, but name did not — so the OR
-- forced a sequential scan over all ~13k food rows on every keystroke-pause,
-- per expanded term. With both sides indexed, Postgres can BitmapOr the two
-- trigram indexes instead. (pg_trgm is already enabled by 0005.)
-- =============================================================================

create index if not exists foods_name_trgm_idx
  on public.foods using gin (name gin_trgm_ops);
