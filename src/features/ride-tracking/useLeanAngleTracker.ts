import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeviceMotionMeasurement } from 'expo-sensors/build/DeviceMotion';

// Loaded via require() inside try/catch, not a static import: expo-router
// evaluates every screen's module while building the route tree at startup,
// even ones the user hasn't opened yet, so a throw here (this native module
// has been observed failing to register on app launch, independent of any
// code change here — looks like a startup race in ExpoModulesCore) would
// crash navigation app-wide, not just this feature. A dynamic require lets
// it fail closed: lean tracking silently no-ops instead.
// Deep import path (not `from 'expo-sensors'`) so this doesn't also pull in
// Pedometer and the rest of the sensor barrel, which this feature never uses.
let DeviceMotion: typeof import('expo-sensors/build/DeviceMotion').default | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DeviceMotion = require('expo-sensors/build/DeviceMotion').default;
} catch (e) {
  console.error('[useLeanAngleTracker] DeviceMotion native module unavailable', e);
}

// CMAttitude.roll (iOS) / the equivalent fused-sensor roll on Android, passed
// through by expo-sensors as `rotation.gamma` in radians. This is the phone's
// rotation around its own top-to-bottom axis, which tracks bike lean 1:1 only
// if the phone is mounted with that axis pointing toward the front of the
// bike — true for a standard flat/tilted handlebar mount, the common case.
const RAD_TO_DEG = 180 / Math.PI;
const UPDATE_INTERVAL_MS = 150;
// A mount is rarely perfectly level, so the first few samples (assumed to be
// captured while the bike is stationary and upright) are averaged into a
// zero-offset rather than trusting raw gamma as "0 = upright".
const CALIBRATION_SAMPLES = 5;

export type LeanStats = {
  currentDeg: number;
  maxDeg: number;
  avgDeg: number;
};

const EMPTY_LEAN_STATS: LeanStats = { currentDeg: 0, maxDeg: 0, avgDeg: 0 };

/** Live lean-angle tracking from the device's motion sensors, active only while `active` is true. */
export function useLeanAngleTracker(active: boolean) {
  const [stats, setStats] = useState<LeanStats>(EMPTY_LEAN_STATS);
  const offsetDegRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);
  const maxAbsRef = useRef(0);
  const absSumRef = useRef(0);
  const sampleCountRef = useRef(0);

  useEffect(() => {
    if (!active || !DeviceMotion) return;

    const subscription = DeviceMotion.addListener((measurement: DeviceMotionMeasurement) => {
      const rotation = measurement.rotation;
      if (!rotation) return;
      const gammaDeg = rotation.gamma * RAD_TO_DEG;

      if (offsetDegRef.current == null) {
        calibrationSamplesRef.current.push(gammaDeg);
        if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLES) {
          const sum = calibrationSamplesRef.current.reduce((a, b) => a + b, 0);
          offsetDegRef.current = sum / calibrationSamplesRef.current.length;
        }
        return;
      }

      const leanDeg = gammaDeg - offsetDegRef.current;
      const absLean = Math.abs(leanDeg);
      maxAbsRef.current = Math.max(maxAbsRef.current, absLean);
      absSumRef.current += absLean;
      sampleCountRef.current += 1;

      setStats({
        currentDeg: leanDeg,
        maxDeg: maxAbsRef.current,
        avgDeg: absSumRef.current / sampleCountRef.current,
      });
    });

    DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);

    return () => {
      subscription.remove();
      // Re-calibrate next time tracking (re)starts, e.g. after a pause where
      // the mount could have been bumped.
      offsetDegRef.current = null;
      calibrationSamplesRef.current = [];
    };
  }, [active]);

  const reset = useCallback(() => {
    offsetDegRef.current = null;
    calibrationSamplesRef.current = [];
    maxAbsRef.current = 0;
    absSumRef.current = 0;
    sampleCountRef.current = 0;
    setStats(EMPTY_LEAN_STATS);
  }, []);

  return { ...stats, reset };
}
