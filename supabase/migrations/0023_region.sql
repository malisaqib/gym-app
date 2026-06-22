-- =============================================================================
-- Region (additive) — the user's home region, used ONLY to steer the LLM's
-- food SUGGESTIONS toward cuisine-appropriate options (Pakistan/India/Middle
-- East/USA-Canada/UK-Europe/Other).
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- This NEVER affects calorie/protein math or the RAG food pipeline — it is a
-- prompt hint only. Nullable; existing users stay null until they set it in
-- Settings (or re-onboard). CHECK keeps the value to the known set.
-- =============================================================================

alter table public.profiles
  add column if not exists region text
    check (region in ('pakistan','india','middle_east','us_canada','uk_europe','other'));
