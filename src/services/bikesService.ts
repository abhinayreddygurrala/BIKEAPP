import {
  createLocalBike,
  deleteLocalBike,
  getAllLocalBikes,
  getLocalBike,
  updateLocalBike,
  type LocalBike,
  type LocalBikeUpdate,
} from '@/features/bikes/bikesLocalDb';
import { getDb } from '@/lib/localDb';
import { deletePhoto, getPhotoUri, savePhoto } from '@/lib/localPhotoStorage';
import { uuidv4 } from '@/lib/uuid';
import { deleteExpense, listExpenses } from '@/services/expenseService';
import { deleteFuelLog, listFuelLogs } from '@/services/fuelService';
import { deleteMaintenanceRecord, listMaintenanceRecords } from '@/services/maintenanceService';
import { deleteRide, listRidesForBike } from '@/services/ridesService';

// Screens don't need to know about the filename/path convention behind a
// bike's photo — `photo_url` is computed here from `photo_filename` and is
// ready to hand straight to <Image source={{ uri }} />.
export type Bike = LocalBike & { photo_url: string | null };

function withPhotoUrl(bike: LocalBike): Bike {
  return {
    ...bike,
    photo_url: bike.photo_filename ? getPhotoUri('bikes', bike.id) : null,
  };
}

export async function listBikes(): Promise<Bike[]> {
  const rows = await getAllLocalBikes();
  return rows.map(withPhotoUrl);
}

export async function getBike(bikeId: string): Promise<Bike | null> {
  const row = await getLocalBike(bikeId);
  return row ? withPhotoUrl(row) : null;
}

export async function createBike(input: {
  name: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): Promise<Bike> {
  const id = uuidv4();
  await createLocalBike({
    id,
    name: input.name,
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
  });
  const row = await getLocalBike(id);
  if (!row) throw new Error('Failed to create bike');
  return withPhotoUrl(row);
}

export async function updateBike(
  bikeId: string,
  updates: Partial<Pick<LocalBike, 'name' | 'make' | 'model' | 'year' | 'current_odometer_km' | 'vin'>>
): Promise<Bike> {
  await updateLocalBike(bikeId, updates as LocalBikeUpdate);
  const row = await getLocalBike(bikeId);
  if (!row) throw new Error('Bike not found');
  return withPhotoUrl(row);
}

/** Copies `localUri` into permanent storage as this bike's photo and records it on the row. */
export async function setBikePhoto(bikeId: string, localUri: string): Promise<void> {
  const filename = await savePhoto('bikes', bikeId, localUri);
  await updateLocalBike(bikeId, { photo_filename: filename });
}

export async function removeBikePhoto(bikeId: string): Promise<void> {
  deletePhoto('bikes', bikeId);
  await updateLocalBike(bikeId, { photo_filename: null });
}

/**
 * Removes everything that belongs to a bike — its rides, service records,
 * expenses and fuel logs, with their receipt files. Anything left on the
 * phone would also stay in the cloud backup, since auto-save mirrors the
 * phone.
 */
async function deleteBikeData(bikeId: string): Promise<void> {
  for (const ride of await listRidesForBike(bikeId)) await deleteRide(ride);
  for (const record of await listMaintenanceRecords(bikeId)) await deleteMaintenanceRecord(record);
  for (const expense of await listExpenses(bikeId)) await deleteExpense(expense);
  for (const log of await listFuelLogs(bikeId)) await deleteFuelLog(log.id);
}

export async function deleteBike(bikeId: string): Promise<void> {
  await deleteBikeData(bikeId);
  const bike = await getLocalBike(bikeId);
  if (bike?.photo_filename) {
    deletePhoto('bikes', bikeId);
  }
  await deleteLocalBike(bikeId);
}

/**
 * Cleans up rides, service records, expenses and fuel logs left behind by
 * bikes deleted before deleteBike removed them too. Safe to run any time a restore
 * isn't half-done: a restore writes bikes before anything that points at them.
 */
export async function deleteOrphanedBikeData(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ bike_id: string }>(`
    SELECT bike_id FROM maintenance_records_local WHERE bike_id NOT IN (SELECT id FROM bikes_local)
    UNION SELECT bike_id FROM expenses_local WHERE bike_id NOT IN (SELECT id FROM bikes_local)
    UNION SELECT bike_id FROM fuel_logs_local WHERE bike_id NOT IN (SELECT id FROM bikes_local)
    UNION SELECT bike_id FROM rides_local
      WHERE status = 'stopped' AND bike_id IS NOT NULL AND bike_id NOT IN (SELECT id FROM bikes_local)
  `);
  for (const { bike_id } of rows) await deleteBikeData(bike_id);
}
