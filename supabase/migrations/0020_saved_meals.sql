-- =============================================================================
-- Saved meals ("My meals") — one-tap repeat logging
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- Most food logs after the first week are REPEATS. A saved meal is a named
-- snapshot of logged items (same shape the live-quantity model uses: per-unit
-- bases + amount + totals cache + provenance), so logging it later is a pure
-- server-side insert — no parsing, no AI, instant and exact.
--
-- Additive only: new table, RLS-scoped to the owner. No existing data touched.
-- =============================================================================

create table if not exists public.saved_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  -- Array of food_log-shaped item snapshots (food_name, unit_mode, base_*,
  -- amount, serving_grams, totals cache, matched_food_id, nutrition_source…).
  items      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_meals_user_idx on public.saved_meals (user_id, created_at desc);

alter table public.saved_meals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'saved_meals' and policyname = 'saved_meals_select_own') then
    create policy saved_meals_select_own on public.saved_meals for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'saved_meals' and policyname = 'saved_meals_insert_own') then
    create policy saved_meals_insert_own on public.saved_meals for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'saved_meals' and policyname = 'saved_meals_delete_own') then
    create policy saved_meals_delete_own on public.saved_meals for delete using (auth.uid() = user_id);
  end if;
end $$;

comment on table public.saved_meals is
  'Named snapshots of logged food items for one-tap repeat logging ("My meals").';
