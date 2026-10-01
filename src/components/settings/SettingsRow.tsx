import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SettingsRowProps = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  loading?: boolean;
  showDivider?: boolean;
  /** Rows that act immediately (like Sign Out) rather than open a screen hide the › arrow. */
  showChevron?: boolean;
};

export function SettingsRow({
  title,
  subtitle,
  onPress,
  destructive = false,
  loading = false,
  showDivider = false,
  showChevron = true,
}: SettingsRowProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const isDisabled = !onPress || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => {
        if (isDisabled) return;
        scale.set(withSpring(0.98, { duration: 150, dampingRatio: 0.8 }));
      }}
      onPressOut={() => {
        if (isDisabled) return;
        scale.set(withSpring(1, { duration: 150, dampingRatio: 0.8 }));
      }}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }}>
      <Animated.View style={[styles.row, animatedStyle]}>
        <View style={styles.textColumn}>
          <ThemedText type="default" themeColor={destructive ? 'danger' : undefined}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : showChevron ? (
          <ThemedText type="default" themeColor="textSecondary">
            ›
          </ThemedText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  textColumn: {
    flex: 1,
  },
});
