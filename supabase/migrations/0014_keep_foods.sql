-- =============================================================================
-- Diet Phase 2 — "anything you'd rather not give up?" (additive)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- Comfort foods the user wants KEPT in the plan (distinct from usual_foods
-- "go-to likes" and disliked_foods "avoid"). The diet generator seeds and
-- PROTECTS these (never swaps them out), and offers gentle, opt-in upgrade
-- ideas around them — it never removes or shames them. Nullable free text.
-- =============================================================================

alter table public.profiles
  add column if not exists keep_foods text;
