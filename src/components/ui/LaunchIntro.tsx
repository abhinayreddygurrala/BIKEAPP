import { useEventListener } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
// falls back to a plain fade from the logo instead of breaking app launch.
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

// A 4.75 s 3D render: close on a red and black sport bike in a dark studio,
// a burnout in thick tyre smoke, a wheelie, then the smoke clears and it ends
// on its opening shot. Rendered from scripts/launch-intro/.
const INTRO_VIDEO = require('@/assets/video/launch-intro.mp4');
// By this video time (seconds) the smoke has gone and the camera is settling
// on the opening shot, so the app fades in from here.
const REVEAL_AT = 4.3;
// If the video hasn't started by then, don't keep anyone waiting for it.
const VIDEO_TIMEOUT_MS = 2500;
const REVEAL_MS = 450;

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath. */
  ready: boolean;
  /** The app. It sits under the intro and settles into place as it's revealed. */
  children: ReactNode;
};

/**
 * Plays once per cold launch, taking over from the native splash screen with
 * an identical-looking cover. The logo dissolves into the 3D burnout video,
 * and when it's done the first screen fades in. A tap skips straight to that;
 * with Reduce Motion on, it's a plain crossfade.
 */
export function LaunchIntro({ ready, children }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const withVideo = Video !== null && !reduced;

  const [done, setDone] = useState(!withVideo);
  const [videoShowing, setVideoShowing] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

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
    const timer = setTimeout(() => setDone(true), VIDEO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [withVideo, videoShowing]);

  // The logo dissolves into the video's first frame.
  useEffect(() => {
    if (videoShowing) cover.set(withTiming(0, { duration: 350, easing: EASE_OUT }));
  }, [videoShowing, cover]);

  // Once the video is done (or on a tap) and the app is ready, the app fades in.
  useEffect(() => {
    if (!ready || !(done || skipped)) return;
    // Two frames so the first screen has painted before anything reveals it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (started.current) return;
        started.current = true;
        setLeaving(true);
        veil.set(
          withTiming(0, { duration: reduced ? 250 : REVEAL_MS, easing: EASE_OUT }, (complete) => {
            if (complete) scheduleOnRN(setFinished, true);
          })
        );
        // The app settles into place as it appears.
        if (!reduced) {
          appScale.set(withSequence(withTiming(1.03, { duration: 0 }), withTiming(1, { duration: 700, easing: EASE_OUT })));
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, done, skipped, reduced, veil, appScale]);

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
                onDone={() => setDone(true)}
                onFail={() => setDone(true)}
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
        </View>
      )}
    </>
  );
}

function IntroVideo({
  onFirstFrame,
  onDone,
  onFail,
}: {
  onFirstFrame: () => void;
  onDone: () => void;
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
    if (currentTime >= REVEAL_AT) onDone();
  });
  useEventListener(player, 'playToEnd', onDone);

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
