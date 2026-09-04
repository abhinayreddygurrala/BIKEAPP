import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Bike = Database['public']['Tables']['bikes']['Row'];

export async function listBikes(): Promise<Bike[]> {
  const { data, error } = await supabase.from('bikes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBike(bikeId: string): Promise<Bike | null> {
  const { data, error } = await supabase.from('bikes').select('*').eq('id', bikeId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createBike(input: {
  name: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): Promise<Bike> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('bikes')
    .insert({ owner_id: userData.user.id, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBike(bikeId: string) {
  const { error } = await supabase.from('bikes').delete().eq('id', bikeId);
  if (error) throw error;
}
