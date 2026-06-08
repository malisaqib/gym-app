-- =============================================================================
-- Food reports — user-submitted "missing / incorrect food" reports (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> New query -> paste this whole file ->
-- Run. Safe to run more than once (if not exists / drop+recreate policy).
--
-- WHY: Sometimes a food is missing from our dataset, or the matched nutrition is
-- wrong. This table lets users report those cases from anywhere they log/search/
-- add/swap/edit food, so we can review them (in the Supabase dashboard for now)
-- and later add/fix the dataset. It is PURELY ADDITIVE — no existing table,
-- column, or policy is changed. Nothing here touches the food RAG pipeline.
--
-- Like every user-owned table in this app, RLS limits each user to their own
-- rows (auth.uid() = user_id). For review you query this table with the
-- service-role key in the dashboard, which bypasses RLS.
-- =============================================================================

create table if not exists public.food_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  created_at      timestamptz not null default now(),

  -- The exact text the user typed or the food name they selected.
  reported_text   text not null,

  -- 'missing'   -> search/matching failed or confidence was low (no such food)
  -- 'incorrect' -> a displayed/logged/planned food has wrong name/portion/macros
  report_type     text not null
                  check (report_type in ('missing', 'incorrect')),

  -- Where in the app the report came from (for triage). Mirrors the UI surfaces.
  context         text not null
                  check (context in ('home_log', 'plan_add', 'plan_swap', 'edit')),

  -- Optional identifier of the existing food being reported as incorrect. There
  -- is no single id space across the app (food_logs rows, diet catalog string
  -- ids, RAG `foods` uuids), so this is free-form TEXT and nullable — we lean on
  -- reported_text as the human-readable signal.
  matched_food_id text,

  -- Optional free text: brand, usual portion, preparation style, etc.
  user_note       text,

  -- Optional rough numbers the user offers so we can add accurate values later.
  -- Stored as JSON ({ "calories": number, "protein": number }) so it stays
  -- additive/flexible without extra columns.
  user_estimate   jsonb,

  -- Review lifecycle. We only ever read this in the Supabase dashboard for now.
  status          text not null default 'new'
                  check (status in ('new', 'reviewed', 'added', 'dismissed'))
);

alter table public.food_reports enable row level security;

-- A user can only see / insert / change their OWN reports (same shape as the
-- rest of the app's user-owned tables). Dashboard review uses the service role.
drop policy if exists "Users manage their own food reports" on public.food_reports;
create policy "Users manage their own food reports"
  on public.food_reports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Speeds up "this user's reports" and the review queue ("all new reports").
create index if not exists food_reports_user_time_idx
  on public.food_reports (user_id, created_at);

create index if not exists food_reports_status_idx
  on public.food_reports (status, created_at);
