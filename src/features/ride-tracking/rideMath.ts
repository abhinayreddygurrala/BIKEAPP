import * as polyline from '@mapbox/polyline';

import type { LocalRidePoint } from '@/features/ride-tracking/rideLocalDb';

const EARTH_RADIUS_M = 6371000;

// GPS fixes worse than this are dropped rather than folded into distance/speed math.
const MAX_ACCURACY_M = 30;
// A rider can't plausibly cover more ground than this between two fixes.
const MAX_PLAUSIBLE_SPEED_MPS = 90; // ~324 km/h
const ELEVATION_NOISE_THRESHOLD_M = 1;

// Acceleration-run detection. GPS updates roughly every 10m of movement, not
// on a fixed clock, so timing has real wobble (±0.5-1s) compared to a
// dedicated accelerometer-based timer — good enough for a hobby stat, not a
// drag-strip result.
const STOPPED_SPEED_MPS = 0.5;
const MPS_60MPH = 26.8224;
const MPS_100MPH = 44.704;
const MPS_130MPH = 58.1152;
const MPS_150MPH = 67.056;
const EIGHTH_MILE_M = 201.168;
const QUARTER_MILE_M = 402.336;

export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RideStats = {
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  elevationLossM: number;
  stoppedSeconds: number;
  /** Best (lowest) time this ride from a complete stop to 60mph, or null if never reached from a stop. */
  accel0To60Seconds: number | null;
  accel0To100Seconds: number | null;
  accel0To150Seconds: number | null;
  /** Best 60→130mph window that never dropped below 60 in between — doesn't require a stop. */
  rolling60To130Seconds: number | null;
  /** Best time from a complete stop to cover an eighth mile / quarter mile of distance. */
  dragEighthMileSeconds: number | null;
  dragQuarterMileSeconds: number | null;
};

export function computeRideStats(points: LocalRidePoint[]): RideStats {
  const usable = points.filter((p) => p.accuracy_m == null || p.accuracy_m <= MAX_ACCURACY_M);

  let distanceMeters = 0;
  let maxSpeedMps = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let movingSeconds = 0;
  let stoppedSeconds = 0;
  let lastStoppedAtMs: number | null = null;
  let crossed60ThisRun = false;
  let crossed100ThisRun = false;
  let crossed150ThisRun = false;
  let accel0To60Seconds: number | null = null;
  let accel0To100Seconds: number | null = null;
  let accel0To150Seconds: number | null = null;

  // Drag distance is measured from the same "last stop" reference as the
  // speed-threshold runs above, just accumulated as distance instead.
  let distanceSinceStopM = 0;
  let crossedEighthThisRun = false;
  let crossedQuarterThisRun = false;
  let dragEighthMileSeconds: number | null = null;
  let dragQuarterMileSeconds: number | null = null;

  // Rolling 60-130: doesn't need a stop, just a continuous window where
  // speed never drops back below 60 between the two crossings.
  let rollingStartMs: number | null = null;
  let rolling60To130Seconds: number | null = null;

  for (let i = 1; i < usable.length; i++) {
    const prev = usable[i - 1];
    const curr = usable[i];
    // Pause/resume starts a new segment specifically so the gap it leaves
    // behind here is never folded into distance or moving time.
    if (curr.segment !== prev.segment) continue;
    const dt = (new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000;
    if (dt <= 0) continue;

    const segmentDistance = haversineDistanceMeters(prev, curr);
    const impliedSpeed = segmentDistance / dt;
    if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS) continue; // GPS jump, discard

    distanceMeters += segmentDistance;
    movingSeconds += dt;

    // Prefer the device-reported speed (already filtered by the GPS chipset)
    // over the derived speed when available.
    const speedMps = curr.speed_mps ?? impliedSpeed;
    if (speedMps > maxSpeedMps) maxSpeedMps = speedMps;

    // "From a complete stop" only — matches how dedicated acceleration
    // timers work, and avoids counting a rolling-start as a 0-60.
    const currMs = new Date(curr.recorded_at).getTime();
    const prevSpeedMps = prev.speed_mps ?? 0;
    if (speedMps < STOPPED_SPEED_MPS) {
      stoppedSeconds += dt;
      lastStoppedAtMs = currMs;
      crossed60ThisRun = false;
      crossed100ThisRun = false;
      crossed150ThisRun = false;
      distanceSinceStopM = 0;
      crossedEighthThisRun = false;
      crossedQuarterThisRun = false;
    } else if (lastStoppedAtMs != null) {
      distanceSinceStopM += segmentDistance;

      if (!crossed60ThisRun && speedMps >= MPS_60MPH) {
        const elapsed = (currMs - lastStoppedAtMs) / 1000;
        if (accel0To60Seconds == null || elapsed < accel0To60Seconds) accel0To60Seconds = elapsed;
        crossed60ThisRun = true;
      }
      if (!crossed100ThisRun && speedMps >= MPS_100MPH) {
        const elapsed = (currMs - lastStoppedAtMs) / 1000;
        if (accel0To100Seconds == null || elapsed < accel0To100Seconds) accel0To100Seconds = elapsed;
        crossed100ThisRun = true;
      }
      if (!crossed150ThisRun && speedMps >= MPS_150MPH) {
        const elapsed = (currMs - lastStoppedAtMs) / 1000;
        if (accel0To150Seconds == null || elapsed < accel0To150Seconds) accel0To150Seconds = elapsed;
        crossed150ThisRun = true;
      }
      if (!crossedEighthThisRun && distanceSinceStopM >= EIGHTH_MILE_M) {
        const elapsed = (currMs - lastStoppedAtMs) / 1000;
        if (dragEighthMileSeconds == null || elapsed < dragEighthMileSeconds) dragEighthMileSeconds = elapsed;
        crossedEighthThisRun = true;
      }
      if (!crossedQuarterThisRun && distanceSinceStopM >= QUARTER_MILE_M) {
        const elapsed = (currMs - lastStoppedAtMs) / 1000;
        if (dragQuarterMileSeconds == null || elapsed < dragQuarterMileSeconds) dragQuarterMileSeconds = elapsed;
        crossedQuarterThisRun = true;
      }
    }

    // Rolling 60-130 — independent of the stop-based runs above. A dip below
    // 60mph breaks the window; it doesn't need to ever have stopped at all.
    if (prevSpeedMps < MPS_60MPH && speedMps >= MPS_60MPH) {
      rollingStartMs = currMs;
    } else if (speedMps < MPS_60MPH) {
      rollingStartMs = null;
    } else if (rollingStartMs != null && speedMps >= MPS_130MPH) {
      const elapsed = (currMs - rollingStartMs) / 1000;
      if (rolling60To130Seconds == null || elapsed < rolling60To130Seconds) rolling60To130Seconds = elapsed;
      rollingStartMs = null;
    }

    if (prev.altitude_m != null && curr.altitude_m != null) {
      const delta = curr.altitude_m - prev.altitude_m;
      if (Math.abs(delta) >= ELEVATION_NOISE_THRESHOLD_M) {
        if (delta > 0) elevationGainM += delta;
        else elevationLossM += -delta;
      }
    }
  }

  const avgSpeedMps = movingSeconds > 0 ? distanceMeters / movingSeconds : 0;

  return {
    distanceMeters,
    durationSeconds: movingSeconds,
    avgSpeedKmh: avgSpeedMps * 3.6,
    maxSpeedKmh: maxSpeedMps * 3.6,
    elevationGainM,
    elevationLossM,
    stoppedSeconds,
    accel0To60Seconds,
    accel0To100Seconds,
    accel0To150Seconds,
    rolling60To130Seconds,
    dragEighthMileSeconds,
    dragQuarterMileSeconds,
  };
}

export type CurveDirection = 'left' | 'right';

export type CurveEvent = {
  startMs: number;
  endMs: number;
  peakDeg: number;
  direction: CurveDirection;
};

export type CurveRecords = {
  curveCount: number;
  steepestLeftDeg: number;
  steepestRightDeg: number;
  fastestLeftKmh: number | null;
  fastestRightKmh: number | null;
  longestLeftM: number | null;
  longestRightM: number | null;
};

/**
 * Cross-references curve events (from the motion sensor, timestamped) against
 * GPS points to find, per curve, how fast you were going and how much ground
 * you covered while leaned into it — not just how far over you leaned.
 */
export function computeCurveRecords(events: CurveEvent[], points: LocalRidePoint[]): CurveRecords {
  let steepestLeftDeg = 0;
  let steepestRightDeg = 0;
  let fastestLeftKmh: number | null = null;
  let fastestRightKmh: number | null = null;
  let longestLeftM: number | null = null;
  let longestRightM: number | null = null;

  for (const event of events) {
    if (event.direction === 'left') steepestLeftDeg = Math.max(steepestLeftDeg, event.peakDeg);
    else steepestRightDeg = Math.max(steepestRightDeg, event.peakDeg);

    const windowPoints = points.filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return t >= event.startMs && t <= event.endMs;
    });
    if (windowPoints.length === 0) continue;

    let maxSpeedMps = 0;
    let distanceM = 0;
    for (let i = 0; i < windowPoints.length; i++) {
      const speed = windowPoints[i].speed_mps;
      if (speed != null && speed > maxSpeedMps) maxSpeedMps = speed;
      if (i > 0) distanceM += haversineDistanceMeters(windowPoints[i - 1], windowPoints[i]);
    }
    const speedKmh = maxSpeedMps * 3.6;

    if (event.direction === 'left') {
      if (fastestLeftKmh == null || speedKmh > fastestLeftKmh) fastestLeftKmh = speedKmh;
      if (longestLeftM == null || distanceM > longestLeftM) longestLeftM = distanceM;
    } else {
      if (fastestRightKmh == null || speedKmh > fastestRightKmh) fastestRightKmh = speedKmh;
      if (longestRightM == null || distanceM > longestRightM) longestRightM = distanceM;
    }
  }

  return {
    curveCount: events.length,
    steepestLeftDeg,
    steepestRightDeg,
    fastestLeftKmh,
    fastestRightKmh,
    longestLeftM,
    longestRightM,
  };
}

export function encodeRoutePolyline(points: { lat: number; lng: number }[]) {
  return polyline.encode(points.map((p) => [p.lat, p.lng]));
}

export function decodeRoutePolyline(encoded: string): { latitude: number; longitude: number }[] {
  return polyline.decode(encoded).map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
}

export type Units = 'metric' | 'imperial';

const KM_TO_MI = 0.621371;

export function distanceUnitLabel(units: Units) {
  return units === 'imperial' ? 'mi' : 'km';
}

export function speedUnitLabel(units: Units) {
  return units === 'imperial' ? 'mph' : 'km/h';
}

/** Inverse of formatDistance: a value entered in the display unit, back to meters for storage. */
export function distanceToMeters(value: number, units: Units) {
  const km = units === 'imperial' ? value / KM_TO_MI : value;
  return km * 1000;
}

export type AggregateStats = {
  rideCount: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  longestRideMeters: number;
  avgTripLengthMeters: number;
};

export function computeAggregateStats(
  rides: { distance_meters: number | null; duration_seconds: number | null }[]
): AggregateStats {
  const totals = rides.reduce(
    (acc, r) => ({
      rideCount: acc.rideCount + 1,
      totalDistanceMeters: acc.totalDistanceMeters + (r.distance_meters ?? 0),
      totalDurationSeconds: acc.totalDurationSeconds + (r.duration_seconds ?? 0),
      longestRideMeters: Math.max(acc.longestRideMeters, r.distance_meters ?? 0),
    }),
    { rideCount: 0, totalDistanceMeters: 0, totalDurationSeconds: 0, longestRideMeters: 0 }
  );
  return {
    ...totals,
    avgTripLengthMeters: totals.rideCount > 0 ? totals.totalDistanceMeters / totals.rideCount : 0,
  };
}

/** All-time bests across every ride — the CurveRank-style "records" view. */
export type AllTimeRecords = {
  fastestLeftKmh: number | null;
  fastestRightKmh: number | null;
  steepestLeftDeg: number | null;
  steepestRightDeg: number | null;
  longestLeftM: number | null;
  longestRightM: number | null;
  totalCurves: number;
  peakLateralG: number | null;
  totalWheelies: number;
  longestWheelieSeconds: number | null;
  best0To60Seconds: number | null;
  best0To100Seconds: number | null;
  best0To150Seconds: number | null;
  bestRolling60To130Seconds: number | null;
  bestDragEighthMileSeconds: number | null;
  bestDragQuarterMileSeconds: number | null;
};

type RecordSourceRide = {
  fastest_curve_left_kmh: number | null;
  fastest_curve_right_kmh: number | null;
  steepest_lean_left_deg: number | null;
  steepest_lean_right_deg: number | null;
  longest_curve_left_m: number | null;
  longest_curve_right_m: number | null;
  curve_count: number | null;
  peak_lateral_g: number | null;
  wheelie_count: number | null;
  longest_wheelie_seconds: number | null;
  accel_0_60_seconds: number | null;
  accel_0_100_seconds: number | null;
  accel_0_150_seconds: number | null;
  rolling_60_130_seconds: number | null;
  drag_eighth_mile_seconds: number | null;
  drag_quarter_mile_seconds: number | null;
};

function maxOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function minOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

export function computeAllTimeRecords(rides: RecordSourceRide[]): AllTimeRecords {
  return rides.reduce<AllTimeRecords>(
    (acc, r) => ({
      fastestLeftKmh: maxOf(acc.fastestLeftKmh, r.fastest_curve_left_kmh),
      fastestRightKmh: maxOf(acc.fastestRightKmh, r.fastest_curve_right_kmh),
      steepestLeftDeg: maxOf(acc.steepestLeftDeg, r.steepest_lean_left_deg),
      steepestRightDeg: maxOf(acc.steepestRightDeg, r.steepest_lean_right_deg),
      longestLeftM: maxOf(acc.longestLeftM, r.longest_curve_left_m),
      longestRightM: maxOf(acc.longestRightM, r.longest_curve_right_m),
      totalCurves: acc.totalCurves + (r.curve_count ?? 0),
      peakLateralG: maxOf(acc.peakLateralG, r.peak_lateral_g),
      totalWheelies: acc.totalWheelies + (r.wheelie_count ?? 0),
      longestWheelieSeconds: maxOf(acc.longestWheelieSeconds, r.longest_wheelie_seconds),
      best0To60Seconds: minOf(acc.best0To60Seconds, r.accel_0_60_seconds),
      best0To100Seconds: minOf(acc.best0To100Seconds, r.accel_0_100_seconds),
      best0To150Seconds: minOf(acc.best0To150Seconds, r.accel_0_150_seconds),
      bestRolling60To130Seconds: minOf(acc.bestRolling60To130Seconds, r.rolling_60_130_seconds),
      bestDragEighthMileSeconds: minOf(acc.bestDragEighthMileSeconds, r.drag_eighth_mile_seconds),
      bestDragQuarterMileSeconds: minOf(acc.bestDragQuarterMileSeconds, r.drag_quarter_mile_seconds),
    }),
    {
      fastestLeftKmh: null,
      fastestRightKmh: null,
      steepestLeftDeg: null,
      steepestRightDeg: null,
      longestLeftM: null,
      longestRightM: null,
      totalCurves: 0,
      peakLateralG: null,
      totalWheelies: 0,
      longestWheelieSeconds: null,
      best0To60Seconds: null,
      best0To100Seconds: null,
      best0To150Seconds: null,
      bestRolling60To130Seconds: null,
      bestDragEighthMileSeconds: null,
      bestDragQuarterMileSeconds: null,
    }
  );
}

export function formatDistance(distanceMeters: number | null, units: Units) {
  if (!distanceMeters) return '0.0';
  const km = distanceMeters / 1000;
  return (units === 'imperial' ? km * KM_TO_MI : km).toFixed(1);
}

export function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds) return '0:00';
  const totalSeconds = Math.floor(durationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** For totals summed across many rides — "2h 15m" / "30m 12s", since a clock-style "30:12" doesn't say whether that's hours or minutes. */
export function formatTotalDuration(durationSeconds: number | null) {
  const totalSeconds = Math.floor(durationSeconds ?? 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatSpeed(speedKmh: number | null, units: Units) {
  if (!speedKmh) return '0';
  return (units === 'imperial' ? speedKmh * KM_TO_MI : speedKmh).toFixed(0);
}

export function formatLeanDeg(leanDeg: number | null) {
  if (!leanDeg) return '0';
  return Math.round(Math.abs(leanDeg)).toString();
}

/** For acceleration-run times and similar short durations. "--" when never recorded. */
export function formatSeconds(seconds: number | null) {
  if (seconds == null) return '--';
  return seconds.toFixed(1);
}

export function formatG(g: number | null) {
  if (g == null) return '0.00';
  return g.toFixed(2);
}
