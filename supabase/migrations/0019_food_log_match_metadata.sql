-- =============================================================================
-- Food log match/provenance metadata
-- =============================================================================
-- Keeps the existing `source` column as "how this row was created"
-- (llm/manual/corrected), and adds explicit nutrition provenance:
--   matched_food_id   -> the catalog/database row used for nutrition, when known
--   match_confidence  -> 0..1 confidence in that match
--   nutrition_source  -> quality/source of the nutrition numbers
--
-- `matched_food_id` is text rather than uuid because matches can come from
-- multiple namespaces, e.g. db:<foods.id> or catalog:cold_coffee.
-- =============================================================================

alter table public.food_logs
  add column if not exists matched_food_id text,
  add column if not exists match_confidence numeric,
  add column if not exists nutrition_source text not null default 'estimated';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_logs_match_confidence_check'
  ) then
    alter table public.food_logs
      add constraint food_logs_match_confidence_check
      check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_logs_nutrition_source_check'
  ) then
    alter table public.food_logs
      add constraint food_logs_nutrition_source_check
      check (nutrition_source in ('verified', 'imported', 'estimated', 'corrected'));
  end if;
end $$;

create index if not exists food_logs_matched_food_idx
  on public.food_logs (matched_food_id)
  where matched_food_id is not null;

create index if not exists food_logs_nutrition_source_idx
  on public.food_logs (user_id, nutrition_source, logged_on);

comment on column public.food_logs.matched_food_id is
  'Namespaced id of the food row used for nutrition, e.g. db:<foods.id> or catalog:cold_coffee.';

comment on column public.food_logs.match_confidence is
  '0..1 confidence that matched_food_id represents the user-entered food.';

comment on column public.food_logs.nutrition_source is
  'Nutrition provenance/quality: verified, imported, estimated, or corrected.';

