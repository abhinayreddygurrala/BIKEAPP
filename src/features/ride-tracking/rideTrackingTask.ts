import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getActiveRideId, getActiveSegment } from '@/features/ride-tracking/activeRideStore';
import { appendRidePoint, getNextSeq } from '@/features/ride-tracking/rideLocalDb';

export const RIDE_TRACKING_TASK = 'bikeapp-ride-tracking-task';

// Must be called at module top-level (imported once from the root layout)
// so the task is registered before any startLocationUpdatesAsync call, and
// so it exists to be re-invoked if iOS relaunches the app in the background
// to deliver a location update.
TaskManager.defineTask(RIDE_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[rideTrackingTask]', error.message);
    return;
  }

  const rideId = await getActiveRideId();
  if (!rideId) return;

  const { locations } = (data ?? {}) as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  const segment = await getActiveSegment();
  let seq = await getNextSeq(rideId);

  for (const location of locations) {
    await appendRidePoint(rideId, {
      seq: seq++,
      segment,
      recordedAt: new Date(location.timestamp).toISOString(),
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      altitudeM: location.coords.altitude,
      speedMps: location.coords.speed,
      accuracyM: location.coords.accuracy,
    });
  }
});
