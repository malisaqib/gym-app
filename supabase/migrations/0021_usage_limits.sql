-- =============================================================================
-- Per-user daily usage limits (rate limiting for LLM-backed actions)
-- =============================================================================
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- Every LLM-backed server action (food parse, coach, estimate, plan generate)
-- costs real money per call. This adds an atomic per-user daily counter so one
-- user — malicious or enthusiastic — can't burn the provider budget.
--
-- Design: the table has RLS enabled with NO user policies, so users cannot
-- read or tamper with their counters through PostgREST. The ONLY way to touch
-- it is consume_usage(), a SECURITY DEFINER function that increments and
-- checks the limit in one statement (atomic upsert — safe under concurrency).
-- Day boundary is UTC; close enough for abuse control.
-- =============================================================================

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  kind    text not null,
  count   int  not null default 0,
  primary key (user_id, day, kind)
);

alter table public.usage_counters enable row level security;
-- Deliberately NO policies: direct access is denied for everyone but the
-- definer function below (and the service role).

create or replace function public.consume_usage(p_kind text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if auth.uid() is null then
    return false; -- anonymous callers never get budget
  end if;

  insert into public.usage_counters (user_id, day, kind, count)
  values (auth.uid(), current_date, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = usage_counters.count + 1
  returning count into new_count;

  return new_count <= p_limit;
end;
$$;

revoke all on function public.consume_usage(text, int) from public, anon;
grant execute on function public.consume_usage(text, int) to authenticated;

comment on table public.usage_counters is
  'Per-user daily counters for LLM-backed actions. Touched only via consume_usage().';
comment on function public.consume_usage(text, int) is
  'Atomically increment today''s counter for (user, kind); returns false once over p_limit.';
