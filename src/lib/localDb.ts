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

        CREATE TABLE IF NOT EXISTS maintenance_attachments_local (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          kind TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS maintenance_attachments_local_record_idx
          ON maintenance_attachments_local (record_id);

        CREATE TABLE IF NOT EXISTS expenses_local (
          id TEXT PRIMARY KEY,
          bike_id TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          amount REAL NOT NULL,
          incurred_at TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS expenses_local_bike_idx
          ON expenses_local (bike_id);

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

const RIDE_COLUMNS = [
  'id', 'bike_id', 'title', 'started_at', 'ended_at', 'distance_meters', 'duration_seconds',
  'avg_speed_kmh', 'max_speed_kmh', 'elevation_gain_m', 'elevation_loss_m', 'lean_max_deg',
  'lean_avg_deg', 'route_polyline', 'status', 'synced', 'stopped_seconds', 'accel_0_60_seconds',
  'accel_0_100_seconds', 'curve_count', 'steepest_lean_left_deg', 'steepest_lean_right_deg',
  'wheelie_count', 'longest_wheelie_seconds', 'peak_lateral_g', 'fastest_curve_left_kmh',
  'fastest_curve_right_kmh', 'longest_curve_left_m', 'longest_curve_right_m',
  'accel_0_150_seconds', 'rolling_60_130_seconds', 'drag_eighth_mile_seconds',
  'drag_quarter_mile_seconds', 'pinned',
] as const;

export type RestoreBundle = {
  settings: { displayName: string | null; bio: string | null; units: string };
  bikes: Record<string, unknown>[];
  rides: Record<string, unknown>[];
  maintenanceRecords: Record<string, unknown>[];
  fuelLogs: Record<string, unknown>[];
  // Optional — absent in backups made before expenses existed.
  expenses?: Record<string, unknown>[];
};

/**
 * Wipes every local table and reloads it from a previously exported backup,
 * inside one exclusive transaction — if anything throws partway through,
 * expo-sqlite rolls the whole thing back, so the phone's original data is
 * never left half-replaced. Photo/receipt filenames are dropped rather than
 * restored, since the export never bundles the actual photo files.
 */
export async function restoreLocalDatabase(data: RestoreBundle): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM ride_points_local;
      DELETE FROM rides_local;
      DELETE FROM maintenance_attachments_local;
      DELETE FROM maintenance_records_local;
      DELETE FROM expenses_local;
      DELETE FROM fuel_logs_local;
      DELETE FROM bikes_local;
    `);

    await txn.runAsync(`UPDATE settings_local SET display_name = ?, bio = ?, units = ?, updated_at = ? WHERE id = 1`, [
      data.settings.displayName,
      data.settings.bio,
      data.settings.units,
      now,
    ]);

    for (const bike of data.bikes) {
      await txn.runAsync(
        `INSERT INTO bikes_local (id, name, make, model, year, current_odometer_km, vin, photo_filename, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          bike.id as string,
          bike.name as string,
          (bike.make as string | null) ?? null,
          (bike.model as string | null) ?? null,
          (bike.year as number | null) ?? null,
          (bike.current_odometer_km as number | null) ?? null,
          (bike.vin as string | null) ?? null,
          (bike.created_at as string) ?? now,
          (bike.updated_at as string) ?? now,
        ]
      );
    }

    for (const ride of data.rides) {
      await txn.runAsync(
        `INSERT INTO rides_local (${RIDE_COLUMNS.join(', ')}) VALUES (${RIDE_COLUMNS.map(() => '?').join(', ')})`,
        RIDE_COLUMNS.map((column) => (ride[column] as string | number | null | undefined) ?? null)
      );
    }

    for (const record of data.maintenanceRecords) {
      await txn.runAsync(
        `INSERT INTO maintenance_records_local (id, bike_id, type, performed_at, odometer_km, cost, notes, next_due_odometer_km, next_due_date, receipt_filename, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          record.id as string,
          record.bike_id as string,
          record.type as string,
          record.performed_at as string,
          (record.odometer_km as number | null) ?? null,
          (record.cost as number | null) ?? null,
          (record.notes as string | null) ?? null,
          (record.next_due_odometer_km as number | null) ?? null,
          (record.next_due_date as string | null) ?? null,
          (record.created_at as string) ?? now,
        ]
      );
    }

    for (const log of data.fuelLogs) {
      await txn.runAsync(
        `INSERT INTO fuel_logs_local (id, bike_id, filled_at, odometer_km, liters, cost, full_tank, distance_since_last_full_km, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id as string,
          log.bike_id as string,
          log.filled_at as string,
          (log.odometer_km as number | null) ?? null,
          (log.liters as number | null) ?? null,
          (log.cost as number | null) ?? null,
          log.full_tank ? 1 : 0,
          (log.distance_since_last_full_km as number | null) ?? null,
          (log.notes as string | null) ?? null,
          (log.created_at as string) ?? now,
        ]
      );
    }

    for (const expense of data.expenses ?? []) {
      await txn.runAsync(
        `INSERT INTO expenses_local (id, bike_id, category, description, amount, incurred_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expense.id as string,
          expense.bike_id as string,
          expense.category as string,
          (expense.description as string | null) ?? null,
          (expense.amount as number) ?? 0,
          expense.incurred_at as string,
          (expense.notes as string | null) ?? null,
          (expense.created_at as string) ?? now,
        ]
      );
    }
  });
}
