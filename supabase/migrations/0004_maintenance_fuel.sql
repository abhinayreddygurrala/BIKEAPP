-- Stub schema: no client logic uses these tables yet. Shaped now so the
-- maintenance/fuel-log feature (built in a future session) needs no
-- breaking migration.
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid not null references public.bikes (id) on delete cascade,
  type text not null check (type in ('oil_change', 'chain', 'tires', 'brake_pads', 'service', 'other')),
  performed_at timestamptz not null,
  odometer_km numeric,
  cost numeric,
  notes text,
  next_due_odometer_km numeric,
  next_due_date date,
  created_at timestamptz not null default now()
);

alter table public.maintenance_records enable row level security;

create index maintenance_records_bike_id_idx on public.maintenance_records (bike_id);

create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid not null references public.bikes (id) on delete cascade,
  filled_at timestamptz not null,
  odometer_km numeric,
  liters numeric,
  cost numeric,
  full_tank boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.fuel_logs enable row level security;

create index fuel_logs_bike_id_idx on public.fuel_logs (bike_id);
