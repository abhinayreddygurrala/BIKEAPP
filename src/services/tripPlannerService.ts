import { supabase } from '@/lib/supabase';

export async function askTripPlanner(query: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ answer?: string; error?: string }>(
    'motorcycle-trip-planner',
    { body: { query } }
  );
  if (error) throw error;
  if (!data?.answer) throw new Error(data?.error ?? 'No answer returned');
  return data.answer;
}
