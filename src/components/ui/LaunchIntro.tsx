import { useEventListener } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Loaded defensively, per this project's convention for newly added native
// modules (see useLeanAngleTracker.ts): if it doesn't register, the intro
// falls back to the smoke over the logo instead of breaking app launch.
let Video: typeof import('expo-video') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Video = require('expo-video');
} catch (e) {
  console.error('[LaunchIntro] expo-video unavailable', e);
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Must match the native splash screen (app.config.ts → expo-splash-screen's
// backgroundColor and imageWidth) so the hand-off from it is invisible.
const SPLASH_BACKGROUND = '#0B0B0D';
const SPLASH_ICON = require('@/assets/images/splash-icon.png');
const SPLASH_LOGO_SIZE = 76;

// A 1.47 s 3D render: the bike starts exactly where the splash logo is and
// pops a wheelie. Rendered from scripts/launch-intro/; re-render it if the
// logo, splash size or colours change.
const INTRO_VIDEO = require('@/assets/video/launch-intro.mp4');
// The wheelie lands at this video time (seconds) and the tyre smoke starts…
const LANDS_AT = 1.2;
// …from where the rear tyre is on screen then (fractions of width and height).
const TYRE = { x: 0.17, y: 0.6 };
// If the video hasn't started by then, don't keep anyone waiting for it.
const VIDEO_TIMEOUT_MS = 2500;

// The smoke, in ms from its start: it billows until it covers the screen, the
// first screen is swapped in underneath, then the smoke clears off it.
const SMOKE = [
  require('@/assets/images/smoke-1.png'),
  require('@/assets/images/smoke-2.png'),
  require('@/assets/images/smoke-3.png'),
];
const SMOKE_MS = 1600;
const PUFF_LIFE_MS = 1100;
const COVERED_AT = 680;
const CLEARS_FROM = 750;
// Each puff drifts out from the tyre by (dx, dy) screen widths/heights while
// growing from s0 to s1 times its base size, turning as it goes.
type Puff = { img: number; delay: number; dx: number; dy: number; s0: number; s1: number; rot: number; spin: number; peak: number };
const PUFFS: Puff[] = [
  { img: 0, delay: 0, dx: -0.1, dy: -0.05, s0: 0.25, s1: 1.6, rot: 0, spin: 30, peak: 0.95 },
  { img: 1, delay: 60, dx: 0.15, dy: -0.18, s0: 0.3, s1: 2, rot: 40, spin: -25, peak: 0.9 },
  { img: 2, delay: 120, dx: -0.05, dy: -0.35, s0: 0.3, s1: 2.4, rot: 80, spin: 20, peak: 0.9 },
  { img: 0, delay: 170, dx: 0.4, dy: -0.3, s0: 0.35, s1: 2.6, rot: 120, spin: -20, peak: 0.88 },
  { img: 2, delay: 200, dx: 0.75, dy: -0.15, s0: 0.4, s1: 2.6, rot: 330, spin: 18, peak: 0.9 },
  { img: 1, delay: 220, dx: 0.25, dy: 0.15, s0: 0.35, s1: 2.4, rot: 200, spin: 25, peak: 0.88 },
  { img: 2, delay: 260, dx: 0.6, dy: -0.05, s0: 0.4, s1: 2.8, rot: 260, spin: -15, peak: 0.85 },
  { img: 0, delay: 300, dx: 0.1, dy: -0.6, s0: 0.4, s1: 3, rot: 300, spin: 15, peak: 0.85 },
  { img: 1, delay: 340, dx: 0.55, dy: -0.55, s0: 0.45, s1: 3, rot: 20, spin: -12, peak: 0.85 },
  { img: 2, delay: 380, dx: 0.45, dy: 0.3, s0: 0.45, s1: 3, rot: 90, spin: 12, peak: 0.85 },
  { img: 0, delay: 420, dx: -0.05, dy: 0.3, s0: 0.45, s1: 2.8, rot: 150, spin: -10, peak: 0.85 },
  { img: 1, delay: 460, dx: 0.7, dy: 0.35, s0: 0.5, s1: 3.2, rot: 230, spin: 10, peak: 0.85 },
];

function easeOutCubic(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath. */
  ready: boolean;
  /** The app. It sits under the intro and settles into place as it's revealed. */
  children: ReactNode;
};

/**
 * Plays once per cold launch, taking over from the native splash screen with
 * an identical-looking cover. The logo dissolves into the 3D bike, which pops
 * a wheelie; when it lands, tyre smoke fills the screen and clears off the
 * first screen. A tap skips to the smoke; with Reduce Motion on, it's a plain
 * crossfade.
 */
export function LaunchIntro({ ready, children }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const withVideo = Video !== null && !reduced;

  const [landed, setLanded] = useState(!withVideo);
  const [videoShowing, setVideoShowing] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  const cover = useSharedValue(1);
  const veil = useSharedValue(1);
  const smokeT = useSharedValue(0);
  const appScale = useSharedValue(1);

  // The cover looks exactly like the native splash, so it can go as soon as the logo is up.
  const hideNativeSplash = () => requestAnimationFrame(() => SplashScreen.hide());
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Never wait on a video that won't start.
  useEffect(() => {
    if (!withVideo || videoShowing) return;
    const timer = setTimeout(() => setLanded(true), VIDEO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [withVideo, videoShowing]);

  // The logo dissolves into the 3D bike, which starts in the same place.
  useEffect(() => {
    if (videoShowing) cover.set(withTiming(0, { duration: 350, easing: EASE_OUT }));
  }, [videoShowing, cover]);

  // Once the wheelie lands (or on a tap) and the app is ready, smoke clears onto it.
  useEffect(() => {
    if (!ready || !(landed || skipped)) return;
    // Two frames so the first screen has painted before anything reveals it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (started.current) return;
        started.current = true;
        setLeaving(true);
        if (reduced) {
          veil.set(
            withTiming(0, { duration: 250, easing: EASE_OUT }, (done) => {
              if (done) scheduleOnRN(setFinished, true);
            })
          );
          return;
        }
        smokeT.set(
          withTiming(SMOKE_MS, { duration: SMOKE_MS, easing: Easing.linear }, (done) => {
            if (done) scheduleOnRN(setFinished, true);
          })
        );
        // Under full smoke: swap the video for the app, which settles as the smoke clears.
        veil.set(withDelay(COVERED_AT, withTiming(0, { duration: 150 })));
        appScale.set(
          withSequence(
            withTiming(1.03, { duration: 0 }),
            withDelay(COVERED_AT, withTiming(1, { duration: 850, easing: EASE_OUT }))
          )
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, landed, skipped, reduced, veil, smokeT, appScale]);

  const appStyle = useAnimatedStyle(() => ({ transform: [{ scale: appScale.get() }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));

  return (
    <>
      <Animated.View style={[styles.app, appStyle]}>{children}</Animated.View>
      {finished ? null : (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={leaving ? 'none' : 'auto'}
          onTouchEnd={() => setSkipped(true)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, veilStyle]}>
            {withVideo ? (
              <IntroVideo
                onFirstFrame={() => setVideoShowing(true)}
                onLanded={() => setLanded(true)}
                onFail={() => setLanded(true)}
              />
            ) : null}
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, styles.center, coverStyle]}>
              <Image
                source={SPLASH_ICON}
                style={styles.logo}
                resizeMode="contain"
                onLoad={hideNativeSplash}
                onError={hideNativeSplash}
              />
            </Animated.View>
          </Animated.View>
          {reduced ? null : <TyreSmoke t={smokeT} />}
        </View>
      )}
    </>
  );
}

function IntroVideo({
  onFirstFrame,
  onLanded,
  onFail,
}: {
  onFirstFrame: () => void;
  onLanded: () => void;
  onFail: () => void;
}) {
  // Only rendered when expo-video loaded.
  const { useVideoPlayer, VideoView } = Video!;
  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.muted = true;
    p.loop = false;
    // Silent, and never interrupts music the rider is already playing.
    p.audioMixingMode = 'mixWithOthers';
    p.timeUpdateEventInterval = 0.05;
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') player.play();
    if (status === 'error') onFail();
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime >= LANDS_AT) onLanded();
  });
  useEventListener(player, 'playToEnd', onLanded);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
      onFirstFrameRender={onFirstFrame}
    />
  );
}

/** Puffs of tyre smoke billowing out from the rear tyre, all driven by one clock. */
function TyreSmoke({ t }: { t: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const size = width * 0.8;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PUFFS.map((puff, i) => (
        <SmokePuff key={i} puff={puff} t={t} size={size} x={TYRE.x * width} y={TYRE.y * height} width={width} height={height} />
      ))}
    </View>
  );
}

function SmokePuff({
  puff,
  t,
  size,
  x,
  y,
  width,
  height,
}: {
  puff: Puff;
  t: SharedValue<number>;
  size: number;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => {
    const local = t.get() - puff.delay;
    if (local <= 0) return { opacity: 0 };
    const p = easeOutCubic(Math.min(local / PUFF_LIFE_MS, 1));
    const clearing = interpolate(t.get(), [CLEARS_FROM, SMOKE_MS], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: puff.peak * Math.min(local / 140, 1) * (1 - clearing),
      transform: [
        { translateX: puff.dx * width * p },
        { translateY: puff.dy * height * p },
        { scale: puff.s0 + (puff.s1 - puff.s0) * p },
        { rotate: `${puff.rot + puff.spin * p}deg` },
      ],
    };
  });
  // Mounted (invisible) from the start, so the images are decoded before the smoke begins.
  return (
    <Animated.Image
      source={SMOKE[puff.img]}
      style={[styles.puff, { width: size, height: size, left: x - size / 2, top: y - size / 2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: SPLASH_BACKGROUND,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: SPLASH_LOGO_SIZE,
    height: SPLASH_LOGO_SIZE,
  },
  puff: {
    position: 'absolute',
    opacity: 0,
  },
});
