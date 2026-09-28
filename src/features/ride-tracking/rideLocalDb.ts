import { getDb } from '@/lib/localDb';

export type LocalRideStatus = 'recording' | 'paused' | 'stopped';

export type LocalRide = {
  id: string;
  bike_id: string | null;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  distance_meters: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  lean_max_deg: number;
  lean_avg_deg: number;
  route_polyline: string | null;
  status: LocalRideStatus;
  synced: 0 | 1;
  stopped_seconds: number | null;
  accel_0_60_seconds: number | null;
  accel_0_100_seconds: number | null;
  curve_count: number | null;
  steepest_lean_left_deg: number | null;
  steepest_lean_right_deg: number | null;
  wheelie_count: number | null;
  longest_wheelie_seconds: number | null;
  peak_lateral_g: number | null;
  fastest_curve_left_kmh: number | null;
  fastest_curve_right_kmh: number | null;
  longest_curve_left_m: number | null;
  longest_curve_right_m: number | null;
  accel_0_150_seconds: number | null;
  rolling_60_130_seconds: number | null;
  drag_eighth_mile_seconds: number | null;
  drag_quarter_mile_seconds: number | null;
  pinned: 0 | 1;
};

export type LocalRidePoint = {
  id: number;
  ride_id: string;
  seq: number;
  segment: number;
  recorded_at: string;
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_mps: number | null;
  accuracy_m: number | null;
};

export async function createLocalRide(
  id: string,
  bikeId: string | null,
  startedAt: string,
  title: string | null = null
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO rides_local (id, bike_id, started_at, title, status, synced) VALUES (?, ?, ?, ?, 'recording', 0)`,
    [id, bikeId, startedAt, title]
  );
}

export async function appendRidePoint(
  rideId: string,
  point: {
    seq: number;
    segment: number;
    recordedAt: string;
    lat: number;
    lng: number;
    altitudeM: number | null;
    speedMps: number | null;
    accuracyM: number | null;
  }
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ride_points_local (ride_id, seq, segment, recorded_at, lat, lng, altitude_m, speed_mps, accuracy_m)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rideId,
      point.seq,
      point.segment,
      point.recordedAt,
      point.lat,
      point.lng,
      point.altitudeM,
      point.speedMps,
      point.accuracyM,
    ]
  );
}

export async function getNextSeq(rideId: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ maxSeq: number | null }>(
    `SELECT MAX(seq) as maxSeq FROM ride_points_local WHERE ride_id = ?`,
    [rideId]
  );
  return (row?.maxSeq ?? -1) + 1;
}

export async function getRidePoints(rideId: string) {
  const db = await getDb();
  return db.getAllAsync<LocalRidePoint>(
    `SELECT * FROM ride_points_local WHERE ride_id = ? ORDER BY seq ASC`,
    [rideId]
  );
}

export async function updateLocalRideStats(
  rideId: string,
  stats: Partial<
    Pick<
      LocalRide,
      | 'distance_meters'
      | 'duration_seconds'
      | 'avg_speed_kmh'
      | 'max_speed_kmh'
      | 'elevation_gain_m'
      | 'elevation_loss_m'
      | 'lean_max_deg'
      | 'lean_avg_deg'
      | 'stopped_seconds'
      | 'accel_0_60_seconds'
      | 'accel_0_100_seconds'
      | 'curve_count'
      | 'steepest_lean_left_deg'
      | 'steepest_lean_right_deg'
      | 'wheelie_count'
      | 'longest_wheelie_seconds'
      | 'peak_lateral_g'
      | 'fastest_curve_left_kmh'
      | 'fastest_curve_right_kmh'
      | 'longest_curve_left_m'
      | 'longest_curve_right_m'
      | 'accel_0_150_seconds'
      | 'rolling_60_130_seconds'
      | 'drag_eighth_mile_seconds'
      | 'drag_quarter_mile_seconds'
    >
  >
) {
  const db = await getDb();
  const keys = Object.keys(stats) as (keyof typeof stats)[];
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(
    `UPDATE rides_local SET ${setClause} WHERE id = ?`,
    [...keys.map((k) => stats[k] as number | null), rideId]
  );
}

export async function finalizeLocalRide(
  rideId: string,
  endedAt: string,
  polyline: string,
  status: LocalRideStatus = 'stopped'
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE rides_local SET ended_at = ?, route_polyline = ?, status = ? WHERE id = ?`,
    [endedAt, polyline, status, rideId]
  );
}

export async function updateLocalRideFields(
  rideId: string,
  fields: Partial<Pick<LocalRide, 'title' | 'bike_id' | 'pinned'>>
) {
  const db = await getDb();
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE rides_local SET ${setClause} WHERE id = ?`, [
    ...keys.map((k) => fields[k] as string | number | null),
    rideId,
  ]);
}

export async function deleteLocalRide(rideId: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ride_points_local WHERE ride_id = ?`, [rideId]);
  await db.runAsync(`DELETE FROM rides_local WHERE id = ?`, [rideId]);
}

export async function getLocalRide(rideId: string) {
  const db = await getDb();
  return db.getFirstAsync<LocalRide>(`SELECT * FROM rides_local WHERE id = ?`, [rideId]);
}

export async function getAllLocalRides() {
  const db = await getDb();
  return db.getAllAsync<LocalRide>(
    `SELECT * FROM rides_local ORDER BY pinned DESC, started_at DESC`
  );
}
