import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Units } from '@/features/ride-tracking/rideMath';

export type UnitsSegmentedControlProps = {
  value: Units;
  onChange: (units: Units) => void;
};

const TRACK_HEIGHT = 44;
const INSET = Spacing.one;
const ANIMATION_MS = 220;

export function UnitsSegmentedControl({ value, onChange }: UnitsSegmentedControlProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const previousValueRef = useRef<Units | null>(null);
  // Also the indicator's own width — sliding by exactly this mirrors the
  // left inset on the right edge. Sliding by trackWidth/2 instead (the
  // unadjusted midpoint) would overshoot by INSET, landing the indicator's
  // right edge flush against the track's outer edge instead of matching the
  // left inset.
  const segmentWidth = trackWidth > 0 ? (trackWidth - INSET * 2) / 2 : 0;

  useEffect(() => {
    if (trackWidth === 0) return;
    const target = value === 'imperial' ? segmentWidth : 0;
    indicatorX.set(withTiming(target, { duration: ANIMATION_MS }));

    if (previousValueRef.current !== null && previousValueRef.current !== value) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    previousValueRef.current = value;
  }, [value, trackWidth, segmentWidth, indicatorX]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const select = (units: Units) => {
    if (units === value) return;
    onChange(units);
  };

  return (
    <View
      onLayout={handleLayout}
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <Animated.View
        style={[
          styles.indicator,
          { width: segmentWidth, backgroundColor: theme.accent },
          Shadows.glow(theme.accent),
          animatedIndicatorStyle,
        ]}
      />
      <Pressable
        style={styles.segment}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'metric' }}
        onPress={() => select('metric')}>
        <ThemedText type="smallBold" themeColor={value === 'metric' ? 'accentText' : 'textSecondary'}>
          Kilometers
        </ThemedText>
      </Pressable>
      <Pressable
        style={styles.segment}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'imperial' }}
        onPress={() => select('imperial')}>
        <ThemedText type="smallBold" themeColor={value === 'imperial' ? 'accentText' : 'textSecondary'}>
          Miles
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    borderRadius: Spacing.three,
    padding: INSET,
  },
  indicator: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    height: TRACK_HEIGHT - INSET * 2,
    borderRadius: Spacing.three - INSET,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
