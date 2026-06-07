-- =============================================================================
-- Move coach prefs from localStorage → Supabase (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- These were device-local (localStorage), which meant no cross-device sync and a
-- privacy risk on shared devices. They're single-per-user and already stored as
-- flat objects, so jsonb columns on profiles map 1:1 (RLS already scopes
-- profiles to the owner). The app one-time migrates any existing local data into
-- these on first load.
--
--   emotional_goal : the motivation/“your goal” card
--   budget_profile : budget mode
--   check_ins      : the weekly check-in history (array)
-- =============================================================================

alter table public.profiles
  add column if not exists emotional_goal jsonb,
  add column if not exists budget_profile jsonb,
  add column if not exists check_ins      jsonb;
