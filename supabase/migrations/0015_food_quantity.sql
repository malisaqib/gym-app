-- =============================================================================
-- Food logging — live quantity / portion control (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- food_logs currently stores FROZEN totals (calories/protein_g/... = the total
-- for the amount eaten). To let users change HOW MUCH they ate with macros
-- recalculating, we add a per-unit source of truth + a live quantity, and the
-- app computes total = base × amount on the fly. The old total columns are kept
-- and rewritten = round(base × amount) on every write (a synced cache), so the
-- dashboard, the coach's "remaining" math, and the NOT NULL constraints all keep
-- working untouched.
--
--   unit_mode      : 'count'  -> amount is a number of units (eggs, roti, kabab)
--                    'portion'-> amount is GRAMS; base_* are PER GRAM
--   base_*         : nutrition for ONE unit (count) or per GRAM (portion)
--   amount         : the live quantity (units, or grams)
--   serving_grams  : grams in ONE base serving (portion only) — anchors the
--                    0.5x/1x/1.5x/2x multiplier UI; NULL for countable foods
-- =============================================================================

alter table public.food_logs
  add column if not exists unit_mode      text,
  add column if not exists base_calories  numeric,
  add column if not exists base_protein_g numeric,
  add column if not exists base_carbs_g   numeric,
  add column if not exists base_fat_g     numeric,
  add column if not exists amount         numeric,
  add column if not exists serving_grams  numeric;

-- Backfill existing rows: treat their frozen total as ONE unit (amount = 1) so
-- total = base × amount is EXACTLY the original number — nothing breaks or loses
-- data. Only touches rows not yet migrated, so it's safe to re-run.
update public.food_logs
set unit_mode      = 'count',
    base_calories  = calories,
    base_protein_g = protein_g,
    base_carbs_g   = carbs_g,
    base_fat_g     = fat_g,
    amount         = 1
where base_calories is null;
