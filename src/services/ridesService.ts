import {
  createLocalRide,
  deleteLocalRide,
  finalizeLocalRide,
  getAllLocalRides,
  getLocalRide,
  updateLocalRideFields,
  updateLocalRideStats,
  type LocalRide,
} from '@/features/ride-tracking/rideLocalDb';
import { uuidv4 } from '@/lib/uuid';

export type RideSummary = LocalRide;

/** Ride history, newest first. Only finished rides are shown — a ride still
 * being recorded or paused doesn't belong in the list yet. */
export async function listRides(): Promise<RideSummary[]> {
  const rides = await getAllLocalRides();
  return rides.filter((r) => r.status === 'stopped');
}

export async function getRideDetail(rideId: string): Promise<RideSummary | null> {
  return getLocalRide(rideId);
}

/** Delete a ride from local storage. */
export async function deleteRide(ride: Pick<RideSummary, 'id'>) {
  await deleteLocalRide(ride.id);
}

/** Edit a ride's title and/or bike. Distance/speed/route are GPS-derived and intentionally not editable. */
export async function updateRide(
  ride: Pick<RideSummary, 'id'>,
  updates: { title?: string | null; bike_id?: string | null }
) {
  await updateLocalRideFields(ride.id, updates);
}

/** Pinned rides sort to the top of the history list, ahead of newest-first. */
export async function setRidePinned(rideId: string, pinned: boolean) {
  await updateLocalRideFields(rideId, { pinned: pinned ? 1 : 0 });
}

/** Log a ride that wasn't recorded live. Stats the app has no way to know (max speed, elevation, lean, route) are left blank. */
export async function createManualRide(input: {
  bikeId: string | null;
  title: string | null;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
}): Promise<string> {
  const id = uuidv4();
  const avgSpeedKmh =
    input.durationSeconds > 0 ? (input.distanceMeters / 1000 / (input.durationSeconds / 3600)) : 0;

  await createLocalRide(id, input.bikeId, input.startedAt, input.title);
  await updateLocalRideStats(id, {
    distance_meters: input.distanceMeters,
    duration_seconds: input.durationSeconds,
    avg_speed_kmh: avgSpeedKmh,
  });
  await finalizeLocalRide(id, input.endedAt, '', 'stopped');

  return id;
}
