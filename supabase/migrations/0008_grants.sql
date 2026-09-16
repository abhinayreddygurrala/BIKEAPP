-- Table-level grants are separate from RLS: a role needs both a GRANT here
-- and a passing RLS policy (0006) to read/write a row. Every policy in this
-- app requires auth.uid(), which is null for the unauthenticated `anon`
-- role, so `anon` gets no grants here — it could never pass RLS anyway.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.bikes,
  public.rides,
  public.ride_points,
  public.maintenance_records,
  public.fuel_logs,
  public.groups,
  public.group_members,
  public.live_locations
to authenticated;
