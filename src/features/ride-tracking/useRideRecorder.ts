import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { setActiveRideId, setActiveSegment } from '@/features/ride-tracking/activeRideStore';
import {
  createLocalRide,
  finalizeLocalRide,
  getRidePoints,
  updateLocalRideStats,
  type LocalRidePoint,
} from '@/features/ride-tracking/rideLocalDb';
import {
  computeCurveRecords,
  computeRideStats,
  encodeRoutePolyline,
  type RideStats,
} from '@/features/ride-tracking/rideMath';
import { RIDE_TRACKING_TASK } from '@/features/ride-tracking/rideTrackingTask';
import { useLeanAngleTracker } from '@/features/ride-tracking/useLeanAngleTracker';
import { uuidv4 } from '@/lib/uuid';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped';

const POLL_INTERVAL_MS = 2500;

const EMPTY_STATS: RideStats = {
  distanceMeters: 0,
  durationSeconds: 0,
  avgSpeedKmh: 0,
  maxSpeedKmh: 0,
  elevationGainM: 0,
  elevationLossM: 0,
  stoppedSeconds: 0,
  accel0To60Seconds: null,
  accel0To100Seconds: null,
  accel0To150Seconds: null,
  rolling60To130Seconds: null,
  dragEighthMileSeconds: null,
  dragQuarterMileSeconds: null,
};

const locationTaskOptions: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  activityType: Location.ActivityType.AutomotiveNavigation,
  distanceInterval: 10,
  // Otherwise iOS silently throttles updates when it thinks the device has
  // stopped (e.g. at a red light), which would corrupt a ride's data.
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
};

export async function requestRideTrackingPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { foreground: false, background: false };
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: background.status === 'granted' };
}

export function useRideRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [rideId, setRideId] = useState<string | null>(null);
  const [points, setPoints] = useState<LocalRidePoint[]>([]);
  const [stats, setStats] = useState<RideStats>(EMPTY_STATS);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentRef = useRef(0);
  const lean = useLeanAngleTracker(status === 'recording');

  const refreshFromDb = useCallback(async (id: string) => {
    const dbPoints = await getRidePoints(id);
    setPoints(dbPoints);
    setStats(computeRideStats(dbPoints));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        refreshFromDb(id).catch((e) => console.error('[useRideRecorder] poll failed', e));
      }, POLL_INTERVAL_MS);
    },
    [refreshFromDb, stopPolling]
  );

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (bikeId: string | null) => {
      const id = uuidv4();
      const startedAt = new Date().toISOString();
      segmentRef.current = 0;
      lean.reset();

      await createLocalRide(id, bikeId, startedAt);
      await setActiveRideId(id);
      await setActiveSegment(0);
      await Location.startLocationUpdatesAsync(RIDE_TRACKING_TASK, locationTaskOptions);

      setRideId(id);
      setPoints([]);
      setStats(EMPTY_STATS);
      setStatus('recording');
      startPolling(id);
    },
    [startPolling, lean]
  );

  const pause = useCallback(async () => {
    if (!rideId) return;
    stopPolling();
    if (await Location.hasStartedLocationUpdatesAsync(RIDE_TRACKING_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDE_TRACKING_TASK);
    }
    await refreshFromDb(rideId);
    setStatus('paused');
  }, [rideId, stopPolling, refreshFromDb]);

  const resume = useCallback(async () => {
    if (!rideId) return;
    segmentRef.current += 1;
    await setActiveSegment(segmentRef.current);
    await Location.startLocationUpdatesAsync(RIDE_TRACKING_TASK, locationTaskOptions);
    setStatus('recording');
    startPolling(rideId);
  }, [rideId, startPolling]);

  const stop = useCallback(async () => {
    if (!rideId) return null;
    stopPolling();
    if (await Location.hasStartedLocationUpdatesAsync(RIDE_TRACKING_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDE_TRACKING_TASK);
    }

    const finalPoints = await getRidePoints(rideId);
    const finalStats = computeRideStats(finalPoints);
    const routePolyline = encodeRoutePolyline(finalPoints);
    // Cross-reference the sensor-detected curve events against GPS to get
    // fastest-speed and longest-distance per curve, not just steepest angle.
    const curveRecords = computeCurveRecords(lean.getCurveEvents(), finalPoints);
    const finalLean = lean.getFinalStats();

    await updateLocalRideStats(rideId, {
      distance_meters: finalStats.distanceMeters,
      duration_seconds: finalStats.durationSeconds,
      avg_speed_kmh: finalStats.avgSpeedKmh,
      max_speed_kmh: finalStats.maxSpeedKmh,
      elevation_gain_m: finalStats.elevationGainM,
      elevation_loss_m: finalStats.elevationLossM,
      lean_max_deg: finalLean.maxDeg,
      lean_avg_deg: finalLean.avgDeg,
      stopped_seconds: finalStats.stoppedSeconds,
      accel_0_60_seconds: finalStats.accel0To60Seconds,
      accel_0_100_seconds: finalStats.accel0To100Seconds,
      accel_0_150_seconds: finalStats.accel0To150Seconds,
      rolling_60_130_seconds: finalStats.rolling60To130Seconds,
      drag_eighth_mile_seconds: finalStats.dragEighthMileSeconds,
      drag_quarter_mile_seconds: finalStats.dragQuarterMileSeconds,
      curve_count: curveRecords.curveCount,
      steepest_lean_left_deg: curveRecords.steepestLeftDeg,
      steepest_lean_right_deg: curveRecords.steepestRightDeg,
      fastest_curve_left_kmh: curveRecords.fastestLeftKmh,
      fastest_curve_right_kmh: curveRecords.fastestRightKmh,
      longest_curve_left_m: curveRecords.longestLeftM,
      longest_curve_right_m: curveRecords.longestRightM,
      wheelie_count: finalLean.wheelieCount,
      longest_wheelie_seconds: finalLean.longestWheelieSeconds,
      peak_lateral_g: finalLean.peakG,
    });
    await finalizeLocalRide(rideId, new Date().toISOString(), routePolyline, 'stopped');
    await setActiveRideId(null);

    setPoints(finalPoints);
    setStats(finalStats);
    setStatus('stopped');

    return rideId;
  }, [rideId, stopPolling, lean.getCurveEvents, lean.getFinalStats]);

  const coordinates = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [points]
  );

  return {
    status,
    rideId,
    points,
    coordinates,
    stats,
    lean: {
      leanDegShared: lean.leanDegShared,
      currentDegRounded: lean.currentDegRounded,
      steepestLeanLeftDeg: lean.steepestLeanLeftDeg,
      steepestLeanRightDeg: lean.steepestLeanRightDeg,
    },
    start,
    pause,
    resume,
    stop,
  };
}
