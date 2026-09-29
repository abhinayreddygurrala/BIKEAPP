import { useCallback, useEffect, useRef, useState } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

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

// Portrait mount assumes the phone's top-to-bottom axis points along the
// bike's front-to-back line (see gamma's comment above), so gamma=lean,
// beta=pitch. Physically rotating the phone 90° into a landscape mount
// rotates that same body-fixed axis to point along the bike's LEFT-RIGHT
// line instead — geometrically, gamma and beta swap roles (gamma becomes
// pitch, beta becomes lean). Which of the two landscape directions the sign
// comes out correct for is a best-effort guess, unverified on a physical
// mount — flip the -1 below to +1 (or vice versa) if left/right or the
// wheelie direction read backwards once tested on the bike.
type MountOrientation = 'portrait' | 'landscape-left' | 'landscape-right';
const LANDSCAPE_MOUNT_SIGN: Record<Exclude<MountOrientation, 'portrait'>, 1 | -1> = {
  'landscape-left': -1,
  'landscape-right': 1,
};

// Live state — kept in React state because the gauge's "MAX LEFT/MAX RIGHT"
// labels need to re-render when they change, but that only happens on a new
// personal-best lean per side (rare), not on every sensor sample.
// currentDegRounded gets the same treatment: only set when the rounded
// integer actually changes, which is most samples during a snap but far
// fewer than every single 150ms tick while leaned steady through a corner.
export type LiveLeanStats = {
  currentDegRounded: number;
  steepestLeanLeftDeg: number;
  steepestLeanRightDeg: number;
};

const EMPTY_LIVE_LEAN_STATS: LiveLeanStats = {
  currentDegRounded: 0,
  steepestLeanLeftDeg: 0,
  steepestLeanRightDeg: 0,
};

// Everything else only matters once, at ride-stop, when it's persisted —
// nothing renders it live, so it stays in refs and is read via
// getFinalStats() instead of triggering a re-render on every sample.
export type FinalLeanStats = {
  maxDeg: number;
  avgDeg: number;
  curveCount: number;
  wheelieCount: number;
  longestWheelieSeconds: number;
  peakG: number;
};

/** Live lean-angle, curve, and wheelie tracking from the device's motion sensors, active only while `active` is true (foreground only — see the migration plan for why background isn't supported). */
export function useLeanAngleTracker(active: boolean) {
  const [liveStats, setLiveStats] = useState<LiveLeanStats>(EMPTY_LIVE_LEAN_STATS);
  // Live needle position, updated straight from the sensor callback on every
  // sample and consumed via useAnimatedStyle in LeanAngleGauge — bypasses
  // React state/re-render entirely so the gauge stays smooth regardless of
  // whatever else this ride-recording screen re-renders (map, GPS, etc).
  const leanDegShared = useSharedValue(0);
  const lastRoundedDegRef = useRef(0);
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
  // Detected once per activation (ride start or resume-after-pause), not
  // while actively recording. A live listener sounds appealing but is
  // actually wrong here: real hard cornering can tilt the phone far enough
  // that iOS's own accelerometer-based orientation heuristic misreads it as
  // a rotation to a different interface orientation — exactly mid-corner,
  // the worst possible moment to silently reset calibration. Pausing already
  // tears this effect down and resuming re-runs it, which is the intended
  // (and only) point to re-detect a physically remounted phone.
  const mountOrientationRef = useRef<MountOrientation>('portrait');

  useEffect(() => {
    if (!active || !DeviceMotion) return;
    const deviceMotion = DeviceMotion;
    let subscription: { remove: () => void } | undefined;
    let cancelled = false;

    const applyOrientation = (orientation: ScreenOrientation.Orientation) => {
      mountOrientationRef.current =
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT
          ? 'landscape-left'
          : orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            ? 'landscape-right'
            : 'portrait';
    };

    ScreenOrientation.getOrientationAsync()
      .then(applyOrientation)
      .catch(() => {
        mountOrientationRef.current = 'portrait';
      })
      .finally(() => {
        if (cancelled) return;

        subscription = deviceMotion.addListener((measurement: DeviceMotionMeasurement) => {
          const rotation = measurement.rotation;
          if (!rotation) return;
          const nowMs = Date.now();
          const gammaDeg = rotation.gamma * RAD_TO_DEG;
          const betaDeg = rotation.beta * RAD_TO_DEG;

          const mount = mountOrientationRef.current;
          const leanAxisDeg = mount === 'portrait' ? gammaDeg : betaDeg * LANDSCAPE_MOUNT_SIGN[mount];
          const pitchAxisDeg = mount === 'portrait' ? betaDeg : gammaDeg * LANDSCAPE_MOUNT_SIGN[mount];

          if (offsetDegRef.current == null || pitchOffsetDegRef.current == null) {
            calibrationSamplesRef.current.push(leanAxisDeg);
            pitchCalibrationSamplesRef.current.push(pitchAxisDeg);
            if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLES) {
              const sum = calibrationSamplesRef.current.reduce((a, b) => a + b, 0);
              offsetDegRef.current = sum / calibrationSamplesRef.current.length;
              const pitchSum = pitchCalibrationSamplesRef.current.reduce((a, b) => a + b, 0);
              pitchOffsetDegRef.current = pitchSum / pitchCalibrationSamplesRef.current.length;
            }
            return;
          }

          const leanDeg = leanAxisDeg - offsetDegRef.current;
          const absLean = Math.abs(leanDeg);
          maxAbsRef.current = Math.max(maxAbsRef.current, absLean);
          absSumRef.current += absLean;
          sampleCountRef.current += 1;

          // Drives the needle directly on the UI thread. withTiming smooths
          // over the gap between samples instead of snapping, so the needle
          // sweeps rather than ticks even at a 150ms sample rate.
          leanDegShared.set(withTiming(leanDeg, { duration: UPDATE_INTERVAL_MS, easing: Easing.linear }));

          const roundedAbs = Math.round(absLean);
          if (roundedAbs !== lastRoundedDegRef.current) {
            lastRoundedDegRef.current = roundedAbs;
            setLiveStats((s) => ({ ...s, currentDegRounded: roundedAbs }));
          }

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
                // Only touches React state when a side's live max actually
                // moves (a new personal-best lean, rare after the first
                // minute of riding) — not on every sample, which is what was
                // causing the whole recording screen to re-render 6-7x/second
                // and the needle to visibly stutter.
                if (isLeft && peakAbs > steepestLeftRef.current) {
                  steepestLeftRef.current = peakAbs;
                  setLiveStats((s) => ({ ...s, steepestLeanLeftDeg: peakAbs }));
                } else if (!isLeft && peakAbs > steepestRightRef.current) {
                  steepestRightRef.current = peakAbs;
                  setLiveStats((s) => ({ ...s, steepestLeanRightDeg: peakAbs }));
                }
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
          const pitchDeg = (pitchAxisDeg - pitchOffsetDegRef.current) * WHEELIE_PITCH_SIGN;
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
        });

        deviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
      });

    return () => {
      cancelled = true;
      subscription?.remove();
      // Re-calibrate next time tracking (re)starts, e.g. after a pause where
      // the mount could have been bumped.
      offsetDegRef.current = null;
      pitchOffsetDegRef.current = null;
      calibrationSamplesRef.current = [];
      pitchCalibrationSamplesRef.current = [];
      inCurveRef.current = false;
      inWheelieRef.current = false;
    };
  }, [active, leanDegShared]);

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
    lastRoundedDegRef.current = 0;
    leanDegShared.set(0);
    setLiveStats(EMPTY_LIVE_LEAN_STATS);
  }, [leanDegShared]);

  // Read once at ride-stop, not part of live state — these only matter once
  // persisted, so keeping them in refs avoids a re-render on every sample.
  const getCurveEvents = useCallback(() => curveEventsRef.current, []);
  const getFinalStats = useCallback(
    (): FinalLeanStats => ({
      maxDeg: maxAbsRef.current,
      avgDeg: sampleCountRef.current > 0 ? absSumRef.current / sampleCountRef.current : 0,
      curveCount: curveCountRef.current,
      wheelieCount: wheelieCountRef.current,
      longestWheelieSeconds: longestWheelieRef.current,
      peakG: peakGRef.current,
    }),
    []
  );

  return { ...liveStats, leanDegShared, reset, getCurveEvents, getFinalStats };
}
