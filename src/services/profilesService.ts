import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUnits(userId: string, units: Profile['units']) {
  const { error } = await supabase.from('profiles').update({ units }).eq('id', userId);
  if (error) throw error;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'avatar_url'>>
) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

/** Upload a local image file (e.g. from expo-image-picker) as the user's avatar. Returns its public URL. */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const base64 = await new File(localUri).base64();
  const path = `${userId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Bust CDN/client caching for the new upload — the path never changes,
  // only its contents do.
  return `${data.publicUrl}?updated=${Date.now()}`;
}
