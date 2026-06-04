-- =============================================================================
-- Workout rebuild — Phase 2: training setup inputs (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- These power the deterministic program generator. They are all NULLABLE so
-- existing users are unaffected (the app falls back to sensible defaults and to
-- localStorage until a user completes "Set up your training" on the Workout tab).
--
--   has_equipment   : home/both users — do they own any equipment?
--   equipment       : selected items (e.g. {dumbbells, bands, bench}); free text[]
--                     (validated in the app) so we can add options without a migration
--   session_minutes : optional preferred session length
--   injuries_note   : optional free-text injuries/limitations (respected by the generator)
--
-- training_location, experience and training_days already exist (collected in
-- onboarding) and are reused as-is.
-- =============================================================================

alter table public.profiles
  add column if not exists has_equipment   boolean,
  add column if not exists equipment       text[],
  add column if not exists session_minutes integer,
  add column if not exists injuries_note   text;
