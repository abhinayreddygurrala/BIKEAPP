import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type LeanAngleGaugeProps = {
  /** Signed — negative is left, positive is right (matches useLeanAngleTracker's LEFT_SIGN convention).
   * A shared value so the needle animates on the UI thread straight from the sensor callback,
   * independent of how often the rest of the recording screen re-renders. */
  currentDeg: SharedValue<number>;
  /** Same value, rounded to a whole degree and only pushed to React state when
   * that integer changes — cheap enough to drive the digit readout and color
   * bands without the needle's own re-render cost. */
  currentDegRounded: number;
  maxLeftDeg: number;
  maxRightDeg: number;
};

// Full-scale range of the dial. Most street riding lives under 45°; a
// sportbike at the very edge of grip is around 55-60°, so this gives that
// still visible headroom rather than pegging the needle at max.
const GAUGE_MAX_DEG = 60;
const RADIUS = 92;
const RING_WIDTH = 10;
const NEEDLE_LENGTH = RADIUS - RING_WIDTH - 6;
const NEEDLE_WIDTH = 4;

// Fixed decorative ticks around the arc, evenly spaced.
const TICK_DEGREES = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

function colorForMagnitude(absDeg: number, theme: ReturnType<typeof useTheme>) {
  if (absDeg >= 40) return theme.danger;
  if (absDeg >= 22) return theme.warning;
  return theme.success;
}

/** A speedometer-style semicircular dial with a needle pointing straight up at 0° — the lean-gauge look from a Ducati-style dashboard. */
export function LeanAngleGauge({ currentDeg, currentDegRounded, maxLeftDeg, maxRightDeg }: LeanAngleGaugeProps) {
  const theme = useTheme();
  const needleColor = colorForMagnitude(currentDegRounded, theme);

  // Runs on the UI thread, driven directly by the sensor callback's
  // withTiming updates to `currentDeg` — no React re-render involved.
  const needleAnimatedStyle = useAnimatedStyle(() => {
    const clamped = Math.max(-GAUGE_MAX_DEG, Math.min(GAUGE_MAX_DEG, currentDeg.get()));
    return { transform: [{ rotate: `${clamped}deg` }] };
  });

  return (
    <View style={styles.wrap}>
      <View style={[styles.dial, { width: RADIUS * 2, height: RADIUS }]}>
        {/* Track: the bottom half of a full circle, clipped to only show the top. */}
        <View style={[styles.ringClip, { width: RADIUS * 2, height: RADIUS }]}>
          <View
            style={[
              styles.ring,
              {
                width: RADIUS * 2,
                height: RADIUS * 2,
                borderRadius: RADIUS,
                borderWidth: RING_WIDTH,
                borderColor: theme.backgroundElement,
              },
            ]}
          />
        </View>

        {TICK_DEGREES.map((deg) => (
          <View
            key={deg}
            pointerEvents="none"
            style={[
              styles.tickPivot,
              {
                width: NEEDLE_WIDTH,
                height: RADIUS * 2,
                left: RADIUS - NEEDLE_WIDTH / 2,
                top: 0,
                transform: [{ rotate: `${deg}deg` }],
              },
            ]}>
            <View style={[styles.tick, { backgroundColor: theme.textSecondary }]} />
          </View>
        ))}

        {/* Needle: a box centered exactly on the pivot point, rotated as a
            whole (so it turns around its own center = the pivot) — the
            visible bar only occupies the box's top half. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.needlePivot,
            {
              width: NEEDLE_WIDTH * 3,
              height: NEEDLE_LENGTH * 2,
              left: RADIUS - (NEEDLE_WIDTH * 3) / 2,
              top: RADIUS - NEEDLE_LENGTH,
            },
            needleAnimatedStyle,
          ]}>
          <View
            style={[
              styles.needle,
              { width: NEEDLE_WIDTH, height: NEEDLE_LENGTH, backgroundColor: needleColor },
            ]}
          />
        </Animated.View>
        <View style={[styles.hub, { backgroundColor: needleColor }]} />

        <View style={styles.readout} pointerEvents="none">
          <ThemedText type="title" style={[styles.readoutValue, { color: needleColor }]}>
            {currentDegRounded}
            <ThemedText type="default" style={{ color: needleColor }}>
              °
            </ThemedText>
          </ThemedText>
        </View>
      </View>

      <View style={styles.labelRow}>
        <ThemedText type="statLabel" themeColor="textSecondary">
          {Math.round(maxLeftDeg)}° MAX LEFT
        </ThemedText>
        <ThemedText type="statLabel" themeColor="textSecondary">
          {Math.round(maxRightDeg)}° MAX RIGHT
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  dial: {
    position: 'relative',
  },
  ringClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: 0,
  },
  tickPivot: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: 8,
  },
  needlePivot: {
    position: 'absolute',
    alignItems: 'center',
  },
  needle: {
    borderRadius: NEEDLE_WIDTH / 2,
  },
  hub: {
    position: 'absolute',
    bottom: -5,
    left: RADIUS - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  readout: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  readoutValue: {
    fontSize: 32,
    lineHeight: 34,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: RADIUS * 2,
  },
});
