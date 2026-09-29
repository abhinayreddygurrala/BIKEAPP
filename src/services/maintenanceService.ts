import { deleteAttachment, getAttachmentUri, saveAttachment, type AttachmentKind } from '@/lib/localAttachmentStorage';
import { uuidv4 } from '@/lib/uuid';
import {
  addLocalMaintenanceAttachment,
  createLocalMaintenanceRecord,
  deleteLocalMaintenanceAttachment,
  deleteLocalMaintenanceAttachmentsForRecord,
  deleteLocalMaintenanceRecord,
  getLocalMaintenanceRecord,
  listLocalMaintenanceAttachments,
  listLocalMaintenanceRecords,
  updateLocalMaintenanceRecord,
  type LocalMaintenanceRecord,
  type MaintenanceType,
} from '@/features/maintenance/maintenanceLocalDb';

export type { MaintenanceType, AttachmentKind };

export type MaintenanceAttachment = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  uri: string;
};

export type MaintenanceRecord = LocalMaintenanceRecord & { attachments: MaintenanceAttachment[] };

async function withAttachments(record: LocalMaintenanceRecord): Promise<MaintenanceRecord> {
  const rows = await listLocalMaintenanceAttachments(record.id);
  return {
    ...record,
    attachments: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      uri: getAttachmentUri(row.filename),
    })),
  };
}

export async function listMaintenanceRecords(bikeId: string): Promise<MaintenanceRecord[]> {
  const records = await listLocalMaintenanceRecords(bikeId);
  return Promise.all(records.map(withAttachments));
}

export async function getMaintenanceRecord(id: string): Promise<MaintenanceRecord | null> {
  const record = await getLocalMaintenanceRecord(id);
  return record ? withAttachments(record) : null;
}

export async function createMaintenanceRecord(input: {
  bike_id: string;
  type: MaintenanceType;
  performed_at: string;
  odometer_km: number | null;
  cost: number | null;
  notes: string | null;
  next_due_odometer_km: number | null;
  next_due_date: string | null;
  attachments?: { uri: string; kind: AttachmentKind }[];
}): Promise<MaintenanceRecord> {
  const id = uuidv4();
  await createLocalMaintenanceRecord(id, {
    bike_id: input.bike_id,
    type: input.type,
    performed_at: input.performed_at,
    odometer_km: input.odometer_km,
    cost: input.cost,
    notes: input.notes,
    next_due_odometer_km: input.next_due_odometer_km,
    next_due_date: input.next_due_date,
  });

  for (const attachment of input.attachments ?? []) {
    await addMaintenanceAttachment(id, attachment.uri, attachment.kind);
  }

  const record = await getLocalMaintenanceRecord(id);
  if (!record) throw new Error('Failed to create maintenance record');
  return withAttachments(record);
}

/** Copies a newly-picked file into permanent storage and attaches it to an existing record — used both right after creating a record and when adding to one later from the edit screen. */
export async function addMaintenanceAttachment(
  recordId: string,
  sourceUri: string,
  kind: AttachmentKind
): Promise<MaintenanceAttachment> {
  const id = uuidv4();
  const filename = await saveAttachment(id, sourceUri, kind);
  await addLocalMaintenanceAttachment({ id, record_id: recordId, filename, kind, created_at: new Date().toISOString() });
  return { id, kind, filename, uri: getAttachmentUri(filename) };
}

export async function removeMaintenanceAttachment(attachment: Pick<MaintenanceAttachment, 'id' | 'filename'>): Promise<void> {
  deleteAttachment(attachment.filename);
  await deleteLocalMaintenanceAttachment(attachment.id);
}

export async function deleteMaintenanceRecord(record: Pick<MaintenanceRecord, 'id' | 'attachments'>): Promise<void> {
  for (const attachment of record.attachments) {
    deleteAttachment(attachment.filename);
  }
  await deleteLocalMaintenanceAttachmentsForRecord(record.id);
  await deleteLocalMaintenanceRecord(record.id);
}

export { updateLocalMaintenanceRecord as updateMaintenanceRecord };
