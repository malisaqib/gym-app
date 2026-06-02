-- =============================================================================
-- Beta analytics — a lightweight events table (Phase 7 prep)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- Records key actions (onboarding completed, food logged, coach asked) so you
-- can measure activation and retention during the beta. Event logging in the
-- app is BEST-EFFORT: if you skip this migration, the app still works fine —
-- the inserts just silently fail.
--
-- For aggregate analysis, query this table with the service-role key (RLS below
-- only lets each user see their own rows).
-- =============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists "Users manage their own events" on public.events;
create policy "Users manage their own events"
  on public.events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists events_user_time_idx on public.events (user_id, created_at);
