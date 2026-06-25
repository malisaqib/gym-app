-- =============================================================================
-- Explicit protein powder preference (additive)
-- =============================================================================
-- Nullable keeps existing users in the legacy/unknown state. Diet generation
-- may use clear historical text such as "whey" only while this value is null or
-- unknown; an explicit enabled/disabled choice always wins.
-- =============================================================================

alter table public.profiles
  add column if not exists protein_powder_preference text
    check (protein_powder_preference in ('enabled', 'disabled', 'unknown'));
