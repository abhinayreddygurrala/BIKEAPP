import { deletePhoto, getPhotoUri, savePhoto } from '@/lib/localPhotoStorage';
import { uuidv4 } from '@/lib/uuid';
import {
  createLocalMaintenanceRecord,
  deleteLocalMaintenanceRecord,
  listLocalMaintenanceRecords,
  updateLocalMaintenanceRecord,
  type LocalMaintenanceRecord,
  type MaintenanceType,
} from '@/features/maintenance/maintenanceLocalDb';

export type { MaintenanceType };
export type MaintenanceRecord = LocalMaintenanceRecord & { receipt_url: string | null };

function withReceiptUrl(record: LocalMaintenanceRecord): MaintenanceRecord {
  return {
    ...record,
    receipt_url: record.receipt_filename ? getPhotoUri('maintenance', record.id) : null,
  };
}

export async function listMaintenanceRecords(bikeId: string): Promise<MaintenanceRecord[]> {
  const records = await listLocalMaintenanceRecords(bikeId);
  return records.map(withReceiptUrl);
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
  receiptUri?: string | null;
}): Promise<MaintenanceRecord> {
  const id = uuidv4();
  const receiptFilename = input.receiptUri ? await savePhoto('maintenance', id, input.receiptUri) : null;
  await createLocalMaintenanceRecord(id, {
    bike_id: input.bike_id,
    type: input.type,
    performed_at: input.performed_at,
    odometer_km: input.odometer_km,
    cost: input.cost,
    notes: input.notes,
    next_due_odometer_km: input.next_due_odometer_km,
    next_due_date: input.next_due_date,
    receipt_filename: receiptFilename,
  });
  return withReceiptUrl({
    id,
    bike_id: input.bike_id,
    type: input.type,
    performed_at: input.performed_at,
    odometer_km: input.odometer_km,
    cost: input.cost,
    notes: input.notes,
    next_due_odometer_km: input.next_due_odometer_km,
    next_due_date: input.next_due_date,
    receipt_filename: receiptFilename,
    created_at: new Date().toISOString(),
  });
}

export async function deleteMaintenanceRecord(record: Pick<MaintenanceRecord, 'id' | 'receipt_filename'>): Promise<void> {
  if (record.receipt_filename) deletePhoto('maintenance', record.id);
  await deleteLocalMaintenanceRecord(record.id);
}

export { updateLocalMaintenanceRecord as updateMaintenanceRecord };
