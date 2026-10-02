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
  // Photo backup caps, kept well inside Cloud Storage's free 5 GB.
  mediaUserQuotaBytes: int('MEDIA_USER_QUOTA_MB', 1024) * 1024 * 1024,
  mediaTotalQuotaBytes: int('MEDIA_TOTAL_QUOTA_MB', 4096) * 1024 * 1024,
  // Google Maps calls per month, a little under each free allowance (10,000
  // for Compute Routes, Autocomplete Requests and Place Details Essentials).
  // Past these the app uses Apple's maps, so Google never bills.
  mapsCaps: {
    routes: int('MAPS_ROUTES_MONTHLY_CAP', 9000),
    autocomplete: int('MAPS_AUTOCOMPLETE_MONTHLY_CAP', 9000),
    placeDetails: int('MAPS_PLACE_DETAILS_MONTHLY_CAP', 9000),
  },
} as const;
