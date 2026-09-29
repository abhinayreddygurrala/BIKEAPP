import { getDb } from '@/lib/localDb';

export type LocalFuelLog = {
  id: string;
  bike_id: string;
  filled_at: string;
  odometer_km: number | null;
  liters: number | null;
  cost: number | null;
  full_tank: 0 | 1;
  distance_since_last_full_km: number | null;
  notes: string | null;
  created_at: string;
};

/** The most recent full-tank fill-up for a bike, used to compute the next one's distance-since-last-full. */
export async function getLastFullTankFuelLog(bikeId: string): Promise<LocalFuelLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalFuelLog>(
    `SELECT * FROM fuel_logs_local
     WHERE bike_id = ? AND full_tank = 1 AND odometer_km IS NOT NULL
     ORDER BY filled_at DESC LIMIT 1`,
    [bikeId]
  );
  return row ?? null;
}

export async function createLocalFuelLog(
  id: string,
  log: Omit<LocalFuelLog, 'id' | 'created_at'>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO fuel_logs_local
      (id, bike_id, filled_at, odometer_km, liters, cost, full_tank, distance_since_last_full_km, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      log.bike_id,
      log.filled_at,
      log.odometer_km,
      log.liters,
      log.cost,
      log.full_tank,
      log.distance_since_last_full_km,
      log.notes,
      new Date().toISOString(),
    ]
  );
}

export async function updateLocalFuelLog(
  id: string,
  updates: Partial<Omit<LocalFuelLog, 'id' | 'bike_id' | 'created_at'>>
): Promise<void> {
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE fuel_logs_local SET ${setClause} WHERE id = ?`, [
    ...keys.map((k) => updates[k] as string | number | null),
    id,
  ]);
}

export async function deleteLocalFuelLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM fuel_logs_local WHERE id = ?`, [id]);
}

export async function listLocalFuelLogs(bikeId: string): Promise<LocalFuelLog[]> {
  const db = await getDb();
  return db.getAllAsync<LocalFuelLog>(
    `SELECT * FROM fuel_logs_local WHERE bike_id = ? ORDER BY filled_at DESC`,
    [bikeId]
  );
}

export async function getLocalFuelLog(id: string): Promise<LocalFuelLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalFuelLog>(`SELECT * FROM fuel_logs_local WHERE id = ?`, [id]);
  return row ?? null;
}
