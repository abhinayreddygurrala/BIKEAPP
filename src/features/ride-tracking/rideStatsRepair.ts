import type { SQLiteDatabase } from 'expo-sqlite';

import {
  lateralGForLean,
  MAX_PLAUSIBLE_LEAN_DEG,
  MAX_RUN_SECONDS,
  SHORT_RIDE_METERS,
} from '@/features/ride-tracking/rideMath';

const RUN_COLUMNS: [column: string, maxSeconds: number][] = [
  ['accel_0_60_seconds', MAX_RUN_SECONDS.accel0To60],
  ['accel_0_100_seconds', MAX_RUN_SECONDS.accel0To100],
  ['accel_0_150_seconds', MAX_RUN_SECONDS.accel0To150],
  ['rolling_60_130_seconds', MAX_RUN_SECONDS.rolling60To130],
  ['drag_eighth_mile_seconds', MAX_RUN_SECONDS.dragEighthMile],
  ['drag_quarter_mile_seconds', MAX_RUN_SECONDS.dragQuarterMile],
];

/**
 * Brings rides saved before the stats got their sanity limits in line with
 * them: clears lean, curve and wheelie stats that came from handling the
 * phone, drops acceleration times too slow to be a launch, and recomputes
 * peak lateral G from lean (it used to be raw vibration). Changes nothing
 * that's already right, so it's safe on every launch and after a restore;
 * whatever it does change backs up like any other edit.
 */
export async function repairRideStats(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE rides_local SET
         lean_max_deg = 0, lean_avg_deg = 0, curve_count = 0,
         steepest_lean_left_deg = 0, steepest_lean_right_deg = 0,
         fastest_curve_left_kmh = NULL, fastest_curve_right_kmh = NULL,
         longest_curve_left_m = NULL, longest_curve_right_m = NULL,
         wheelie_count = 0, longest_wheelie_seconds = 0, peak_lateral_g = NULL
       WHERE status = 'stopped'
         AND (distance_meters < ? OR lean_max_deg > ? OR steepest_lean_left_deg > ? OR steepest_lean_right_deg > ?)
         AND (lean_max_deg > 0 OR lean_avg_deg > 0 OR curve_count > 0 OR wheelie_count > 0
              OR longest_wheelie_seconds > 0 OR steepest_lean_left_deg > 0 OR steepest_lean_right_deg > 0
              OR peak_lateral_g IS NOT NULL)`,
      // A ride that never really left can't have leaned: that was the phone being handled.
      [SHORT_RIDE_METERS, MAX_PLAUSIBLE_LEAN_DEG, MAX_PLAUSIBLE_LEAN_DEG, MAX_PLAUSIBLE_LEAN_DEG]
    );

    for (const [column, maxSeconds] of RUN_COLUMNS) {
      await db.runAsync(`UPDATE rides_local SET ${column} = NULL WHERE ${column} > ?`, [maxSeconds]);
    }

    const rides = await db.getAllAsync<{
      id: string;
      left: number | null;
      right: number | null;
      g: number | null;
    }>(
      `SELECT id, steepest_lean_left_deg AS left, steepest_lean_right_deg AS right, peak_lateral_g AS g
       FROM rides_local WHERE status = 'stopped'`
    );
    for (const ride of rides) {
      const steepest = Math.max(ride.left ?? 0, ride.right ?? 0);
      const g = steepest > 0 ? lateralGForLean(steepest) : null;
      const unchanged = g == null ? ride.g == null : ride.g != null && Math.abs(ride.g - g) < 0.001;
      if (!unchanged) await db.runAsync('UPDATE rides_local SET peak_lateral_g = ? WHERE id = ?', [g, ride.id]);
    }
  });
}
