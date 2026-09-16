-- Groups gain the fields the UI needs: a description, a photo, and a
-- shareable invite code (separate from the group's own id so it can be
-- rotated later without changing the group's identity).
alter table public.groups
  add column description text,
  add column avatar_url text,
  add column invite_code text unique not null default substr(md5(random()::text), 1, 10);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image')),
  content text,
  media_url text,
  created_at timestamptz not null default now()
);

alter table public.group_messages enable row level security;

create index group_messages_group_id_created_at_idx on public.group_messages (group_id, created_at);

-- Without this, new rows never reach subscribeToMessages() in the app —
-- tables aren't live by default, they have to be added to this publication.
alter publication supabase_realtime add table public.group_messages;

-- Membership checks are needed inside RLS policies on public.groups and
-- public.group_members themselves. A policy on group_members that queries
-- group_members directly (even as "the other members of my group") is a
-- well-known way to trigger "infinite recursion detected in policy" in
-- Postgres — routing the check through a security-definer function (which
-- runs with elevated privilege and bypasses RLS for its own query) avoids
-- that entirely.
create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and profile_id = auth.uid()
  );
$$;

create function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id
      and profile_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Replace the owner-only policies from 0006: members (not just the owner)
-- need to see a group they belong to and its full member list.
drop policy if exists "groups_all_owner" on public.groups;
drop policy if exists "group_members_select_self" on public.group_members;
drop policy if exists "group_members_delete_self" on public.group_members;

create policy "groups_select_member" on public.groups
  for select using (public.is_group_member(id));

create policy "groups_insert_owner" on public.groups
  for insert with check (auth.uid() = owner_id);

create policy "groups_update_owner" on public.groups
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "groups_delete_owner" on public.groups
  for delete using (auth.uid() = owner_id);

create policy "group_members_select_fellow_member" on public.group_members
  for select using (public.is_group_member(group_id));

-- Leaving (delete your own row) or being removed by an owner/admin.
create policy "group_members_delete_self_or_admin" on public.group_members
  for delete using (auth.uid() = profile_id or public.is_group_admin(group_id));

create policy "group_messages_select_member" on public.group_messages
  for select using (public.is_group_member(group_id));

create policy "group_messages_insert_member" on public.group_messages
  for insert with check (auth.uid() = sender_id and public.is_group_member(group_id));

-- Group photos: public read (same as profile avatars), admin/owner write,
-- path convention {group_id}/avatar.jpg.
-- Joining a group by invite code needs to look the group up *before* the
-- caller is a member, which the select policy above deliberately doesn't
-- allow (it would otherwise mean any signed-in user could list every
-- group's name/description just by querying the table). This function is
-- the one narrow, legitimate exception: look up a single group by its
-- (unguessable) invite code, nothing else.
create function public.get_group_by_invite_code(code text)
returns public.groups
language sql
security definer
set search_path = public
stable
as $$
  select * from public.groups where invite_code = code limit 1;
$$;

insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

create policy "group_avatars_public_read"
on storage.objects for select
using (bucket_id = 'group-avatars');

create policy "group_avatars_admin_write"
on storage.objects for insert
to authenticated
with check (bucket_id = 'group-avatars' and public.is_group_admin(((storage.foldername(name))[1])::uuid));

create policy "group_avatars_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'group-avatars' and public.is_group_admin(((storage.foldername(name))[1])::uuid));

-- Chat media (photos): public bucket, same simple pattern as avatars —
-- URLs are unguessable random paths, and only members can upload. Path
-- convention {group_id}/{random filename}.
insert into storage.buckets (id, name, public)
values ('group-chat-media', 'group-chat-media', true)
on conflict (id) do nothing;

create policy "group_chat_media_public_read"
on storage.objects for select
using (bucket_id = 'group-chat-media');

create policy "group_chat_media_member_write"
on storage.objects for insert
to authenticated
with check (bucket_id = 'group-chat-media' and public.is_group_member(((storage.foldername(name))[1])::uuid));
