-- =============================================================================
-- Explicit Diet Plan mode (additive)
-- =============================================================================
-- Existing users remain null. Runtime legacy handling keeps `veg_limited`
-- users strictly vegetarian until they explicitly choose a new diet mode.
-- =============================================================================

alter table public.profiles
  add column if not exists diet_mode text
    check (diet_mode in ('vegetarian', 'flexitarian', 'non_veg', 'unknown'));
