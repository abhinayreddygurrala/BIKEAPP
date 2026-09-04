create table public.rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles (id) on delete cascade,
  bike_id uuid references public.bikes (id) on delete set null,
  title text,
  started_at timestamptz not null,
  ended_at timestamptz,
  distance_meters numeric,
  duration_seconds numeric,
  avg_speed_kmh numeric,
  max_speed_kmh numeric,
  elevation_gain_m numeric,
  elevation_loss_m numeric,
  route_polyline text,
  privacy_level text not null default 'private' check (privacy_level in ('private', 'friends', 'public')),
  created_at timestamptz not null default now()
);

alter table public.rides enable row level security;

create index rides_rider_id_idx on public.rides (rider_id);
create index rides_bike_id_idx on public.rides (bike_id);

-- Raw GPS fixes for a ride; source of truth for the route. route_polyline on
-- `rides` is a derived cache kept for fast list/detail rendering.
create table public.ride_points (
  id bigserial primary key,
  ride_id uuid not null references public.rides (id) on delete cascade,
  seq integer not null,
  recorded_at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  altitude_m numeric,
  speed_mps numeric,
  accuracy_m numeric
);

alter table public.ride_points enable row level security;

create index ride_points_ride_id_seq_idx on public.ride_points (ride_id, seq);
