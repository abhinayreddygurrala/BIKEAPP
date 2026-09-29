import { File } from 'expo-file-system';

import { restoreLocalDatabase, type RestoreBundle } from '@/lib/localDb';

export type BackupPreview = {
  bikes: number;
  rides: number;
  maintenanceRecords: number;
  fuelLogs: number;
  expenses: number;
};

export type PickedBackup = { bundle: RestoreBundle; preview: BackupPreview };

function isValidBundle(value: unknown): value is RestoreBundle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.settings === 'object' &&
    v.settings !== null &&
    Array.isArray(v.bikes) &&
    Array.isArray(v.rides) &&
    Array.isArray(v.maintenanceRecords) &&
    Array.isArray(v.fuelLogs)
  );
}

/**
 * Opens the system file picker for a previously exported Odomap backup and
 * validates its shape. Returns null if the user cancels, and throws a
 * friendly error if the picked file isn't a recognizable backup.
 */
export async function pickBackupFile(): Promise<PickedBackup | null> {
  const picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
  if (picked.canceled) return null;

  let parsed: unknown;
  try {
    parsed = await picked.result.json();
  } catch {
    throw new Error('That file doesn’t look like a valid Odomap backup.');
  }

  if (!isValidBundle(parsed)) {
    throw new Error('That file doesn’t look like a valid Odomap backup.');
  }

  return {
    bundle: parsed,
    preview: {
      bikes: parsed.bikes.length,
      rides: parsed.rides.length,
      maintenanceRecords: parsed.maintenanceRecords.length,
      fuelLogs: parsed.fuelLogs.length,
      expenses: parsed.expenses?.length ?? 0,
    },
  };
}

/** Replaces every local table's contents with the given backup. Cannot be undone. */
export async function importBackup(bundle: RestoreBundle): Promise<void> {
  await restoreLocalDatabase(bundle);
}
