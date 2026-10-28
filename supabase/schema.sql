-- Personalized Travel Itinerary Planner - Supabase schema
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Auth: uses Supabase's built-in email/password auth (auth.users). Enable it under
-- Authentication -> Providers -> Email. For a classroom/demo project you can turn OFF
-- "Confirm email" so sign-ups work instantly.

create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  destination   text,
  days          integer,
  budget_level  text,
  cover_image   text,
  preferences   jsonb not null,
  plan          jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists trips_user_updated_idx on public.trips (user_id, updated_at desc);

-- Row Level Security: each user sees and edits only their own rows.
alter table public.trips enable row level security;

drop policy if exists "trips_select_own" on public.trips;
create policy "trips_select_own" on public.trips
  for select using (auth.uid() = user_id);

drop policy if exists "trips_insert_own" on public.trips;
create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);

drop policy if exists "trips_update_own" on public.trips;
create policy "trips_update_own" on public.trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "trips_delete_own" on public.trips;
create policy "trips_delete_own" on public.trips
  for delete using (auth.uid() = user_id);

-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- The backend talks to this table through PostgREST with the *user's own JWT*
-- (never a service-role key), so these policies are the real security boundary.
