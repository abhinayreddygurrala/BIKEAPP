import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { RideSummary } from '@/services/ridesService';
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
