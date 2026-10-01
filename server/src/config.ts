import path from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`);
  }
  return parsed;
}

/**
 * Where the SQLite file lives. On Railway it must sit on an attached volume:
 * everything else in the container is wiped on each deploy, which would
 * silently delete every account. So on Railway without a volume we refuse to
 * start, loudly, rather than run on a database that won't survive.
 */
function resolveDatabasePath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;

  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (volume) return path.join(volume, 'odomap.db');

  if (process.env.RAILWAY_ENVIRONMENT_NAME) {
    throw new Error(
      'No volume attached on Railway: accounts would be erased on every deploy. ' +
        'Attach a volume to this service (mount path /data) and redeploy.'
    );
  }
  return path.resolve('data', 'odomap.db');
}

export const config = {
  port: int('PORT', 3000),
  databasePath: resolveDatabasePath(),
  sessionDays: int('SESSION_DAYS', 60),
} as const;
