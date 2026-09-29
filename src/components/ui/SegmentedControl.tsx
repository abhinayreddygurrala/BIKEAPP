import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
};

const TRACK_HEIGHT = 44;
const INSET = Spacing.one;
const ANIMATION_MS = 220;

export function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const previousValueRef = useRef<T | null>(null);
  const segmentWidth = trackWidth > 0 ? (trackWidth - INSET * 2) / options.length : 0;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  useEffect(() => {
    if (trackWidth === 0) return;
    indicatorX.set(withTiming(selectedIndex * segmentWidth, { duration: ANIMATION_MS }));

    if (previousValueRef.current !== null && previousValueRef.current !== value) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    previousValueRef.current = value;
  }, [value, trackWidth, segmentWidth, selectedIndex, indicatorX]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={handleLayout} style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <Animated.View
        style={[
          styles.indicator,
          { width: segmentWidth, backgroundColor: theme.accent },
          Shadows.glow(theme.accent),
          animatedIndicatorStyle,
        ]}
      />
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={styles.segment}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => option.value !== value && onChange(option.value)}>
          <ThemedText type="smallBold" themeColor={option.value === value ? 'accentText' : 'textSecondary'}>
            {option.label}
          </ThemedText>
        </Pressable>
      ))}
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
