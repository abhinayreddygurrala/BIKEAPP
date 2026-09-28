import { getDb } from '@/lib/localDb';

export type MaintenanceType = 'oil_change' | 'chain' | 'tires' | 'brake_pads' | 'service' | 'other';

export type LocalMaintenanceRecord = {
  id: string;
  bike_id: string;
  type: MaintenanceType;
  performed_at: string;
  odometer_km: number | null;
  cost: number | null;
  notes: string | null;
  next_due_odometer_km: number | null;
  next_due_date: string | null;
  receipt_filename: string | null;
  created_at: string;
};

export async function createLocalMaintenanceRecord(
  id: string,
  record: Omit<LocalMaintenanceRecord, 'id' | 'created_at'>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO maintenance_records_local
      (id, bike_id, type, performed_at, odometer_km, cost, notes, next_due_odometer_km, next_due_date, receipt_filename, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      record.bike_id,
      record.type,
      record.performed_at,
      record.odometer_km,
      record.cost,
      record.notes,
      record.next_due_odometer_km,
      record.next_due_date,
      record.receipt_filename,
      new Date().toISOString(),
    ]
  );
}

export async function updateLocalMaintenanceRecord(
  id: string,
  updates: Partial<Omit<LocalMaintenanceRecord, 'id' | 'bike_id' | 'created_at'>>
): Promise<void> {
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE maintenance_records_local SET ${setClause} WHERE id = ?`, [
    ...keys.map((k) => updates[k] as string | number | null),
    id,
  ]);
}

export async function deleteLocalMaintenanceRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM maintenance_records_local WHERE id = ?`, [id]);
}

export async function listLocalMaintenanceRecords(bikeId: string): Promise<LocalMaintenanceRecord[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMaintenanceRecord>(
    `SELECT * FROM maintenance_records_local WHERE bike_id = ? ORDER BY performed_at DESC`,
    [bikeId]
  );
}
