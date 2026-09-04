import { supabase } from '@/lib/supabase';
import {
  getAllLocalRides,
  getLocalRide,
  getRidePoints,
  getUnsyncedRides,
  markRideSynced,
  type LocalRide,
} from '@/features/ride-tracking/rideLocalDb';

const POINTS_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Upload one finished local ride (and its points) to Supabase. Safe to retry. */
export async function syncRide(localRide: LocalRide) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error: rideError } = await supabase.from('rides').upsert(
    {
      id: localRide.id,
      rider_id: userData.user.id,
      bike_id: localRide.bike_id,
      title: localRide.title,
      started_at: localRide.started_at,
      ended_at: localRide.ended_at,
      distance_meters: localRide.distance_meters,
      duration_seconds: localRide.duration_seconds,
      avg_speed_kmh: localRide.avg_speed_kmh,
      max_speed_kmh: localRide.max_speed_kmh,
      elevation_gain_m: localRide.elevation_gain_m,
      elevation_loss_m: localRide.elevation_loss_m,
      route_polyline: localRide.route_polyline,
    },
    { onConflict: 'id' }
  );
  if (rideError) throw rideError;

  // Idempotent re-upload: clear any partial points from a prior failed
  // attempt, then insert the full local set fresh.
  const { error: deleteError } = await supabase.from('ride_points').delete().eq('ride_id', localRide.id);
  if (deleteError) throw deleteError;

  const points = await getRidePoints(localRide.id);
  for (const batch of chunk(points, POINTS_CHUNK_SIZE)) {
    const { error: pointsError } = await supabase.from('ride_points').insert(
      batch.map((p) => ({
        ride_id: localRide.id,
        seq: p.seq,
        recorded_at: p.recorded_at,
        lat: p.lat,
        lng: p.lng,
        altitude_m: p.altitude_m,
        speed_mps: p.speed_mps,
        accuracy_m: p.accuracy_m,
      }))
    );
    if (pointsError) throw pointsError;
  }

  await markRideSynced(localRide.id);
}

/** Sync every finished-but-unsynced local ride. Failures are swallowed per-ride so one bad ride doesn't block the rest. */
export async function syncPendingRides() {
  const pending = await getUnsyncedRides();
  const results = await Promise.allSettled(pending.map((ride) => syncRide(ride)));
  return {
    synced: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
}

export type RideSummary = LocalRide & { source: 'local' | 'remote' };

/** Ride history merging local (unsynced) rides with what's already on Supabase. */
export async function listRides(): Promise<RideSummary[]> {
  const localRides = await getAllLocalRides();

  const { data: remoteRides, error } = await supabase
    .from('rides')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) throw error;

  const merged: RideSummary[] = [];
  const seen = new Set<string>();

  for (const remote of remoteRides ?? []) {
    seen.add(remote.id);
    merged.push({
      id: remote.id,
      bike_id: remote.bike_id,
      title: remote.title,
      started_at: remote.started_at,
      ended_at: remote.ended_at,
      distance_meters: remote.distance_meters ?? 0,
      duration_seconds: remote.duration_seconds ?? 0,
      avg_speed_kmh: remote.avg_speed_kmh ?? 0,
      max_speed_kmh: remote.max_speed_kmh ?? 0,
      elevation_gain_m: remote.elevation_gain_m ?? 0,
      elevation_loss_m: remote.elevation_loss_m ?? 0,
      route_polyline: remote.route_polyline,
      status: 'stopped',
      synced: 1,
      source: 'remote',
    });
  }

  for (const local of localRides) {
    if (seen.has(local.id) || local.status !== 'stopped') continue;
    merged.push({ ...local, source: 'local' });
  }

  merged.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return merged;
}

export async function getRideDetail(rideId: string): Promise<RideSummary | null> {
  const { data: remote, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();
  if (error) throw error;

  if (remote) {
    return {
      id: remote.id,
      bike_id: remote.bike_id,
      title: remote.title,
      started_at: remote.started_at,
      ended_at: remote.ended_at,
      distance_meters: remote.distance_meters ?? 0,
      duration_seconds: remote.duration_seconds ?? 0,
      avg_speed_kmh: remote.avg_speed_kmh ?? 0,
      max_speed_kmh: remote.max_speed_kmh ?? 0,
      elevation_gain_m: remote.elevation_gain_m ?? 0,
      elevation_loss_m: remote.elevation_loss_m ?? 0,
      route_polyline: remote.route_polyline,
      status: 'stopped',
      synced: 1,
      source: 'remote',
    };
  }

  const local = await getLocalRide(rideId);
  return local ? { ...local, source: 'local' } : null;
}
