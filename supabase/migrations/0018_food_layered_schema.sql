-- =============================================================================
-- Food database layering metadata (additive)
-- =============================================================================
-- Adds the fields needed to keep food logging/search broad while keeping diet
-- planning controlled. This migration does not remove or rename existing columns:
-- existing RAG/search queries that read name/aliases/portion/macros/source keep
-- working.
--
-- Source remains TEXT on purpose. Existing values such as 'usda_sr' stay valid,
-- while newer rows can use 'curated', 'usda', 'openfoodfacts', 'user_estimate',
-- etc. Plan eligibility is a separate explicit flag; imported foods default to
-- NOT plan eligible until a classifier or human review marks them safe.
-- =============================================================================

alter table public.foods
  add column if not exists verified boolean not null default false,
  add column if not exists brand text,
  add column if not exists barcode text,

  -- Explicit serving metadata. Existing portion/portion_grams are preserved for
  -- compatibility; these fields give future integrations a clearer target.
  add column if not exists serving_name text,
  add column if not exists serving_grams numeric,

  -- Nutrition normalized per 100g, when grams are known.
  add column if not exists calories_per_100g numeric,
  add column if not exists protein_g_per_100g numeric,
  add column if not exists carbs_g_per_100g numeric,
  add column if not exists fat_g_per_100g numeric,

  -- Nutrition for the named serving. Existing calories/protein_g/carbs_g/fat_g
  -- continue to mean "per current portion" for backward compatibility.
  add column if not exists calories_per_serving numeric,
  add column if not exists protein_g_per_serving numeric,
  add column if not exists carbs_g_per_serving numeric,
  add column if not exists fat_g_per_serving numeric,

  -- Planning metadata. Keep false by default so broad imported/loggable data
  -- cannot silently enter generated diet plans.
  add column if not exists plan_eligible boolean not null default false,
  add column if not exists classification_status text not null default 'unclassified',
  add column if not exists classification_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'foods_classification_status_check'
  ) then
    alter table public.foods
      add constraint foods_classification_status_check
      check (
        classification_status in (
          'unclassified',
          'classifier_eligible',
          'classifier_excluded',
          'reviewed_eligible',
          'reviewed_excluded'
        )
      );
  end if;
end $$;

-- Backfill serving fields from the existing, app-compatible portion fields.
update public.foods
set
  serving_name = coalesce(serving_name, portion),
  serving_grams = coalesce(serving_grams, portion_grams),
  calories_per_serving = coalesce(calories_per_serving, calories),
  protein_g_per_serving = coalesce(protein_g_per_serving, protein_g),
  carbs_g_per_serving = coalesce(carbs_g_per_serving, carbs_g),
  fat_g_per_serving = coalesce(fat_g_per_serving, fat_g)
where
  serving_name is null
  or serving_grams is null
  or calories_per_serving is null
  or protein_g_per_serving is null
  or carbs_g_per_serving is null
  or fat_g_per_serving is null;

-- Backfill per-100g nutrition only when the current portion has a gram anchor.
update public.foods
set
  calories_per_100g = coalesce(
    calories_per_100g,
    case when portion_grams is not null and portion_grams > 0 then round((calories / portion_grams) * 100, 2) end
  ),
  protein_g_per_100g = coalesce(
    protein_g_per_100g,
    case when portion_grams is not null and portion_grams > 0 then round((protein_g / portion_grams) * 100, 2) end
  ),
  carbs_g_per_100g = coalesce(
    carbs_g_per_100g,
    case when portion_grams is not null and portion_grams > 0 then round((carbs_g / portion_grams) * 100, 2) end
  ),
  fat_g_per_100g = coalesce(
    fat_g_per_100g,
    case when portion_grams is not null and portion_grams > 0 then round((fat_g / portion_grams) * 100, 2) end
  )
where
  calories_per_100g is null
  or protein_g_per_100g is null
  or carbs_g_per_100g is null
  or fat_g_per_100g is null;

-- Curated rows are app-owned/reviewed for logging/search quality. This does NOT
-- make every curated row plan eligible; plan_eligible remains an explicit gate.
update public.foods
set verified = true
where source = 'curated';

create index if not exists foods_source_verified_idx
  on public.foods (source, verified);

create index if not exists foods_barcode_idx
  on public.foods (barcode)
  where barcode is not null;

create index if not exists foods_brand_trgm_idx
  on public.foods using gin (brand gin_trgm_ops)
  where brand is not null;

create index if not exists foods_plan_pool_idx
  on public.foods (plan_eligible, classification_status, source);

comment on column public.foods.verified is
  'True when this row has been reviewed/curated for logging/search quality.';

comment on column public.foods.brand is
  'Brand or manufacturer for packaged foods, especially Open Food Facts rows.';

comment on column public.foods.barcode is
  'Product barcode for packaged food lookup/cache; nullable and indexed.';

comment on column public.foods.plan_eligible is
  'Explicit diet-plan gate. Imported foods default false and must be classified or reviewed before generated plans use them.';

comment on column public.foods.classification_status is
  'Planner classification lifecycle: unclassified, classifier_eligible, classifier_excluded, reviewed_eligible, reviewed_excluded.';
