import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { Profile } from '@/services/profilesService';

export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupMember = Database['public']['Tables']['group_members']['Row'] & {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

export async function listMyGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createGroup(input: { name: string; description?: string | null }): Promise<Group> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('groups')
    .insert({ name: input.name, description: input.description ?? null, owner_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: data.id, profile_id: userData.user.id, role: 'owner' });
  if (memberError) throw memberError;

  return data;
}

export async function updateGroup(
  groupId: string,
  updates: Partial<Pick<Group, 'name' | 'description' | 'avatar_url'>>
) {
  const { error } = await supabase.from('groups').update(updates).eq('id', groupId);
  if (error) throw error;
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

export async function uploadGroupAvatar(groupId: string, localUri: string): Promise<string> {
  const base64 = await new File(localUri).base64();
  const path = `${groupId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage.from('group-avatars').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('group-avatars').getPublicUrl(path);
  return `${data.publicUrl}?updated=${Date.now()}`;
}

export async function listMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*, profile:profiles(id, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GroupMember[];
}

export async function removeMember(groupId: string, profileId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

export async function leaveGroup(groupId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');
  await removeMember(groupId, userData.user.id);
}

/** Join a group via its invite code. Returns the joined group. */
export async function joinGroupByCode(inviteCode: string): Promise<Group> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  // A plain `.from('groups').select()` can't see this row yet — the select
  // policy only allows existing members to read a group. This RPC is the
  // one narrow exception (see migration 0011): look up by invite code only.
  const { data: group, error: groupError } = await supabase.rpc('get_group_by_invite_code', {
    code: inviteCode.trim(),
  });
  if (groupError) throw groupError;
  if (!group) throw new Error('Invalid invite code');

  const { error: joinError } = await supabase
    .from('group_members')
    .upsert({ group_id: group.id, profile_id: userData.user.id, role: 'member' }, { onConflict: 'group_id,profile_id' });
  if (joinError) throw joinError;

  return group;
}
