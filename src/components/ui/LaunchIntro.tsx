import { useEventListener } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Loaded defensively, per this project's convention for newly added native
// modules (see useLeanAngleTracker.ts): if it doesn't register, the intro
// falls back to a plain crossfade instead of breaking app launch.
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

// A 3.1 s 3D render: the bike starts exactly where the splash logo is, pops a
// wheelie, then rides off through twisty roads. Rendered from
// scripts/launch-intro/; re-render it if the logo, splash size or colours change.
const INTRO_VIDEO = require('@/assets/video/launch-intro.mp4');
// Start opening the app while the bike is riding away (video time, seconds).
const REVEAL_AT = 2.55;
// If the video hasn't started by then, don't keep anyone waiting for it.
const VIDEO_TIMEOUT_MS = 2500;

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath. */
  ready: boolean;
  /** The app. It sits under the intro and settles into place as it's revealed. */
  children: ReactNode;
};

/**
 * Plays once per cold launch, taking over from the native splash screen with
 * an identical-looking cover. The logo dissolves into the 3D bike from the
 * intro video, and the app fades in as the bike rides away. A tap skips it;
 * with Reduce Motion on (or no video), it's a plain crossfade.
 */
export function LaunchIntro({ ready, children }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const withVideo = Video !== null && !reduced;

  const [nearEnd, setNearEnd] = useState(!withVideo);
  const [videoShowing, setVideoShowing] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const revealed = useRef(false);

  const cover = useSharedValue(1);
  const veil = useSharedValue(1);
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
    const timer = setTimeout(() => setNearEnd(true), VIDEO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [withVideo, videoShowing]);

  // The logo dissolves into the 3D bike, which starts in the same place.
  useEffect(() => {
    if (videoShowing) cover.set(withTiming(0, { duration: 350, easing: EASE_OUT }));
  }, [videoShowing, cover]);

  // Reveal the app once it's ready and the ride is nearly over (or was skipped).
  useEffect(() => {
    if (!ready || !(nearEnd || skipped)) return;
    // Two frames so the first screen has painted before it's revealed.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (revealed.current) return;
        revealed.current = true;
        setLeaving(true);
        const fade = videoShowing && !skipped ? 450 : 250;
        veil.set(withTiming(0, { duration: fade, easing: EASE_OUT }));
        // The app starts a little enlarged (still hidden) and settles as it appears.
        appScale.set(
          withSequence(
            withTiming(reduced ? 1 : 1.05, { duration: 0 }),
            withTiming(1, { duration: fade + 120, easing: EASE_OUT }, (done) => {
              if (done) scheduleOnRN(setFinished, true);
            })
          )
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, nearEnd, skipped, videoShowing, reduced, veil, appScale]);

  const appStyle = useAnimatedStyle(() => ({ transform: [{ scale: appScale.get() }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));

  return (
    <>
      <Animated.View style={[styles.app, appStyle]}>{children}</Animated.View>
      {finished ? null : (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, veilStyle]}
          pointerEvents={leaving ? 'none' : 'auto'}
          onTouchEnd={() => setSkipped(true)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {withVideo ? (
            <IntroVideo
              onFirstFrame={() => setVideoShowing(true)}
              onNearEnd={() => setNearEnd(true)}
              onFail={() => setNearEnd(true)}
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
      )}
    </>
  );
}

function IntroVideo({
  onFirstFrame,
  onNearEnd,
  onFail,
}: {
  onFirstFrame: () => void;
  onNearEnd: () => void;
  onFail: () => void;
}) {
  // Only rendered when expo-video loaded.
  const { useVideoPlayer, VideoView } = Video!;
  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.muted = true;
    p.loop = false;
    // Silent, and never interrupts music the rider is already playing.
    p.audioMixingMode = 'mixWithOthers';
    p.timeUpdateEventInterval = 0.1;
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') player.play();
    if (status === 'error') onFail();
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime >= REVEAL_AT) onNearEnd();
  });
  useEventListener(player, 'playToEnd', onNearEnd);

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
});
