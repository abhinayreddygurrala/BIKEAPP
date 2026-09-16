import * as polyline from '@mapbox/polyline';

import type { LocalRidePoint } from '@/features/ride-tracking/rideLocalDb';

const EARTH_RADIUS_M = 6371000;

// GPS fixes worse than this are dropped rather than folded into distance/speed math.
const MAX_ACCURACY_M = 30;
// A rider can't plausibly cover more ground than this between two fixes.
const MAX_PLAUSIBLE_SPEED_MPS = 90; // ~324 km/h
const ELEVATION_NOISE_THRESHOLD_M = 1;

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
};

export function computeRideStats(points: LocalRidePoint[]): RideStats {
  const usable = points.filter((p) => p.accuracy_m == null || p.accuracy_m <= MAX_ACCURACY_M);

  let distanceMeters = 0;
  let maxSpeedMps = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let movingSeconds = 0;

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
};

export function computeAggregateStats(
  rides: { distance_meters: number | null; duration_seconds: number | null }[]
): AggregateStats {
  return rides.reduce(
    (acc, r) => ({
      rideCount: acc.rideCount + 1,
      totalDistanceMeters: acc.totalDistanceMeters + (r.distance_meters ?? 0),
      totalDurationSeconds: acc.totalDurationSeconds + (r.duration_seconds ?? 0),
    }),
    { rideCount: 0, totalDistanceMeters: 0, totalDurationSeconds: 0 }
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

export function formatSpeed(speedKmh: number | null, units: Units) {
  if (!speedKmh) return '0';
  return (units === 'imperial' ? speedKmh * KM_TO_MI : speedKmh).toFixed(0);
}

export function formatLeanDeg(leanDeg: number | null) {
  if (!leanDeg) return '0';
  return Math.round(Math.abs(leanDeg)).toString();
}
