import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/lib/localDb';

/** The signed-in request helper from AuthContext. */
export type AuthedRequest = <T>(
  path: string,
  options?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }
) => Promise<T>;

type Row = Record<string, unknown>;
type RecordRef = { kind: string; id: string };
type Upsert = RecordRef & { data: Row; hash: string };

// Every on-phone table that backs up, one record per row (whole row, so
// columns added later back up automatically). Rides only once finished.
const TABLES: { kind: string; table: string; where?: string }[] = [
  { kind: 'bikes', table: 'bikes_local' },
  { kind: 'rides', table: 'rides_local', where: "status = 'stopped'" },
  { kind: 'maintenance_records', table: 'maintenance_records_local' },
  { kind: 'maintenance_attachments', table: 'maintenance_attachments_local' },
  { kind: 'expenses', table: 'expenses_local' },
  { kind: 'expense_attachments', table: 'expense_attachments_local' },
  { kind: 'fuel_logs', table: 'fuel_logs_local' },
];
const TABLE_FOR_KIND = Object.fromEntries(TABLES.map((t) => [t.kind, t.table]));
const SETTINGS_COLUMNS = ['display_name', 'bio', 'units', 'text_scale', 'theme_mode', 'avatar_filename'];
const POINT_COLUMNS = ['seq', 'segment', 'recorded_at', 'lat', 'lng', 'altitude_m', 'speed_mps', 'accuracy_m'];
const BATCH_SIZE = 200;

// Fingerprint of what was last backed up, per record — how a sync knows what
// changed without timestamps on every table.
async function ensureSyncTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS media_state (path TEXT PRIMARY KEY, signature TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_state (
      kind TEXT NOT NULL, record_id TEXT NOT NULL, hash TEXT NOT NULL,
      PRIMARY KEY (kind, record_id)
    );
    CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
}

function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** Everything on the phone right now, as backup records (ride points summarised, not loaded). */
async function collect(db: SQLiteDatabase) {
  const records: Upsert[] = [];
  for (const { kind, table, where } of TABLES) {
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`);
    for (const row of rows) records.push({ kind, id: String(row.id), data: row, hash: fingerprint(JSON.stringify(row)) });
  }
  const settings = await db.getFirstAsync<Row>(`SELECT ${SETTINGS_COLUMNS.join(', ')} FROM settings_local WHERE id = 1`);
  if (settings) records.push({ kind: 'settings', id: 'profile', data: settings, hash: fingerprint(JSON.stringify(settings)) });

  // A finished ride's points never change, so count + last seq is a cheap fingerprint.
  const pointSets = await db.getAllAsync<{ ride_id: string; n: number; last: number }>(
    `SELECT ride_id, count(*) AS n, max(seq) AS last FROM ride_points_local
      WHERE ride_id IN (SELECT id FROM rides_local WHERE status = 'stopped') GROUP BY ride_id`
  );
  const pointRides = pointSets.map((p) => ({ kind: 'ride_points', id: p.ride_id, hash: `${p.n}:${p.last}` }));
  return { records, pointRides };
}

async function loadState(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ kind: string; record_id: string; hash: string }>('SELECT * FROM sync_state');
  return new Map(rows.map((r) => [`${r.kind}:${r.record_id}`, r.hash]));
}

async function saveState(db: SQLiteDatabase, upserts: (RecordRef & { hash: string })[], deletes: RecordRef[]) {
  await db.withTransactionAsync(async () => {
    for (const u of upserts) {
      await db.runAsync('INSERT OR REPLACE INTO sync_state (kind, record_id, hash) VALUES (?, ?, ?)', [u.kind, u.id, u.hash]);
    }
    for (const d of deletes) {
      await db.runAsync('DELETE FROM sync_state WHERE kind = ? AND record_id = ?', [d.kind, d.id]);
    }
  });
}

/**
 * Backup history belongs to one account. Signing into a different one on this
 * phone starts it fresh, so that account gets a full copy (and nothing from
 * the other account's history is deleted from it).
 */
/** The account this phone's data was last saved to, or null if it never was. */
export async function getSyncAccount(): Promise<string | null> {
  const db = await getDb();
  await ensureSyncTables(db);
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'user_id'");
  return row?.value ?? null;
}

export async function switchSyncAccount(userId: string): Promise<void> {
  const db = await getDb();
  await ensureSyncTables(db);
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'user_id'");
  if (row?.value === userId) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sync_state');
    await db.runAsync('DELETE FROM media_state');
    await db.runAsync("DELETE FROM sync_meta WHERE key = 'last_synced_at'");
    await db.runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('user_id', ?)", [userId]);
  });
}

export async function getLastSyncedAt(): Promise<string | null> {
  const db = await getDb();
  await ensureSyncTables(db);
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'last_synced_at'");
  return row?.value ?? null;
}

/**
 * Backs up whatever changed since the last backup (new, edited and deleted
 * records), in batches. Safe to call often: with nothing changed it sends nothing.
 */
export async function pushChanges(request: AuthedRequest): Promise<{ sent: number; removed: number }> {
  const db = await getDb();
  await ensureSyncTables(db);
  const state = await loadState(db);
  const { records, pointRides } = await collect(db);

  const present = new Set([...records, ...pointRides].map((r) => `${r.kind}:${r.id}`));
  const changed = records.filter((r) => state.get(`${r.kind}:${r.id}`) !== r.hash);
  const changedPoints = pointRides.filter((r) => state.get(`${r.kind}:${r.id}`) !== r.hash);
  const deletes = [...state.keys()]
    .filter((key) => !present.has(key))
    .map((key) => {
      const split = key.indexOf(':');
      return { kind: key.slice(0, split), id: key.slice(split + 1) };
    });

  for (let i = 0; i < Math.max(changed.length, 1); i += BATCH_SIZE) {
    const batch = changed.slice(i, i + BATCH_SIZE);
    const batchDeletes = i === 0 ? deletes : [];
    if (batch.length === 0 && batchDeletes.length === 0) break;
    await request('/sync/push', {
      method: 'POST',
      body: { upserts: batch.map(({ kind, id, data }) => ({ kind, id, data })), deletes: batchDeletes },
    });
    await saveState(db, batch, batchDeletes);
  }

  // Each ride's GPS points go up as their own request (they can be a few MB).
  for (const ride of changedPoints) {
    const points = await db.getAllAsync<Row>(
      `SELECT ${POINT_COLUMNS.join(', ')} FROM ride_points_local WHERE ride_id = ? ORDER BY seq`,
      [ride.id]
    );
    await request('/sync/push', { method: 'POST', body: { upserts: [{ kind: 'ride_points', id: ride.id, data: { points } }], deletes: [] } });
    await saveState(db, [ride], []);
  }

  await db.runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_synced_at', ?)", [new Date().toISOString()]);
  return { sent: changed.length + changedPoints.length, removed: deletes.length };
}

export async function fetchBackupSummary(request: AuthedRequest) {
  return request<{ counts: Record<string, number>; lastBackupAt: string | null }>('/sync/summary');
}

export async function isPhoneEmpty(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT (SELECT count(*) FROM bikes_local) + (SELECT count(*) FROM rides_local) AS n'
  );
  return (row?.n ?? 0) === 0;
}

/**
 * Downloads the whole backup and writes it into the phone's tables (records
 * with the same id are replaced; nothing else on the phone is deleted). Then
 * records the result as already backed up so it isn't sent straight back.
 */
export async function restoreFromCloud(request: AuthedRequest): Promise<number> {
  const db = await getDb();
  await ensureSyncTables(db);
  const columnCache = new Map<string, Set<string>>();
  const columnsOf = async (table: string) => {
    if (!columnCache.has(table)) {
      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      columnCache.set(table, new Set(info.map((c) => c.name)));
    }
    return columnCache.get(table)!;
  };

  let restored = 0;
  type Cursor = { afterKind: string; afterId: string } | null;
  let cursor: Cursor = { afterKind: '', afterId: '' };
  while (cursor) {
    const query = `?afterKind=${encodeURIComponent(cursor.afterKind)}&afterId=${encodeURIComponent(cursor.afterId)}`;
    const pageResult: { records: { kind: string; id: string; data: Row }[]; next: Cursor } = await request(
      `/sync/records${query}`
    );
    await db.withTransactionAsync(async () => {
      for (const record of pageResult.records) {
        if (record.kind === 'ride_points') {
          await db.runAsync('DELETE FROM ride_points_local WHERE ride_id = ?', [record.id]);
          const points = (record.data.points as Row[]) ?? [];
          for (const p of points) {
            await db.runAsync(
              `INSERT INTO ride_points_local (ride_id, ${POINT_COLUMNS.join(', ')}) VALUES (?, ${POINT_COLUMNS.map(() => '?').join(', ')})`,
              [record.id, ...POINT_COLUMNS.map((c) => (p[c] as string | number | null | undefined) ?? null)]
            );
          }
        } else if (record.kind === 'settings') {
          const cols = SETTINGS_COLUMNS.filter((c) => c in record.data);
          if (cols.length) {
            await db.runAsync(
              `UPDATE settings_local SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`,
              cols.map((c) => (record.data[c] as string | number | null) ?? null)
            );
          }
        } else {
          const table = TABLE_FOR_KIND[record.kind];
          if (!table) continue;
          const known = await columnsOf(table);
          const cols = Object.keys(record.data).filter((c) => known.has(c));
          await db.runAsync(
            `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            cols.map((c) => (record.data[c] as string | number | null) ?? null)
          );
        }
        restored += 1;
      }
    });
    cursor = pageResult.next;
  }

  // Mark what's now on the phone as backed up.
  const { records, pointRides } = await collect(db);
  await saveState(db, [...records, ...pointRides], []);
  return restored;
}
