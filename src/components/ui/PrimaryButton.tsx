import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'accent' | 'danger' | 'muted';
  loading?: boolean;
};

export function PrimaryButton({
  label,
  variant = 'accent',
  loading = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const backgroundColor =
    variant === 'accent' ? theme.accent : variant === 'danger' ? theme.danger : theme.backgroundElement;
  const textColor = variant === 'muted' ? theme.text : Colors.dark.accentText;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={(state) => (typeof style === 'function' ? style(state) : style)}
      {...rest}>
      <Animated.View
        style={[
          styles.button,
          { backgroundColor },
          isDisabled && styles.disabled,
          !isDisabled && pressed && styles.pressed,
        ]}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <ThemedText type="smallBold" style={{ color: textColor }}>
            {label}
          </ThemedText>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
