import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// One shared database for every on-device feature (bikes, maintenance, fuel,
// settings, rides). Rides' tables are defined here but the CRUD API for them
// lives in src/features/ride-tracking/rideLocalDb.ts.
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('bikeapp.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS bikes_local (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          make TEXT,
          model TEXT,
          year INTEGER,
          current_odometer_km REAL,
          vin TEXT,
          photo_filename TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS maintenance_records_local (
          id TEXT PRIMARY KEY,
          bike_id TEXT NOT NULL,
          type TEXT NOT NULL,
          performed_at TEXT NOT NULL,
          odometer_km REAL,
          cost REAL,
          notes TEXT,
          next_due_odometer_km REAL,
          next_due_date TEXT,
          receipt_filename TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS maintenance_records_local_bike_idx
          ON maintenance_records_local (bike_id);

        CREATE TABLE IF NOT EXISTS fuel_logs_local (
          id TEXT PRIMARY KEY,
          bike_id TEXT NOT NULL,
          filled_at TEXT NOT NULL,
          odometer_km REAL,
          liters REAL,
          cost REAL,
          full_tank INTEGER NOT NULL DEFAULT 1,
          distance_since_last_full_km REAL,
          notes TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS fuel_logs_local_bike_idx
          ON fuel_logs_local (bike_id);

        CREATE TABLE IF NOT EXISTS settings_local (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          display_name TEXT,
          bio TEXT,
          avatar_filename TEXT,
          units TEXT NOT NULL DEFAULT 'metric',
          updated_at TEXT NOT NULL
        );

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
          lean_max_deg REAL NOT NULL DEFAULT 0,
          lean_avg_deg REAL NOT NULL DEFAULT 0,
          route_polyline TEXT,
          status TEXT NOT NULL DEFAULT 'recording',
          synced INTEGER NOT NULL DEFAULT 0,
          stopped_seconds REAL,
          accel_0_60_seconds REAL,
          accel_0_100_seconds REAL,
          curve_count INTEGER,
          steepest_lean_left_deg REAL,
          steepest_lean_right_deg REAL,
          wheelie_count INTEGER,
          longest_wheelie_seconds REAL,
          peak_lateral_g REAL,
          fastest_curve_left_kmh REAL,
          fastest_curve_right_kmh REAL,
          longest_curve_left_m REAL,
          longest_curve_right_m REAL,
          accel_0_150_seconds REAL,
          rolling_60_130_seconds REAL,
          drag_eighth_mile_seconds REAL,
          drag_quarter_mile_seconds REAL,
          pinned INTEGER NOT NULL DEFAULT 0
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
      await db.runAsync(
        `INSERT OR IGNORE INTO settings_local (id, units, updated_at) VALUES (1, 'metric', ?)`,
        [new Date().toISOString()]
      );

      // rides_local already existed on-device before these columns were
      // added — CREATE TABLE IF NOT EXISTS above is a no-op for it, so add
      // them the lightweight way. Each ADD COLUMN is tried independently
      // and a "duplicate column" error (already applied) is swallowed.
      const newRideColumns = [
        'stopped_seconds REAL',
        'accel_0_60_seconds REAL',
        'accel_0_100_seconds REAL',
        'curve_count INTEGER',
        'steepest_lean_left_deg REAL',
        'steepest_lean_right_deg REAL',
        'wheelie_count INTEGER',
        'longest_wheelie_seconds REAL',
        'peak_lateral_g REAL',
        'fastest_curve_left_kmh REAL',
        'fastest_curve_right_kmh REAL',
        'longest_curve_left_m REAL',
        'longest_curve_right_m REAL',
        'accel_0_150_seconds REAL',
        'rolling_60_130_seconds REAL',
        'drag_eighth_mile_seconds REAL',
        'drag_quarter_mile_seconds REAL',
        'pinned INTEGER NOT NULL DEFAULT 0',
      ];
      for (const column of newRideColumns) {
        try {
          await db.execAsync(`ALTER TABLE rides_local ADD COLUMN ${column};`);
        } catch {
          // Column already exists from a previous run — fine.
        }
      }

      return db;
    });
  }
  return dbPromise;
}
