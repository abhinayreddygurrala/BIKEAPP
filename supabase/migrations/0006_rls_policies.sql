-- profiles: a user can only read/update their own row. Insert happens via
-- the security-definer trigger in 0001, not directly by the client.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- bikes: owner-only.
create policy "bikes_all_own" on public.bikes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- rides: owner-only.
create policy "rides_all_own" on public.rides
  for all using (auth.uid() = rider_id) with check (auth.uid() = rider_id);

-- ride_points: readable/writable only by the owner of the parent ride.
create policy "ride_points_all_own" on public.ride_points
  for all using (
    exists (
      select 1 from public.rides
      where rides.id = ride_points.ride_id
        and rides.rider_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.rides
      where rides.id = ride_points.ride_id
        and rides.rider_id = auth.uid()
    )
  );

-- maintenance_records / fuel_logs: readable/writable only by the owner of
-- the parent bike. No client reads/writes these yet (stub feature), but the
-- policy is in place from day one so the tables are never accidentally open.
create policy "maintenance_records_all_own" on public.maintenance_records
  for all using (
    exists (
      select 1 from public.bikes
      where bikes.id = maintenance_records.bike_id
        and bikes.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.bikes
      where bikes.id = maintenance_records.bike_id
        and bikes.owner_id = auth.uid()
    )
  );

create policy "fuel_logs_all_own" on public.fuel_logs
  for all using (
    exists (
      select 1 from public.bikes
      where bikes.id = fuel_logs.bike_id
        and bikes.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.bikes
      where bikes.id = fuel_logs.bike_id
        and bikes.owner_id = auth.uid()
    )
  );

-- groups / group_members / live_locations: restricted to creator/self only
-- for now. Real "group members can see each other" policies are designed
-- when the group/social feature is actually built — leaving these open
-- today would be a real data-exposure bug for tables nothing reads yet.
create policy "groups_all_owner" on public.groups
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "group_members_select_self" on public.group_members
  for select using (auth.uid() = profile_id);

create policy "group_members_all_self" on public.group_members
  for insert with check (auth.uid() = profile_id);

create policy "group_members_delete_self" on public.group_members
  for delete using (auth.uid() = profile_id);

create policy "live_locations_all_self" on public.live_locations
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
