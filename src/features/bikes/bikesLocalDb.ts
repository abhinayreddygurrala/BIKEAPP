import { getDb } from '@/lib/localDb';

export type LocalBike = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  current_odometer_km: number | null;
  vin: string | null;
  photo_filename: string | null;
  created_at: string;
  updated_at: string;
};

export type LocalBikeUpdate = Partial<
  Pick<LocalBike, 'name' | 'make' | 'model' | 'year' | 'current_odometer_km' | 'vin' | 'photo_filename'>
>;

export async function createLocalBike(bike: {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO bikes_local (id, name, make, model, year, current_odometer_km, vin, photo_filename, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [bike.id, bike.name, bike.make, bike.model, bike.year, now, now]
  );
}

export async function getLocalBike(bikeId: string): Promise<LocalBike | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalBike>(`SELECT * FROM bikes_local WHERE id = ?`, [bikeId]);
  return row ?? null;
}

export async function getAllLocalBikes(): Promise<LocalBike[]> {
  const db = await getDb();
  return db.getAllAsync<LocalBike>(`SELECT * FROM bikes_local ORDER BY created_at DESC`);
}

export async function updateLocalBike(bikeId: string, updates: LocalBikeUpdate): Promise<void> {
  const keys = Object.keys(updates) as (keyof LocalBikeUpdate)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE bikes_local SET ${setClause}, updated_at = ? WHERE id = ?`, [
    ...keys.map((k) => updates[k] as string | number | null),
    new Date().toISOString(),
    bikeId,
  ]);
}

export async function deleteLocalBike(bikeId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM bikes_local WHERE id = ?`, [bikeId]);
}
