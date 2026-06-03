-- =============================================================================
-- RAG R0 — Food knowledge base (pgvector + trigram), the retrieval source
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- `foods` is a SHARED, READ-ONLY reference table (not per-user data). It holds
-- both Western (USDA, CC0) and curated South Asian items. At log time we will
-- RETRIEVE the few most relevant rows (lexical + vector) and feed only those to
-- the LLM — instead of stuffing a fixed 36-item list into every prompt.
--
-- Retrieval uses two signals:
--   * lexical  -> pg_trgm trigram similarity on `search_text` (name + aliases)
--   * semantic -> pgvector cosine distance on `embedding`
-- Embeddings are Gemini text-embedding-004 => 768 dimensions. If you change the
-- embedding model, the vector(768) dimension must change too (new migration).
-- =============================================================================

-- Extensions (enable if not already on for this project).
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.foods (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,            -- canonical English name
  aliases       text[] not null default '{}', -- incl. Roman Urdu spellings
  -- name + aliases joined; what trigram search matches on (filled at seed time).
  search_text   text,
  region        text not null default 'global'
                check (region in ('desi', 'western', 'global')),

  -- Macros are per the stated portion (what we show/feed the model).
  portion       text not null,            -- e.g. "1 medium (~45g)"
  portion_grams numeric,                  -- grams for that portion, if known
  calories      numeric not null,
  protein_g     numeric not null default 0,
  carbs_g       numeric not null default 0,
  fat_g         numeric not null default 0,

  -- Provenance (for dedup, trust, and license tracking).
  source        text not null,            -- 'usda_sr' | 'usda_fndds' | 'curated' | ...
  source_id     text,                     -- external id within that source

  embedding     vector(768),              -- Gemini text-embedding-004; null until seeded
  created_at    timestamptz not null default now()
);

-- Lexical: trigram similarity over name+aliases.
create index if not exists foods_search_trgm_idx
  on public.foods using gin (search_text gin_trgm_ops);

-- Exact alias containment (e.g. aliases @> '{biryani}').
create index if not exists foods_aliases_gin_idx on public.foods using gin (aliases);

-- Semantic: approximate nearest-neighbour over the embedding (cosine).
create index if not exists foods_embedding_hnsw_idx
  on public.foods using hnsw (embedding vector_cosine_ops);

create index if not exists foods_region_idx on public.foods (region);

-- RLS: any signed-in user can READ the catalog; nobody can write through the
-- app. Seeding happens with the service-role key (which bypasses RLS).
alter table public.foods enable row level security;

drop policy if exists "Anyone signed in can read foods" on public.foods;
create policy "Anyone signed in can read foods"
  on public.foods
  for select
  to authenticated
  using (true);
