import * as SQLite from 'expo-sqlite';

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
  route_polyline: string | null;
  status: LocalRideStatus;
  synced: 0 | 1;
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

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('bikeapp_rides.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS rides_local (
          id TEXT PRIMARY KEY,
          bike_id TEXT,
          title TEXT,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          distance_meters REAL NOT NULL DEFAULT 0,
          duration_seconds REAL NOT NULL DEFAULT 0,
          avg_speed_kmh REAL NOT NULL DEFAULT 0,
          max_speed_kmh REAL NOT NULL DEFAULT 0,
          elevation_gain_m REAL NOT NULL DEFAULT 0,
          elevation_loss_m REAL NOT NULL DEFAULT 0,
          route_polyline TEXT,
          status TEXT NOT NULL DEFAULT 'recording',
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ride_points_local (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ride_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          segment INTEGER NOT NULL DEFAULT 0,
          recorded_at TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          altitude_m REAL,
          speed_mps REAL,
          accuracy_m REAL
        );
        CREATE INDEX IF NOT EXISTS ride_points_local_ride_seq_idx
          ON ride_points_local (ride_id, seq);
      `);
      return db;
    });
  }
  return dbPromise;
}

export async function createLocalRide(id: string, bikeId: string | null, startedAt: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO rides_local (id, bike_id, started_at, status, synced) VALUES (?, ?, ?, 'recording', 0)`,
    [id, bikeId, startedAt]
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
    >
  >
) {
  const db = await getDb();
  const keys = Object.keys(stats) as (keyof typeof stats)[];
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(
    `UPDATE rides_local SET ${setClause} WHERE id = ?`,
    [...keys.map((k) => stats[k] as number), rideId]
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

export async function markRideSynced(rideId: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE rides_local SET synced = 1 WHERE id = ?`, [rideId]);
}

export async function getLocalRide(rideId: string) {
  const db = await getDb();
  return db.getFirstAsync<LocalRide>(`SELECT * FROM rides_local WHERE id = ?`, [rideId]);
}

export async function getUnsyncedRides() {
  const db = await getDb();
  return db.getAllAsync<LocalRide>(
    `SELECT * FROM rides_local WHERE status = 'stopped' AND synced = 0 ORDER BY started_at DESC`
  );
}

export async function getAllLocalRides() {
  const db = await getDb();
  return db.getAllAsync<LocalRide>(`SELECT * FROM rides_local ORDER BY started_at DESC`);
}
