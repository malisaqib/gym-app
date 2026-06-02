-- =============================================================================
-- Phase 8 — Relatable goal-based onboarding: extra profile fields
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- We keep the existing `goal` column (the PRACTICAL goal the engine uses:
-- lose_fat / maintain / gain_muscle) and add the relatable context around it:
--   relatable_goal   : what the user actually picked (e.g. "wedding_event")
--   timeline         : their deadline (no_deadline / 4_weeks / 8_weeks / 12_weeks)
--   training_location: home / gym / both
--   food_preference  : normal_desi / high_protein / budget / hostel_student / veg_limited
-- Stored as free text (no CHECK) so we can add options without a migration; the
-- app validates against the known sets.
-- =============================================================================

alter table public.profiles
  add column if not exists relatable_goal text,
  add column if not exists timeline text,
  add column if not exists training_location text,
  add column if not exists food_preference text;
