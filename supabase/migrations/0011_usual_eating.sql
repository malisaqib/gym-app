-- =============================================================================
-- Phase 2 — capture the user's usual eating (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- All NULLABLE free-text, collected optionally at onboarding (one skippable
-- step) and editable in Settings. The Phase 3 diet generator will SEED meals
-- from these and respect dislikes — but capturing them is harmless on its own.
--
--   usual_breakfast / usual_lunch / usual_dinner : what they normally eat
--   usual_foods    : foods they eat a lot / want included (likes)
--   disliked_foods : anything they don't/won't eat (allergies, dislikes)
-- =============================================================================

alter table public.profiles
  add column if not exists usual_breakfast text,
  add column if not exists usual_lunch     text,
  add column if not exists usual_dinner    text,
  add column if not exists usual_foods     text,
  add column if not exists disliked_foods  text;
