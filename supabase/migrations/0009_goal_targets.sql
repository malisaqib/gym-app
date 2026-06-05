-- =============================================================================
-- Phase 2 — target-weight goal setting (additive) + one-time calorie backfill
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run (the
-- backfill only touches rows that haven't been migrated yet, see WHERE below).
--
-- New, all-NULLABLE columns so existing users are unaffected:
--   activity_level : honest whole-day activity (drives the calorie engine factor)
--   goal_weight_kg : where the user wants to get to (null = just maintain)
--   weekly_pace_kg : signed weekly pace actually used (loss negative)
--   target_date    : estimated date to reach the goal at the (capped) pace
--   carb_target_g / fat_target_g : daily macro split alongside protein
--
-- The backfill fixes the OLD too-high targets immediately (the activity factor
-- used to be inferred from training days). It recomputes every onboarded profile
-- at a conservative "light" baseline; each user refines it when they confirm
-- their real activity level. The math here MIRRORS lib/nutrition/engine.ts and
-- lib/nutrition/goalPlan.ts — keep them in sync if you change the engine.
-- =============================================================================

alter table public.profiles
  add column if not exists activity_level text
    check (activity_level in ('sedentary', 'light', 'moderate', 'very', 'extra')),
  add column if not exists goal_weight_kg numeric check (goal_weight_kg > 0),
  add column if not exists weekly_pace_kg numeric,
  add column if not exists target_date    date,
  add column if not exists carb_target_g  integer,
  add column if not exists fat_target_g   integer;

-- One-time backfill. Re-run-safe: only rows not yet migrated (activity_level IS
-- NULL) and with the stats the formula needs.
with base as (
  select
    p.id,
    p.sex,
    p.weight_kg,
    -- BMR (Mifflin–St Jeor)
    (10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age
       + case when p.sex = 'male' then 5 else -161 end) as bmr,
    -- default weekly pace (kg/week) from the practical goal
    case p.goal when 'lose_fat' then -0.5 when 'gain_muscle' then 0.25 else 0 end as pace
  from public.profiles p
  where p.onboarded
    and p.activity_level is null
    and p.weight_kg is not null and p.height_cm is not null
    and p.age is not null and p.sex is not null and p.goal is not null
),
calc as (
  select
    id, pace,
    -- calories: TDEE at the conservative light factor (1.375) + the pace delta
    -- (~7000 kcal/kg => 1000 kcal/day per kg/week), floored, rounded to 10.
    (round(greatest(bmr * 1.375 + pace * 1000.0,
                    case when sex = 'male' then 1500 else 1200 end) / 10.0) * 10)::int as cal,
    -- protein: 1.6 g/kg, to the nearest 5 g
    (round((weight_kg * 1.6) / 5.0) * 5)::int as protein
  from base
)
update public.profiles p set
  activity_level   = 'light',
  weekly_pace_kg   = c.pace,
  calorie_target   = c.cal,
  protein_target_g = c.protein,
  fat_target_g     = round(round(c.cal * 0.275) / 9.0)::int,
  carb_target_g    = round(greatest(0, c.cal - c.protein * 4 - round(c.cal * 0.275)) / 4.0)::int
from calc c
where p.id = c.id;
