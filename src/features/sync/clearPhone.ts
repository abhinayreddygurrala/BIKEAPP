import { Directory, Paths } from 'expo-file-system';

import { getDb } from '@/lib/localDb';
import { clearMaintenanceNotifications } from '@/services/notificationService';

// Everything that belongs to an account. settings_local is kept (units,
// theme, text size are this phone's preferences) but its profile fields are
// cleared below.
const ACCOUNT_TABLES = [
  'ride_points_local',
  'rides_local',
  'maintenance_attachments_local',
  'maintenance_records_local',
  'expense_attachments_local',
  'expenses_local',
  'fuel_logs_local',
  'bikes_local',
];
// Cloud-save bookkeeping. Clearing it in the same transaction as the data
// means a save that runs afterwards finds nothing to send, so it can never
// mistake the cleared phone for deletions to copy to the account.
const SYNC_TABLES = ['sync_state', 'media_state', 'sync_meta'];

/**
 * Removes an account's data from this phone: records, photos, receipts and
 * maintenance reminders. Its cloud copy is untouched; signing in again
 * brings everything back. Callers must pause cloud saving first.
 */
export async function clearAccountDataFromPhone(): Promise<void> {
  const db = await getDb();
  const existing = new Set(
    (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name)
  );
  await db.withTransactionAsync(async () => {
    for (const table of [...ACCOUNT_TABLES, ...SYNC_TABLES]) {
      if (existing.has(table)) await db.runAsync(`DELETE FROM ${table}`);
    }
    await db.runAsync('UPDATE settings_local SET display_name = NULL, bio = NULL, avatar_filename = NULL');
  });

  for (const folder of ['photos', 'attachments']) {
    const dir = new Directory(Paths.document, folder);
    if (dir.exists) dir.delete();
  }
  await clearMaintenanceNotifications();
}
