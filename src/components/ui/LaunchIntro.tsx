import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Loaded defensively, per this project's convention for newly added native
// modules (see useLeanAngleTracker.ts): if it doesn't register, the intro
// falls back to a plain fade instead of breaking app launch.
let SvgLib: typeof import('react-native-svg') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SvgLib = require('react-native-svg');
} catch (e) {
  console.error('[LaunchIntro] react-native-svg unavailable', e);
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
// A bike pulling away gathers speed and keeps it, so the ride accelerates and
// leaves at full speed instead of easing out.
const PULL_AWAY = Easing.bezier(0.42, 0, 1, 1);

// Must match the native splash screen (app.config.ts → expo-splash-screen's
// backgroundColor and imageWidth) so the hand-off from it is invisible.
const SPLASH_BACKGROUND = '#0B0B0D';
const SPLASH_ICON = require('@/assets/images/splash-icon.png');
const SPLASH_LOGO_WIDTH = 76;

// The bike is drawn at this size, so it's sharp, and starts scaled down to the
// splash's. The image is 754×584 with both tyres on its bottom edge.
const BIKE_W = 100;
const BIKE_H = (BIKE_W * 584) / 754;
const START_SCALE = SPLASH_LOGO_WIDTH / BIKE_W;
// Where the tyres meet the road, as shares of the bike's width.
const REAR_TYRE = 0.182;
const FRONT_TYRE = 0.817;
const WHEELBASE = (FRONT_TYRE - REAR_TYRE) * BIKE_W;
const WHEELIE_DEG = 24;

// The road: flat under the bike, then twisting into bends that grow to full size.
const ROAD_WIDTH = 12;
const ROAD_COLOR = '#1F1F23';
const LANE_COLOR = 'rgba(245, 245, 247, 0.28)';
const FLAT = 40;
const RAMP = 140;
const AMPLITUDE = 34;
const WAVELENGTH = 340;
const STEP = 3;

/** The road's centre line (screen y) at world x. */
function roadY(x: number, flatY: number, bendsFrom: number) {
  'worklet';
  const d = x - bendsFrom;
  if (d <= 0) return flatY;
  const ramp = Math.min(d / RAMP, 1);
  const amplitude = AMPLITUDE * ramp * ramp * (3 - 2 * ramp);
  return flatY - amplitude * Math.sin((2 * Math.PI * d) / WAVELENGTH);
}

function pathData(from: number, to: number, flatY: number, bendsFrom: number, top: number) {
  let d = '';
  for (let x = from; x <= to + STEP; x += STEP) {
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${(roadY(x, flatY, bendsFrom) - top).toFixed(1)}`;
  }
  return d;
}

/** Where everything sits for this screen size. */
function useScene(width: number, height: number) {
  return useMemo(() => {
    const centerX = width / 2;
    // The road's centre line, placed so its top edge meets the bike's tyres.
    const flatY = height / 2 + BIKE_H / 2 + ROAD_WIDTH / 2;
    const bendsFrom = centerX + BIKE_W / 2 + FLAT;
    // How far the bike rides, and how far right it breaks away at the end
    // (enough to leave the screen); the view follows it the rest of the way.
    const travel = 2 * width;
    const breakaway = width / 2 + BIKE_W;
    const roadEnd = centerX + travel + BIKE_W;
    const trailFrom = centerX - BIKE_W / 2 + REAR_TYRE * BIKE_W;
    const top = flatY - AMPLITUDE - ROAD_WIDTH;
    return {
      centerX,
      flatY,
      bendsFrom,
      travel,
      breakaway,
      roadEnd,
      trailFrom,
      top,
      svgHeight: 2 * (AMPLITUDE + ROAD_WIDTH),
      road: pathData(-ROAD_WIDTH, roadEnd, flatY, bendsFrom, top),
      trail: pathData(trailFrom, roadEnd, flatY, bendsFrom, top),
    };
  }, [width, height]);
}

type LaunchIntroProps = {
  /** True once the first screen has rendered underneath. */
  ready: boolean;
  /** The app. It sits under the intro and settles into place as it's revealed. */
  children: ReactNode;
};

/**
 * Plays once per cold launch, taking over from the native splash screen with
 * an identical-looking one: the bike pops a wheelie, then pulls away along a
 * twisty road (lighting it up behind it, like a recorded route) and the app
 * opens as it rides off. A tap skips to the app; with Reduce Motion on, it's a
 * plain crossfade.
 */
export function LaunchIntro({ ready, children }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const animate = !reduced && SvgLib !== null;
  const { width, height } = useWindowDimensions();
  const scene = useScene(width, height);
  const { centerX, flatY, bendsFrom, travel, breakaway, roadEnd, trailFrom } = scene;

  const [logoShown, setLogoShown] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const revealed = useRef(false);

  const grow = useSharedValue(0);
  const roadIn = useSharedValue(0);
  const lift = useSharedValue(0);
  const ride = useSharedValue(0);
  const veil = useSharedValue(1);
  const appScale = useSharedValue(1);

  // If the logo never reports loading, don't leave the native splash up.
  useEffect(() => {
    const timer = setTimeout(() => setLogoShown(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Swap the native splash for this one, then play the scene.
  useEffect(() => {
    if (!logoShown) return;
    // One frame so this logo is on screen before the native one goes.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hide();
      if (!animate) {
        setNearEnd(true);
        return;
      }
      grow.set(withTiming(1, { duration: 220, easing: EASE_OUT }));
      roadIn.set(withDelay(100, withTiming(1, { duration: 300, easing: EASE_OUT })));
      // Front wheel up, a beat, then down again as the bike pulls away.
      lift.set(
        withDelay(
          200,
          withSequence(
            withTiming(1, { duration: 220, easing: EASE_OUT }),
            withDelay(100, withTiming(0, { duration: 200, easing: EASE_IN_OUT }))
          )
        )
      );
      ride.set(withDelay(620, withTiming(1, { duration: 1450, easing: PULL_AWAY })));
    });
    return () => cancelAnimationFrame(frame);
  }, [logoShown, animate, grow, roadIn, lift, ride]);

  // Start opening the app as the bike breaks away for the edge of the screen.
  useAnimatedReaction(
    () => ride.get() > 0.8,
    (past, wasPast) => {
      if (past && !wasPast) scheduleOnRN(setNearEnd, true);
    }
  );

  // Reveal the app once it's ready and the ride is nearly over (or was skipped).
  useEffect(() => {
    if (!ready || !(nearEnd || skipped)) return;
    // Two frames so the first screen has painted before it's revealed.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (revealed.current) return;
        revealed.current = true;
        setLeaving(true);
        const fade = !animate || skipped ? 250 : 420;
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
  }, [ready, nearEnd, skipped, animate, reduced, veil, appScale]);

  const appStyle = useAnimatedStyle(() => ({ transform: [{ scale: appScale.get() }] }));
  const sceneStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  // The view keeps the bike centred, then lets it break away to the right.
  const worldStyle = useAnimatedStyle(() => {
    const r = ride.get();
    const away = Math.min(Math.max((r - 0.55) / 0.45, 0), 1);
    return { transform: [{ translateX: breakaway * away * away - travel * r }] };
  });
  const roadStyle = useAnimatedStyle(() => ({ opacity: roadIn.get() }));
  // The lit trail ends at the rear tyre. Its window slides right while the
  // trail inside slides back by the same amount, so only the part behind the
  // bike shows (transforms only, so the drawing never re-renders).
  const trailWindowStyle = useAnimatedStyle(() => {
    const rearTyre = centerX + travel * ride.get() - BIKE_W / 2 + REAR_TYRE * BIKE_W;
    return { transform: [{ translateX: rearTyre - roadEnd }] };
  });
  const trailStyle = useAnimatedStyle(() => {
    const rearTyre = centerX + travel * ride.get() - BIKE_W / 2 + REAR_TYRE * BIKE_W;
    return { transform: [{ translateX: roadEnd - rearTyre }] };
  });
  // Both tyres stay on the road, so the bike tilts with it over crests and dips.
  const bikeRideStyle = useAnimatedStyle(() => {
    const x = centerX + travel * ride.get();
    const rearY = roadY(x - WHEELBASE / 2, flatY, bendsFrom);
    const frontY = roadY(x + WHEELBASE / 2, flatY, bendsFrom);
    return {
      transform: [
        { translateX: x - centerX },
        { translateY: (rearY + frontY) / 2 - flatY },
        { rotate: `${(Math.atan2(frontY - rearY, WHEELBASE) * 180) / Math.PI}deg` },
      ],
    };
  });
  const bikeGrowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: START_SCALE + (1 - START_SCALE) * grow.get() }],
  }));
  const wheelieStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-WHEELIE_DEG * lift.get()}deg` }] }));

  return (
    <>
      <Animated.View style={[styles.app, appStyle]}>{children}</Animated.View>
      {finished ? null : (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, sceneStyle]}
          pointerEvents={leaving ? 'none' : 'auto'}
          onTouchEnd={() => setSkipped(true)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Animated.View style={[StyleSheet.absoluteFill, worldStyle]}>
            {animate && SvgLib ? (
              <>
                <Animated.View style={[styles.layer, { top: scene.top }, roadStyle]}>
                  <SvgLib.Svg width={roadEnd} height={scene.svgHeight}>
                    <SvgLib.Path
                      d={scene.road}
                      stroke={ROAD_COLOR}
                      strokeWidth={ROAD_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <SvgLib.Path d={scene.road} stroke={LANE_COLOR} strokeWidth={1.5} strokeDasharray="6 9" fill="none" />
                  </SvgLib.Svg>
                </Animated.View>
                <Animated.View
                  style={[
                    styles.trailWindow,
                    { left: trailFrom, top: scene.top, width: roadEnd - trailFrom, height: scene.svgHeight },
                    trailWindowStyle,
                  ]}>
                  <Animated.View style={[styles.layer, { left: -trailFrom }, trailStyle]}>
                    <SvgLib.Svg width={roadEnd} height={scene.svgHeight}>
                      <SvgLib.Defs>
                        <SvgLib.LinearGradient id="trail" x1="0" y1="0" x2="1" y2="0">
                          <SvgLib.Stop offset="0" stopColor="#FFB020" />
                          <SvgLib.Stop offset="1" stopColor="#FF4B1F" />
                        </SvgLib.LinearGradient>
                      </SvgLib.Defs>
                      <SvgLib.Path
                        d={scene.trail}
                        stroke="url(#trail)"
                        strokeOpacity={0.3}
                        strokeWidth={9}
                        strokeLinecap="round"
                        fill="none"
                      />
                      <SvgLib.Path d={scene.trail} stroke="url(#trail)" strokeWidth={3} strokeLinecap="round" fill="none" />
                    </SvgLib.Svg>
                  </Animated.View>
                </Animated.View>
              </>
            ) : null}
            <Animated.View
              style={[styles.bike, { left: centerX - BIKE_W / 2, top: height / 2 - BIKE_H / 2 }, bikeRideStyle]}>
              <Animated.View style={[styles.bikeFill, bikeGrowStyle]}>
                <Animated.View style={[styles.bikeFill, styles.wheeliePivot, wheelieStyle]}>
                  <Image
                    source={SPLASH_ICON}
                    style={styles.bikeFill}
                    resizeMode="contain"
                    onLoad={() => setLogoShown(true)}
                    onError={() => setLogoShown(true)}
                  />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
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
  layer: {
    position: 'absolute',
    left: 0,
  },
  trailWindow: {
    position: 'absolute',
    overflow: 'hidden',
  },
  bike: {
    position: 'absolute',
    width: BIKE_W,
    height: BIKE_H,
    // Tilts on the road from where its tyres touch it.
    transformOrigin: '50% 100%',
  },
  bikeFill: {
    width: BIKE_W,
    height: BIKE_H,
  },
  wheeliePivot: {
    transformOrigin: `${REAR_TYRE * 100}% 100%`,
  },
});
