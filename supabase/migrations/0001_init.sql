-- =============================================================================
-- FitCoach — Phase 1: initial database schema
-- =============================================================================
-- HOW TO RUN: open Supabase -> SQL Editor -> New query -> paste this whole
-- file -> Run. It is safe to run more than once (it uses IF NOT EXISTS / drops
-- and recreates policies & triggers).
--
-- Big idea you must understand: this database is reachable from the browser
-- using your PUBLISHABLE key. The ONLY thing stopping user A from reading user
-- B's rows is Row Level Security (RLS). So every table below:
--   1. turns RLS on, and
--   2. adds a policy that limits each user to rows they own (auth.uid()).
-- Without these policies + RLS, the tables would be wide open.
-- =============================================================================


-- =============================================================================
-- 1. profiles — one row per user (their settings + computed targets)
-- =============================================================================
-- The row's id IS the Supabase auth user id, so a profile maps 1:1 to a user.
-- All onboarding fields are nullable because the row is created (empty) the
-- moment a user signs up, then filled in during onboarding (Phase 3).
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text,

  -- Inputs collected during onboarding (used by the calorie engine in Phase 2):
  goal            text check (goal in ('lose_fat', 'maintain', 'gain_muscle')),
  sex             text check (sex in ('male', 'female')),
  age             integer check (age > 0 and age < 120),
  height_cm       numeric check (height_cm > 0),
  weight_kg       numeric check (weight_kg > 0),
  training_days   integer check (training_days between 0 and 7),
  experience      text check (experience in ('beginner', 'intermediate', 'advanced')),

  -- Outputs written by the calorie engine after onboarding:
  calorie_target  integer,
  protein_target_g integer,

  -- True once onboarding is finished, so the app knows where to route the user.
  onboarded       boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can do anything ONLY to their own profile row (id = their auth id).
drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- =============================================================================
-- 2. food_logs — every food item the user logs (the core feature, Phase 4)
-- =============================================================================
-- One row per food item. A single typed sentence ("do roti, ek pyali daal")
-- can produce several rows that share the same raw_text. The dashboard sums
-- these per day to show calories/protein eaten vs target.
create table if not exists public.food_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- The day this item counts toward. The APP passes the user's LOCAL date here
  -- (the DB runs in UTC, so we don't rely on the default for correctness).
  logged_on   date not null default current_date,

  raw_text    text,           -- exactly what the user typed
  food_name   text not null,  -- the parsed/normalised item name
  quantity    numeric,        -- optional, for display ("2 roti")
  unit        text,           -- optional ("roti", "katori", "g")

  calories    numeric not null,
  protein_g   numeric not null default 0,
  carbs_g     numeric not null default 0,
  fat_g       numeric not null default 0,

  -- Where the numbers came from. 'corrected' = user fixed them (one-tap edit).
  source      text not null default 'llm'
              check (source in ('llm', 'manual', 'corrected')),

  created_at  timestamptz not null default now()
);

alter table public.food_logs enable row level security;

drop policy if exists "Users manage their own food logs" on public.food_logs;
create policy "Users manage their own food logs"
  on public.food_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Speeds up the most common query: "this user's items for a given day".
create index if not exists food_logs_user_day_idx
  on public.food_logs (user_id, logged_on);


-- =============================================================================
-- 3. workouts — a named workout the user has (the A/B split). Refined in Phase 5
-- =============================================================================
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,   -- e.g. "Workout A", "Workout B"
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.workouts enable row level security;

drop policy if exists "Users manage their own workouts" on public.workouts;
create policy "Users manage their own workouts"
  on public.workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =============================================================================
-- 4. workout_logs — actual sets/reps performed. Refined in Phase 5
-- =============================================================================
create table if not exists public.workout_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- If the parent workout is deleted, keep the log but null out the link.
  workout_id    uuid references public.workouts (id) on delete set null,

  exercise_name text not null,  -- e.g. "Goblet Squat"
  performed_on  date not null default current_date,
  set_number    integer,
  reps          integer,
  weight_kg     numeric,

  created_at    timestamptz not null default now()
);

alter table public.workout_logs enable row level security;

drop policy if exists "Users manage their own workout logs" on public.workout_logs;
create policy "Users manage their own workout logs"
  on public.workout_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists workout_logs_user_day_idx
  on public.workout_logs (user_id, performed_on);


-- =============================================================================
-- 5. bodyweight_logs — weight over time, for the progress chart (Phase 6)
-- =============================================================================
create table if not exists public.bodyweight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  weight_kg   numeric not null check (weight_kg > 0),
  logged_on   date not null default current_date,  -- app passes local date
  created_at  timestamptz not null default now()
);

alter table public.bodyweight_logs enable row level security;

drop policy if exists "Users manage their own bodyweight logs" on public.bodyweight_logs;
create policy "Users manage their own bodyweight logs"
  on public.bodyweight_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists bodyweight_logs_user_day_idx
  on public.bodyweight_logs (user_id, logged_on);


-- =============================================================================
-- 6. Auto-create a profile row whenever a new user signs up
-- =============================================================================
-- Without this, a new user would have no profiles row until we manually made
-- one. SECURITY DEFINER lets the function insert past RLS; the empty search_path
-- is a Supabase hardening best-practice (forces fully-qualified names).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- =============================================================================
-- 7. Keep profiles.updated_at fresh on every update
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
