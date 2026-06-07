-- =============================================================================
-- Move the training setup from localStorage → Supabase (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- The "Set up your training" inputs (location, equipment, days/week, session
-- length, injuries) were localStorage-authoritative: migration 0008 mirrored
-- some of them into individual columns, but the app never READ them back, so a
-- new device couldn't load the plan. We store the whole normalized setup as one
-- jsonb on the user's own profiles row (RLS-scoped), and read it DB-first. The
-- app one-time migrates any existing device-only setup into this on first load.
--
-- This supersedes the write-only 0008 columns (has_equipment / equipment /
-- session_minutes / injuries_note) as the source of truth; those stay in place
-- (harmless) and training_location / experience / training_days remain the
-- onboarding columns reused elsewhere.
-- =============================================================================

alter table public.profiles
  add column if not exists training_setup jsonb;
