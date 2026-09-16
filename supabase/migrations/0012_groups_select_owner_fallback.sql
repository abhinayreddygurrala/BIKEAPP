-- createGroup() inserts the group, then (as a second statement) adds the
-- creator to group_members. Between those two statements the creator isn't
-- a member yet, so the SELECT-back after the insert (`.select().single()`)
-- fails the is_group_member() check and Postgres reports it as "new row
-- violates row-level security policy" — even though the insert itself was
-- fine. Letting the owner see their own group directly fixes that gap.
drop policy if exists "groups_select_member" on public.groups;

create policy "groups_select_member" on public.groups
  for select using (public.is_group_member(id) or auth.uid() = owner_id);
