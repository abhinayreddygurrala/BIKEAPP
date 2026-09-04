-- Stub schema: no client logic uses these tables yet. `live_locations` is
-- the row Supabase Realtime will subscribe to once group live-sharing is
-- built (postgres_changes or Broadcast) — schema only, no client code.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table public.group_members enable row level security;

create table public.live_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ride_id uuid references public.rides (id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  heading numeric,
  speed_mps numeric,
  updated_at timestamptz not null default now()
);

alter table public.live_locations enable row level security;

create index live_locations_group_id_idx on public.live_locations (group_id);
