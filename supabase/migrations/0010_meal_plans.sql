-- =============================================================================
-- Phase 4 — saved diet plans (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- One ACTIVE generated plan per user, stored as JSON (the deterministic planner
-- in lib/diet builds it; we just persist the result so it survives reloads and
-- can be swapped/regenerated). Unique(user_id) => upsert on conflict.
-- =============================================================================

create table if not exists public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  plan        jsonb not null,   -- the generated DietPlan (see lib/diet/planner.ts)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.meal_plans enable row level security;

drop policy if exists "Users manage their own meal plans" on public.meal_plans;
create policy "Users manage their own meal plans"
  on public.meal_plans
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reuse the shared updated_at trigger function from migration 0001.
drop trigger if exists meal_plans_set_updated_at on public.meal_plans;
create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute procedure public.set_updated_at();
