import { uuidv4 } from '@/lib/uuid';
import {
  createLocalFuelLog,
  deleteLocalFuelLog,
  getLastFullTankFuelLog,
  getLocalFuelLog,
  listLocalFuelLogs,
  updateLocalFuelLog,
  type LocalFuelLog,
} from '@/features/maintenance/fuelLocalDb';

export type FuelLog = LocalFuelLog;

export async function listFuelLogs(bikeId: string): Promise<FuelLog[]> {
  return listLocalFuelLogs(bikeId);
}

export async function getFuelLog(id: string): Promise<FuelLog | null> {
  return getLocalFuelLog(id);
}

export async function createFuelLog(input: {
  bike_id: string;
  filled_at: string;
  odometer_km: number | null;
  liters: number | null;
  cost: number | null;
  full_tank: boolean;
  notes: string | null;
}): Promise<FuelLog> {
  // Distance since the last full tank, computed against whatever fill-up
  // preceded this one — regardless of whether THIS fill-up is itself a
  // full tank — so every entry can show "you rode this far on your last
  // full tank" on the next visit.
  const lastFull = await getLastFullTankFuelLog(input.bike_id);
  const distanceSinceLastFullKm =
    lastFull && input.odometer_km != null && lastFull.odometer_km != null
      ? input.odometer_km - lastFull.odometer_km
      : null;

  const id = uuidv4();
  const record: Omit<FuelLog, 'id' | 'created_at'> = {
    bike_id: input.bike_id,
    filled_at: input.filled_at,
    odometer_km: input.odometer_km,
    liters: input.liters,
    cost: input.cost,
    full_tank: input.full_tank ? 1 : 0,
    distance_since_last_full_km: distanceSinceLastFullKm,
    notes: input.notes,
  };
  await createLocalFuelLog(id, record);
  return { id, created_at: new Date().toISOString(), ...record };
}

/** Only updates this entry's own fields — doesn't recompute distance-since-last-full
 * on any later entry that was chained off this one, same as creation only ever
 * computes it forward, once, at insert time. */
export async function updateFuelLog(
  id: string,
  updates: Partial<Pick<FuelLog, 'filled_at' | 'odometer_km' | 'liters' | 'cost' | 'full_tank' | 'notes'>>
): Promise<void> {
  await updateLocalFuelLog(id, updates);
}

export async function deleteFuelLog(id: string): Promise<void> {
  await deleteLocalFuelLog(id);
}
