import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextSizeSliderProps = {
  /** Number of notches on the bar. */
  steps: number;
  /** Index of the selected notch, 0 = smallest. */
  value: number;
  onChange: (index: number) => void;
  /** What VoiceOver reads for the current notch, e.g. "Default". */
  valueLabel: string;
};

const THUMB_SIZE = 28;
const TICK_HEIGHT = 10;
const SNAP = { duration: 250, dampingRatio: 1 } as const;

/**
 * Apple's Text Size control: a notched bar between a small and a large "A".
 * The thumb follows the finger, ticks a haptic at each notch it crosses, and
 * settles onto the nearest notch on release. Tapping anywhere on the bar
 * jumps straight to that notch.
 */
export function TextSizeSlider({ steps, value, onChange, valueLabel }: TextSizeSliderProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const width = useSharedValue(0);
  const x = useSharedValue(0);
  // The notch the thumb is on, owned by the UI thread while dragging.
  const index = useSharedValue(value);

  const stopX = (i: number, w: number) => (steps > 1 ? (i / (steps - 1)) * w : 0);

  // The gesture below only moves the thumb and updates `index`; reporting the
  // change happens here. Each report changes the app's text size and
  // re-renders this screen — keeping that out of the gesture means the
  // gesture never has to be rebuilt mid-drag (which would cancel it).
  useAnimatedReaction(
    () => index.get(),
    (current, previous) => {
      if (previous !== null && current !== previous) scheduleOnRN(onChange, current);
    },
    [onChange]
  );

  // Changes from outside (first load, VoiceOver) move the thumb to their notch.
  // A change the drag itself made already has index === value: leave the
  // thumb where the finger is.
  useEffect(() => {
    if (index.get() === value) return;
    index.set(value);
    x.set(withSpring(stopX(value, trackWidth), SNAP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // A width change (first layout, rotation) re-places the thumb without animating.
  useEffect(() => {
    x.set(stopX(index.get(), trackWidth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - THUMB_SIZE);
    width.set(w);
    setTrackWidth(w);
  };

  const gesture = useMemo(() => {
    const nearest = (pos: number) => {
      'worklet';
      const w = width.get();
      if (w <= 0 || steps <= 1) return 0;
      return Math.round((Math.min(Math.max(pos, 0), w) / w) * (steps - 1));
    };
    const stop = (i: number) => {
      'worklet';
      return steps > 1 ? (i / (steps - 1)) * width.get() : 0;
    };
    const moveTo = (next: number) => {
      'worklet';
      if (next !== index.get()) {
        index.set(next);
        scheduleOnRN(Haptics.selectionAsync);
      }
    };

    const pan = Gesture.Pan()
      // Horizontal drags only, so the screen can still scroll vertically.
      .activeOffsetX([-4, 4])
      .failOffsetY([-12, 12])
      .onUpdate((e) => {
        const pos = Math.min(Math.max(e.x - THUMB_SIZE / 2, 0), width.get());
        x.set(pos);
        moveTo(nearest(pos));
      })
      .onFinalize(() => {
        x.set(withSpring(stop(index.get()), SNAP));
      });

    const tap = Gesture.Tap().onEnd((e) => {
      const next = nearest(e.x - THUMB_SIZE / 2);
      x.set(withSpring(stop(next), SNAP));
      moveTo(next);
    });

    return Gesture.Race(pan, tap);
  }, [steps, width, x, index]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Text size"
      accessibilityValue={{ text: valueLabel }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && value < steps - 1) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && value > 0) onChange(value - 1);
      }}>
      {/* Fixed sizes on purpose — these show the range and mustn't grow
          and shove the bar around while the text size changes under them. */}
      <Text style={[styles.smallA, { color: theme.text }]}>A</Text>

      <GestureDetector gesture={gesture}>
        <View style={styles.trackArea} onLayout={onLayout}>
          <View style={[styles.line, { backgroundColor: theme.textSecondary }]} />
          {Array.from({ length: steps }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                { backgroundColor: theme.textSecondary, left: THUMB_SIZE / 2 + stopX(i, trackWidth) - 1 },
              ]}
            />
          ))}
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>

      <Text style={[styles.largeA, { color: theme.text }]}>A</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  smallA: {
    fontSize: 14,
    fontWeight: '500',
  },
  largeA: {
    fontSize: 26,
    fontWeight: '500',
  },
  trackArea: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 2,
    borderRadius: 1,
    opacity: 0.5,
  },
  tick: {
    position: 'absolute',
    width: 2,
    height: TICK_HEIGHT,
    borderRadius: 1,
    opacity: 0.5,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    // iOS slider thumbs are white in both light and dark mode.
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
});
