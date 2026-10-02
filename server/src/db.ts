import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * Opens (creating if needed) the SQLite database file. Uses Node's built-in
 * SQLite, so there's no native package to compile on the server.
 */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;     -- readers don't block the writer
    PRAGMA foreign_keys = ON;      -- enforce ON DELETE CASCADE
    PRAGMA busy_timeout = 5000;    -- wait briefly instead of failing on a lock
  `);
  return db;
}

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations');

/**
 * Applies any `migrations/*.sql` files that haven't run yet, in filename
 * order, each in its own transaction. Runs automatically when the server
 * boots, so deploying new code is the only step needed to update the schema.
 */
export function migrate(db: Db, log: (message: string) => void): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name)
  );
  const files = readdirSync(MIGRATIONS_DIR)
    // Only real migrations (001_name.sql): skips stray files like macOS's ._ metadata.
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    log(`applying migration ${file}`);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
