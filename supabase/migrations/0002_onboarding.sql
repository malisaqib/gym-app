-- =============================================================================
-- Phase 3 — Onboarding: add language preference + raw onboarding transcript
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once (uses ADD COLUMN IF NOT EXISTS).
--
-- preferred_language : which language the user did onboarding in (and the
--                      coaching bot should prefer later).
-- onboarding_raw     : the full hybrid transcript as JSON — for every question
--                      we keep the structured value AND the original message
--                      the user gave (the button label they tapped or text they
--                      typed). The structured values also live in their own
--                      typed columns (goal, age, ...); this is the audit trail.
-- =============================================================================

alter table public.profiles
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'roman_urdu')),
  add column if not exists onboarding_raw jsonb;
