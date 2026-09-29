import { getDb } from '@/lib/localDb';
import type { AttachmentKind } from '@/lib/localAttachmentStorage';

export type MaintenanceType =
  | 'oil_change'
  | 'chain'
  | 'tires'
  | 'brake_pads'
  | 'valve_adjustment'
  | 'service'
  | 'mod'
  | 'other';

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
  created_at: string;
};

export type LocalMaintenanceAttachment = {
  id: string;
  record_id: string;
  filename: string;
  kind: AttachmentKind;
  created_at: string;
};

export async function createLocalMaintenanceRecord(
  id: string,
  record: Omit<LocalMaintenanceRecord, 'id' | 'created_at'>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO maintenance_records_local
      (id, bike_id, type, performed_at, odometer_km, cost, notes, next_due_odometer_km, next_due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function getLocalMaintenanceRecord(id: string): Promise<LocalMaintenanceRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalMaintenanceRecord>(
    `SELECT * FROM maintenance_records_local WHERE id = ?`,
    [id]
  );
  return row ?? null;
}

export async function addLocalMaintenanceAttachment(attachment: LocalMaintenanceAttachment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO maintenance_attachments_local (id, record_id, filename, kind, created_at) VALUES (?, ?, ?, ?, ?)`,
    [attachment.id, attachment.record_id, attachment.filename, attachment.kind, attachment.created_at]
  );
}

export async function listLocalMaintenanceAttachments(recordId: string): Promise<LocalMaintenanceAttachment[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMaintenanceAttachment>(
    `SELECT * FROM maintenance_attachments_local WHERE record_id = ? ORDER BY created_at ASC`,
    [recordId]
  );
}

export async function deleteLocalMaintenanceAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM maintenance_attachments_local WHERE id = ?`, [id]);
}

export async function deleteLocalMaintenanceAttachmentsForRecord(recordId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM maintenance_attachments_local WHERE record_id = ?`, [recordId]);
}
