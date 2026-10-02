import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// Must match the native splash screen (app.config.ts → expo-splash-screen's
// backgroundColor and imageWidth) so the hand-off from it is invisible.
const SPLASH_BACKGROUND = '#0B0B0D';
const SPLASH_ICON = require('@/assets/images/splash-icon.png');
const LOGO_SIZE = 76;

// The logo is drawn aspect-fit in a 76pt square, like the native splash.
// Its rear tyre meets the ground at about (18%, 89%) of that square, which is
// where the wheelie pivots.
const REAR_WHEEL_CONTACT = '18% 89%';
const WHEELIE_DEG = 15;

// Shift lights under the bike, amber to orange like the app icon's gradient.
const LIGHT_COUNT = 9;
const LIGHT_COLORS = Array.from({ length: LIGHT_COUNT }, (_, i) => mix('#FFB020', '#FF4B1F', i / (LIGHT_COUNT - 1)));
// Just under the bike's wheels (which end at 67pt down the 76pt square).
const LIGHTS_TOP = 82;

function mix(from: string, to: string, t: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath, so the intro can get out of the way. */
  ready: boolean;
};

/**
 * Plays once per cold launch, taking over from the native splash screen: the
 * shift lights under the logo sweep up like a dash at ignition, then the bike
 * pops a wheelie and rides off while the app fades in underneath. It runs
 * while the app is still loading, so it adds well under a second; with Reduce
 * Motion on, it's a plain crossfade.
 */
export function LaunchIntro({ ready }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [logoShown, setLogoShown] = useState(false);
  const [revved, setRevved] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const rev = useSharedValue(0);
  const lift = useSharedValue(0);
  const go = useSharedValue(0);
  const veil = useSharedValue(1);

  // If the logo never reports loading, don't leave the native splash up.
  useEffect(() => {
    const timer = setTimeout(() => setLogoShown(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Swap the native splash for this identical-looking screen, then rev.
  useEffect(() => {
    if (!logoShown) return;
    // One frame so this logo is on screen before the native one goes.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hide();
      if (reduced) {
        setRevved(true);
        return;
      }
      rev.set(
        withTiming(1, { duration: 340, easing: Easing.linear }, (done) => {
          if (done) scheduleOnRN(setRevved, true);
        })
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [logoShown, reduced, rev]);

  // Launch once the lights are full and the app is ready underneath.
  useEffect(() => {
    if (!revved || !ready) return;
    // Two frames so the first screen has painted before it's revealed.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        setLeaving(true);
        if (reduced) {
          veil.set(
            withTiming(0, { duration: 250, easing: EASE_OUT }, (done) => {
              if (done) scheduleOnRN(setFinished, true);
            })
          );
          return;
        }
        lift.set(withDelay(60, withTiming(1, { duration: 160, easing: EASE_OUT })));
        go.set(withDelay(100, withTiming(1, { duration: 360, easing: EASE_IN_OUT })));
        veil.set(
          withDelay(
            200,
            withTiming(0, { duration: 300, easing: EASE_OUT }, (done) => {
              if (done) scheduleOnRN(setFinished, true);
            })
          )
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [revved, ready, reduced, lift, go, veil]);

  // Far enough right to leave the screen from the middle.
  const travel = width / 2 + LOGO_SIZE;

  const backdropStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const bikeStyle = useAnimatedStyle(() => ({
    opacity: reduced ? veil.get() : interpolate(go.get(), [0.5, 1], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: go.get() * travel }, { rotate: `${-lift.get() * WHEELIE_DEG}deg` }],
  }));
  // The lights go dark as the front wheel comes up.
  const lightsStyle = useAnimatedStyle(() => ({ opacity: 1 - lift.get() }));

  if (finished) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={styles.stage}>
          <Animated.View style={[styles.bike, bikeStyle]}>
            <Image
              source={SPLASH_ICON}
              style={styles.logo}
              resizeMode="contain"
              onLoad={() => setLogoShown(true)}
              onError={() => setLogoShown(true)}
            />
          </Animated.View>
          <Animated.View style={[styles.lights, lightsStyle]}>
            {LIGHT_COLORS.map((color, index) => (
              <ShiftLight key={color} index={index} color={color} rev={rev} />
            ))}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function ShiftLight({ index, color, rev }: { index: number; color: string; rev: SharedValue<number> }) {
  const start = index / LIGHT_COUNT;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(rev.get(), [start, start + 1 / LIGHT_COUNT], [0, 1], Extrapolation.CLAMP),
  }));

  return <Animated.View style={[styles.light, { backgroundColor: color, shadowColor: color }, style]} />;
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: SPLASH_BACKGROUND,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  bike: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    transformOrigin: REAR_WHEEL_CONTACT,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  lights: {
    position: 'absolute',
    top: LIGHTS_TOP,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  light: {
    width: 6,
    height: 4,
    borderRadius: 2,
    // A soft glow in each light's own color, like a lit LED.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
});
