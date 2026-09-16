import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type GroupMessage = Database['public']['Tables']['group_messages']['Row'];

export async function listMessages(groupId: string): Promise<GroupMessage[]> {
  const { data, error } = await supabase
    .from('group_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendTextMessage(groupId: string, content: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('group_messages')
    .insert({ group_id: groupId, sender_id: userData.user.id, kind: 'text', content });
  if (error) throw error;
}

export async function sendImageMessage(groupId: string, localUri: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const base64 = await new File(localUri).base64();
  const path = `${groupId}/${Date.now()}-${userData.user.id}.jpg`;

  const { error: uploadError } = await supabase.storage.from('group-chat-media').upload(path, decode(base64), {
    contentType: 'image/jpeg',
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path);

  const { error } = await supabase
    .from('group_messages')
    .insert({ group_id: groupId, sender_id: userData.user.id, kind: 'image', media_url: data.publicUrl });
  if (error) throw error;
}

/** Subscribe to new messages in a group. Returns an unsubscribe function. */
export function subscribeToMessages(groupId: string, onInsert: (message: GroupMessage) => void) {
  const channel = supabase
    .channel(`group-messages-${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onInsert(payload.new as GroupMessage)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
