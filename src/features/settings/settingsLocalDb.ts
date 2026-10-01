import type { Units } from '@/features/ride-tracking/rideMath';
import { getDb } from '@/lib/localDb';

export type ThemeMode = 'system' | 'light' | 'dark';

// The notches on the Text Size slider, smallest to largest, with Default in
// the middle. Capped at 1.3x: beyond that, fixed-width layouts like the ride
// stat cards start to clip.
export const TEXT_SCALES = [0.85, 0.92, 1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  0.85: 'Smallest',
  0.92: 'Small',
  1: 'Default',
  1.15: 'Large',
  1.3: 'Largest',
};

/** Maps any stored value (including ones from older builds) onto the nearest current notch. */
export function snapTextScale(value: number): TextScale {
  return TEXT_SCALES.reduce((best, scale) => (Math.abs(scale - value) < Math.abs(best - value) ? scale : best));
}

export type LocalSettings = {
  display_name: string | null;
  bio: string | null;
  avatar_filename: string | null;
  units: Units;
  text_scale: TextScale;
  theme_mode: ThemeMode;
};

export async function getLocalSettings(): Promise<LocalSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalSettings>(
    `SELECT display_name, bio, avatar_filename, units, text_scale, theme_mode FROM settings_local WHERE id = 1`
  );
  // The row is seeded by getDb()'s own schema setup, so this should never
  // be null in practice — the fallback just keeps the return type honest.
  if (!row) {
    return { display_name: null, bio: null, avatar_filename: null, units: 'metric', text_scale: 1, theme_mode: 'system' };
  }
  return { ...row, text_scale: snapTextScale(row.text_scale) };
}

export async function updateLocalSettings(updates: Partial<LocalSettings>): Promise<void> {
  const keys = Object.keys(updates) as (keyof LocalSettings)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE settings_local SET ${setClause}, updated_at = ? WHERE id = 1`, [
    ...keys.map((k) => updates[k] as string | number | null),
    new Date().toISOString(),
  ]);
}
