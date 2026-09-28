import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { listBikes } from '@/services/bikesService';
import { listFuelLogs } from '@/services/fuelService';
import { listMaintenanceRecords } from '@/services/maintenanceService';
import { listRides, type RideSummary } from '@/services/ridesService';
import { getLocalSettings } from '@/features/settings/settingsLocalDb';
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatG,
  formatLeanDeg,
  formatSeconds,
  formatSpeed,
  speedUnitLabel,
  type Units,
} from '@/features/ride-tracking/rideMath';

/**
 * Bundles every piece of local data into one JSON file and opens the native
 * Share Sheet so it can be sent to Drive, Gmail, Files, etc. v1 deliberately
 * excludes photos and raw GPS points — each ride's route_polyline keeps the
 * route shape without the size of every recorded point.
 */
export async function exportAllData(): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device.');

  const [settings, bikes, rides] = await Promise.all([getLocalSettings(), listBikes(), listRides()]);

  const [maintenanceRecords, fuelLogs] = await Promise.all([
    Promise.all(bikes.map((bike) => listMaintenanceRecords(bike.id))).then((lists) => lists.flat()),
    Promise.all(bikes.map((bike) => listFuelLogs(bike.id))).then((lists) => lists.flat()),
  ]);

  const bundle = {
    exportedAt: new Date().toISOString(),
    settings: { displayName: settings.display_name, bio: settings.bio, units: settings.units },
    bikes,
    rides,
    maintenanceRecords,
    fuelLogs,
  };

  const file = new File(Paths.cache, `bikeapp-export-${Date.now()}.json`);
  file.write(JSON.stringify(bundle, null, 2));

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export BikeApp Data',
  });
}

/** Shares a readable text summary of one ride via the native Share Sheet. */
export async function shareRide(ride: RideSummary, units: Units): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device.');

  const title = ride.title ?? new Date(ride.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride';
  const dUnit = distanceUnitLabel(units);
  const sUnit = speedUnitLabel(units);

  const lines = [
    `🏍️ ${title}`,
    new Date(ride.started_at).toLocaleString(),
    '',
    `Distance: ${formatDistance(ride.distance_meters, units)} ${dUnit}`,
    `Duration: ${formatDuration(ride.duration_seconds)}`,
    `Avg Speed: ${formatSpeed(ride.avg_speed_kmh, units)} ${sUnit}`,
    `Max Speed: ${formatSpeed(ride.max_speed_kmh, units)} ${sUnit}`,
    `Max Lean: ${formatLeanDeg(ride.lean_max_deg)}°`,
    `Peak Lateral G: ${formatG(ride.peak_lateral_g)}g`,
    `Curves: ${ride.curve_count ?? 0}`,
    `0-60 mph: ${formatSeconds(ride.accel_0_60_seconds)}s`,
    `0-100 mph: ${formatSeconds(ride.accel_0_100_seconds)}s`,
    `Wheelies: ${ride.wheelie_count ?? 0} (longest ${formatSeconds(ride.longest_wheelie_seconds)}s)`,
  ];

  const file = new File(Paths.cache, `ride-${ride.id}.txt`);
  file.write(lines.join('\n'));

  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: title });
}
