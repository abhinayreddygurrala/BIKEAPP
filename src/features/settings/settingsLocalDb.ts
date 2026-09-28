import type { Units } from '@/features/ride-tracking/rideMath';
import { getDb } from '@/lib/localDb';

export type LocalSettings = {
  display_name: string | null;
  bio: string | null;
  avatar_filename: string | null;
  units: Units;
};

export async function getLocalSettings(): Promise<LocalSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalSettings>(
    `SELECT display_name, bio, avatar_filename, units FROM settings_local WHERE id = 1`
  );
  // The row is seeded by getDb()'s own schema setup, so this should never
  // be null in practice — the fallback just keeps the return type honest.
  return row ?? { display_name: null, bio: null, avatar_filename: null, units: 'metric' };
}

export async function updateLocalSettings(updates: Partial<LocalSettings>): Promise<void> {
  const keys = Object.keys(updates) as (keyof LocalSettings)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE settings_local SET ${setClause}, updated_at = ? WHERE id = 1`, [
    ...keys.map((k) => updates[k] as string | null),
    new Date().toISOString(),
  ]);
}
