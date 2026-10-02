import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// Must match the native splash screen (app.config.ts → expo-splash-screen's
// backgroundColor and imageWidth) so the hand-off from it is invisible.
const SPLASH_BACKGROUND = '#0B0B0D';
const SPLASH_ICON = require('@/assets/images/splash-icon.png');
const SPLASH_LOGO_WIDTH = 76;

// The logo grows from the splash's size to this one. It's drawn at this size
// (and starts scaled down) so it's sharp once it settles. The image is 754×584.
const LOGO_WIDTH = 112;
const LOGO_HEIGHT = (LOGO_WIDTH * 584) / 754;
const START_SCALE = SPLASH_LOGO_WIDTH / LOGO_WIDTH;
// How far the logo rises to make room for the name, keeping the pair centered.
const LIFT = 23;
const NAME_GAP = 22;
const NAME_TRACKING = 7;
const GLOW_SIZE = 72;
// The reveal zooms through the rear wheel's hub.
const REAR_HUB = '18.2% 76.3%';
const ZOOM = 18;
// A beat to read the name before the reveal.
const HOLD_MS = 120;

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath. */
  ready: boolean;
  /** The app. It sits under the intro and settles into place as it's revealed. */
  children: ReactNode;
};

/**
 * Plays once per cold launch, taking over from the native splash screen with
 * an identical-looking one: the logo grows with a soft glow and the name fades
 * in under it, then the logo zooms toward the viewer as the app settles into
 * place underneath. It runs while the app is still loading; with Reduce Motion
 * on, it's a plain crossfade.
 */
export function LaunchIntro({ ready, children }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const [logoShown, setLogoShown] = useState(false);
  const [branded, setBranded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const grow = useSharedValue(0);
  const name = useSharedValue(0);
  const zoom = useSharedValue(1);
  const backdrop = useSharedValue(1);
  const appScale = useSharedValue(1);

  // If the logo never reports loading, don't leave the native splash up.
  useEffect(() => {
    const timer = setTimeout(() => setLogoShown(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Swap the native splash for this one, then play the brand moment.
  useEffect(() => {
    if (!logoShown) return;
    // One frame so this logo is on screen before the native one goes.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hide();
      if (reduced) {
        setBranded(true);
        return;
      }
      grow.set(withTiming(1, { duration: 420, easing: EASE_OUT }));
      name.set(
        withDelay(
          80,
          withTiming(1, { duration: 340, easing: EASE_OUT }, (done) => {
            if (done) scheduleOnRN(setBranded, true);
          })
        )
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [logoShown, reduced, grow, name]);

  // Reveal once the brand moment has played and the app is ready underneath.
  useEffect(() => {
    if (!branded || !ready) return;
    // Two frames so the first screen has painted before it's revealed.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        setLeaving(true);
        if (reduced) {
          backdrop.set(
            withTiming(0, { duration: 250, easing: EASE_OUT }, (done) => {
              if (done) scheduleOnRN(setFinished, true);
            })
          );
          return;
        }
        name.set(withDelay(HOLD_MS, withTiming(0, { duration: 160, easing: EASE_OUT })));
        // A small dip first, then the zoom, so it reads as a launch.
        zoom.set(
          withDelay(
            HOLD_MS,
            withSequence(
              withTiming(0.9, { duration: 120, easing: EASE_IN_OUT }),
              withTiming(ZOOM, { duration: 420, easing: EASE_IN_OUT })
            )
          )
        );
        backdrop.set(withDelay(HOLD_MS + 160, withTiming(0, { duration: 360, easing: EASE_OUT })));
        // The app starts a little enlarged (still hidden) and settles as it appears.
        appScale.set(
          withSequence(
            withTiming(1.06, { duration: 0 }),
            withDelay(
              HOLD_MS + 140,
              withTiming(1, { duration: 480, easing: EASE_OUT }, (done) => {
                if (done) scheduleOnRN(setFinished, true);
              })
            )
          )
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [branded, ready, reduced, name, zoom, backdrop, appScale]);

  const appStyle = useAnimatedStyle(() => ({ transform: [{ scale: appScale.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  // With Reduce Motion, the logo simply fades out with the background.
  const contentStyle = useAnimatedStyle(() => ({ opacity: reduced ? backdrop.get() : 1 }));
  const brandStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -LIFT * grow.get() }, { scale: START_SCALE + (1 - START_SCALE) * grow.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: grow.get() * interpolate(zoom.get(), [1.5, 4], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: 0.7 + 0.3 * grow.get() }],
  }));
  const zoomStyle = useAnimatedStyle(() => ({
    opacity: interpolate(zoom.get(), [2.5, 9], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: zoom.get() }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: name.get(),
    transform: [{ translateY: 10 * (1 - grow.get()) }],
  }));

  return (
    <>
      <Animated.View style={[styles.app, appStyle]}>{children}</Animated.View>
      {finished ? null : (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={leaving ? 'none' : 'auto'}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, contentStyle]}>
            <Animated.View style={[styles.logo, brandStyle]}>
              <Animated.View style={[styles.glow, glowStyle]} />
              <Animated.View style={[styles.logo, styles.zoomOrigin, zoomStyle]}>
                <Image
                  source={SPLASH_ICON}
                  style={styles.logo}
                  resizeMode="contain"
                  onLoad={() => setLogoShown(true)}
                  onError={() => setLogoShown(true)}
                />
              </Animated.View>
            </Animated.View>
            <Animated.Text style={[styles.name, nameStyle]} allowFontScaling={false}>
              ODOMAP
            </Animated.Text>
          </Animated.View>
        </View>
      )}
    </>
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
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  zoomOrigin: {
    transformOrigin: REAR_HUB,
  },
  glow: {
    position: 'absolute',
    left: (LOGO_WIDTH - GLOW_SIZE) / 2,
    top: (LOGO_HEIGHT - GLOW_SIZE) / 2,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    // The app icon's orange, as a soft light behind the logo.
    backgroundColor: 'rgba(255, 75, 31, 0.22)',
    boxShadow: '0 0 60px 36px rgba(255, 75, 31, 0.22)',
  },
  name: {
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_HEIGHT / 2 - LIFT + NAME_GAP,
    left: 0,
    right: 0,
    textAlign: 'center',
    // Letter spacing also trails the last letter; this keeps the word centered.
    paddingLeft: NAME_TRACKING,
    letterSpacing: NAME_TRACKING,
    color: '#F5F5F7',
    fontSize: 17,
    fontWeight: '700',
  },
});
