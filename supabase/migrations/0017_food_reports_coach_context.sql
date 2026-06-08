-- =============================================================================
-- Food reports — allow the Coach meal estimator as a report source (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> New query -> paste -> Run. Safe to
-- re-run (drops + recreates the one CHECK constraint).
--
-- The Coach tab's meal estimator can now offer "report this food" when it can't
-- estimate a meal. That adds a new `context` value, 'coach_estimate'. We widen
-- the existing CHECK constraint on food_reports.context to allow it. This is
-- purely additive — existing rows/values keep working.
-- =============================================================================

alter table public.food_reports
  drop constraint if exists food_reports_context_check;

alter table public.food_reports
  add constraint food_reports_context_check
  check (context in ('home_log', 'plan_add', 'plan_swap', 'edit', 'coach_estimate'));
