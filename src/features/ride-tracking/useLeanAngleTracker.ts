import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeviceMotionMeasurement } from 'expo-sensors/build/DeviceMotion';
import type { CurveEvent } from '@/features/ride-tracking/rideMath';

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
// zero-offset rather than trusting raw gamma/beta as "0 = upright".
const CALIBRATION_SAMPLES = 5;

// Curve detection: a hysteresis band on lean angle so a lean sitting right at
// the boundary doesn't flicker in and out of "cornering" every sample.
// Which sign is "left" vs "right" depends on which way the phone is mounted
// — same caveat as the lean axis itself above. If they come out swapped in
// practice, flip LEFT_SIGN.
const CURVE_ENTER_DEG = 12;
const CURVE_EXIT_DEG = 6;
const CURVE_MIN_DURATION_S = 0.5; // filters out single-sample noise blips
const LEFT_SIGN = -1;

// Wheelie detection reuses the same DeviceMotion stream's pitch axis
// (`rotation.beta`) instead of roll. This is a best-effort heuristic, not a
// validated one — it can't currently tell a wheelie apart from other sharp
// pitch events (e.g. hard braking pitches the opposite way, but the exact
// sign for "front wheel up" on this mount is a guess pending real-world
// testing). WHEELIE_PITCH_SIGN is the one constant to flip if wheelies never
// trigger, or trigger on braking instead.
const WHEELIE_ENTER_DEG = 15;
const WHEELIE_EXIT_DEG = 8;
const WHEELIE_MIN_DURATION_S = 0.3;
const WHEELIE_PITCH_SIGN = 1;
const G = 9.80665;

export type LeanStats = {
  currentDeg: number;
  maxDeg: number;
  avgDeg: number;
  curveCount: number;
  steepestLeanLeftDeg: number;
  steepestLeanRightDeg: number;
  wheelieCount: number;
  longestWheelieSeconds: number;
  peakG: number;
};

const EMPTY_LEAN_STATS: LeanStats = {
  currentDeg: 0,
  maxDeg: 0,
  avgDeg: 0,
  curveCount: 0,
  steepestLeanLeftDeg: 0,
  steepestLeanRightDeg: 0,
  wheelieCount: 0,
  longestWheelieSeconds: 0,
  peakG: 0,
};

/** Live lean-angle, curve, and wheelie tracking from the device's motion sensors, active only while `active` is true (foreground only — see the migration plan for why background isn't supported). */
export function useLeanAngleTracker(active: boolean) {
  const [stats, setStats] = useState<LeanStats>(EMPTY_LEAN_STATS);
  const offsetDegRef = useRef<number | null>(null);
  const pitchOffsetDegRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);
  const pitchCalibrationSamplesRef = useRef<number[]>([]);
  const maxAbsRef = useRef(0);
  const absSumRef = useRef(0);
  const sampleCountRef = useRef(0);

  // Curve state machine
  const inCurveRef = useRef(false);
  const curveStartMsRef = useRef(0);
  const curvePeakSignedRef = useRef(0);
  const curveCountRef = useRef(0);
  const steepestLeftRef = useRef(0);
  const steepestRightRef = useRef(0);
  // Full event list (start/end timestamps), so a later pass can
  // cross-reference each curve against GPS speed/position — see
  // computeCurveRecords in rideMath.ts. steepestLeft/RightRef above stay for
  // cheap live display only; the persisted "truth" is recomputed from these
  // events at ride-stop time.
  const curveEventsRef = useRef<CurveEvent[]>([]);

  // Wheelie state machine
  const inWheelieRef = useRef(false);
  const wheelieStartMsRef = useRef(0);
  const wheelieCountRef = useRef(0);
  const longestWheelieRef = useRef(0);

  // Peak G, from the gravity-excluded acceleration vector's magnitude. This
  // is a simplification — "true" lateral G would isolate just the
  // side-to-side axis, but which axis that is depends on the exact mount
  // orientation (same caveat as LEFT_SIGN/WHEELIE_PITCH_SIGN above), so this
  // tracks overall accel/brake/corner force instead of isolating cornering.
  const peakGRef = useRef(0);

  useEffect(() => {
    if (!active || !DeviceMotion) return;

    const subscription = DeviceMotion.addListener((measurement: DeviceMotionMeasurement) => {
      const rotation = measurement.rotation;
      if (!rotation) return;
      const nowMs = Date.now();
      const gammaDeg = rotation.gamma * RAD_TO_DEG;
      const betaDeg = rotation.beta * RAD_TO_DEG;

      if (offsetDegRef.current == null || pitchOffsetDegRef.current == null) {
        calibrationSamplesRef.current.push(gammaDeg);
        pitchCalibrationSamplesRef.current.push(betaDeg);
        if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLES) {
          const sum = calibrationSamplesRef.current.reduce((a, b) => a + b, 0);
          offsetDegRef.current = sum / calibrationSamplesRef.current.length;
          const pitchSum = pitchCalibrationSamplesRef.current.reduce((a, b) => a + b, 0);
          pitchOffsetDegRef.current = pitchSum / pitchCalibrationSamplesRef.current.length;
        }
        return;
      }

      const leanDeg = gammaDeg - offsetDegRef.current;
      const absLean = Math.abs(leanDeg);
      maxAbsRef.current = Math.max(maxAbsRef.current, absLean);
      absSumRef.current += absLean;
      sampleCountRef.current += 1;

      // Curve boundary detection (hysteresis: enter above CURVE_ENTER_DEG,
      // only exit once back below CURVE_EXIT_DEG).
      if (!inCurveRef.current && absLean >= CURVE_ENTER_DEG) {
        inCurveRef.current = true;
        curveStartMsRef.current = nowMs;
        curvePeakSignedRef.current = leanDeg;
      } else if (inCurveRef.current) {
        if (Math.abs(leanDeg) > Math.abs(curvePeakSignedRef.current)) {
          curvePeakSignedRef.current = leanDeg;
        }
        if (absLean < CURVE_EXIT_DEG) {
          const durationS = (nowMs - curveStartMsRef.current) / 1000;
          if (durationS >= CURVE_MIN_DURATION_S) {
            curveCountRef.current += 1;
            const isLeft = Math.sign(curvePeakSignedRef.current) === LEFT_SIGN;
            const peakAbs = Math.abs(curvePeakSignedRef.current);
            if (isLeft) steepestLeftRef.current = Math.max(steepestLeftRef.current, peakAbs);
            else steepestRightRef.current = Math.max(steepestRightRef.current, peakAbs);
            curveEventsRef.current.push({
              startMs: curveStartMsRef.current,
              endMs: nowMs,
              peakDeg: peakAbs,
              direction: isLeft ? 'left' : 'right',
            });
          }
          inCurveRef.current = false;
        }
      }

      const accel = measurement.acceleration;
      if (accel) {
        const magnitudeG = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2) / G;
        peakGRef.current = Math.max(peakGRef.current, magnitudeG);
      }

      // Wheelie boundary detection, same hysteresis shape on the pitch axis.
      const pitchDeg = (betaDeg - pitchOffsetDegRef.current) * WHEELIE_PITCH_SIGN;
      if (!inWheelieRef.current && pitchDeg >= WHEELIE_ENTER_DEG) {
        inWheelieRef.current = true;
        wheelieStartMsRef.current = nowMs;
      } else if (inWheelieRef.current && pitchDeg < WHEELIE_EXIT_DEG) {
        const durationS = (nowMs - wheelieStartMsRef.current) / 1000;
        if (durationS >= WHEELIE_MIN_DURATION_S) {
          wheelieCountRef.current += 1;
          longestWheelieRef.current = Math.max(longestWheelieRef.current, durationS);
        }
        inWheelieRef.current = false;
      }

      setStats({
        currentDeg: leanDeg,
        maxDeg: maxAbsRef.current,
        avgDeg: absSumRef.current / sampleCountRef.current,
        curveCount: curveCountRef.current,
        steepestLeanLeftDeg: steepestLeftRef.current,
        steepestLeanRightDeg: steepestRightRef.current,
        wheelieCount: wheelieCountRef.current,
        longestWheelieSeconds: longestWheelieRef.current,
        peakG: peakGRef.current,
      });
    });

    DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);

    return () => {
      subscription.remove();
      // Re-calibrate next time tracking (re)starts, e.g. after a pause where
      // the mount could have been bumped.
      offsetDegRef.current = null;
      pitchOffsetDegRef.current = null;
      calibrationSamplesRef.current = [];
      pitchCalibrationSamplesRef.current = [];
      inCurveRef.current = false;
      inWheelieRef.current = false;
    };
  }, [active]);

  const reset = useCallback(() => {
    offsetDegRef.current = null;
    pitchOffsetDegRef.current = null;
    calibrationSamplesRef.current = [];
    pitchCalibrationSamplesRef.current = [];
    maxAbsRef.current = 0;
    absSumRef.current = 0;
    sampleCountRef.current = 0;
    inCurveRef.current = false;
    curveCountRef.current = 0;
    steepestLeftRef.current = 0;
    steepestRightRef.current = 0;
    curveEventsRef.current = [];
    inWheelieRef.current = false;
    wheelieCountRef.current = 0;
    longestWheelieRef.current = 0;
    peakGRef.current = 0;
    setStats(EMPTY_LEAN_STATS);
  }, []);

  // Read once at ride-stop, not part of live `stats` — an array in React
  // state would re-render on every curve, which nothing needs live.
  const getCurveEvents = useCallback(() => curveEventsRef.current, []);

  return { ...stats, reset, getCurveEvents };
}
