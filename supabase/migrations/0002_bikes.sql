create table public.bikes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  make text,
  model text,
  year integer,
  current_odometer_km numeric,
  vin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bikes enable row level security;

create index bikes_owner_id_idx on public.bikes (owner_id);
